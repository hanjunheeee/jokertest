import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { checkEmailApi, getMeApi, loginApi, signupApi } from "../api/auth.api.js"
import { selectIsAuthenticated, useAuthStore } from "../store/auth.store.js"
import { validateSignupForm } from "../validation/signupValidation.js"

const INITIAL_FORM_DATA = { email: "", password: "", passwordConfirm: "", nickname: "", birthDate: "" }

// 가입 입력 단계의 이메일 중복 확인 상태를 관리합니다. SignupFields.jsx는 JSX라 이 저장소의
// node:test 실행(JSX 변환기 없음)으로는 직접 검증할 수 없으므로, 그 상태 로직만 여기 순수
// 훅으로 분리해 useLoginPage.test.js가 renderHook으로 검증할 수 있게 합니다.
// checkedEmail은 "이 결과가 어떤 이메일에 대한 것인지"를 기억해, 확인 이후 email이 바뀌면
// 이전 결과를 무효화(idle로 되돌림)하는 데 씁니다.
export function useEmailAvailabilityCheck(email) {
  const [status, setStatus] = useState("idle")
  const [checkedEmail, setCheckedEmail] = useState(null)

  useEffect(() => {
    if (checkedEmail !== null && checkedEmail !== email) {
      setStatus("idle")
      setCheckedEmail(null)
    }
  }, [email, checkedEmail])

  const check = async () => {
    const trimmed = email.trim()
    if (!trimmed) return

    setStatus("checking")
    setCheckedEmail(null)
    try {
      const { available } = await checkEmailApi(trimmed)
      setStatus(available ? "available" : "duplicate")
      setCheckedEmail(trimmed)
    } catch {
      setStatus("error")
      setCheckedEmail(null)
    }
  }

  return { status, check }
}

// LoginPage에서 필요한 상태와 이벤트 처리를 한곳에 모은 훅입니다.
export function useLoginPage() {
  // "로그인 상태 유지" 체크박스 선택 여부입니다.
  const [rememberMe, setRememberMe] = useState(false)

  // false면 로그인 폼, true면 회원가입 폼을 보여줍니다.
  const [isSignupMode, setIsSignupMode] = useState(false)

  // API 요청 중 중복 제출을 막기 위한 상태입니다.
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 로그인/회원가입 입력값을 한 객체로 관리합니다.
  const [formData, setFormData] = useState(INITIAL_FORM_DATA)

  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((state) => state.login)

  useEffect(() => {
    // 로그인 페이지에 들어오면 "사용자가 직접 로그아웃했다"는 표시를 초기화합니다.
    useAuthStore.getState().clearLoggedOutIntentionally()
  }, [])

  useEffect(() => {
    // 이미 로그인된 사용자가 로그인 페이지에 오면 현재 사용자 확인 후 로비로 보냅니다.
    if (!isAuthenticated) return
    getMeApi().then(() => navigate("/lobby", { replace: true })).catch(() => {})
  }, [isAuthenticated, navigate])

  // input의 name 값을 기준으로 formData의 같은 key를 업데이트합니다.
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // 현재 모드에 따라 로그인 또는 회원가입 요청을 보냅니다.
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return

    // 닉네임 길이/문자셋, 비밀번호 길이·확인 일치, 생년월일 유효성을 서버에 보내기 전에
    // 먼저 걸러낸다. 서버(backend/validation/signupValidation.js)도 같은 규칙을 다시
    // 검사하므로, 여기서는 빠른 실패로 불필요한 요청만 줄인다.
    if (isSignupMode) {
      const validation = validateSignupForm(formData)
      if (!validation.ok) {
        alert(validation.message)
        return
      }
    }

    setIsSubmitting(true)
    try {
      if (isSignupMode) {
        await signupApi(formData)
        alert("회원가입이 완료되었습니다! 로그인해주세요.")
        setIsSignupMode(false)
      } else {
        const { user } = await loginApi({ ...formData, rememberMe })
        login(user)
        navigate("/lobby")
      }
    } catch (error) {
      console.error("API 통신 에러")
      alert(error.message || "서버와 연결할 수 없습니다.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    formData,
    rememberMe,
    isSignupMode,
    handleInputChange,
    handleSubmit,
    setRememberMe,
    setIsSignupMode,
  }
}
