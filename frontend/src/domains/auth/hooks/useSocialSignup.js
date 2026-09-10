import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { completeSocialSignupApi } from "../api/auth.api.js"
import { useAuthStore } from "../store/auth.store.js"
import { validateNickname, validateBirthDate } from "../validation/signupValidation.js"

// F-05: 소셜 로그인 최초 인증 이후, 닉네임 등 필수 정보를 보완해 가입을 완료하는 단계의
// 프론트 상태를 관리한다. intentToken은 콜백(F-06/F-07 제공자 연동)이 이 화면으로 넘겨주는
// 1회용 식별자로, 실제 라우팅 방식과 무관하게 이 훅은 문자열 하나만 받는다.
//
// status: idle(입력 대기) | submitting(제출 중) | done(가입 완료) | expired(가입 자격 만료)
//         | cancelled(이미 처리된 요청) | conflict(이메일 충돌) | error(그 외 입력/서버 오류)
export function useSocialSignup(intentToken) {
  const [status, setStatus] = useState("idle")
  const [errorMessage, setErrorMessage] = useState(null)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  // useLoginPage.isSubmitting과 같은 목적 — 제출 중 중복 클릭으로 같은 intentToken이
  // 두 번 소비 시도되는 것을 막는다(서버도 소비 시 원자적으로 거부하지만, 불필요한 요청을
  // 프론트에서부터 줄인다).
  const submittingRef = useRef(false)

  const submit = async ({ nickname, birthDate }) => {
    if (submittingRef.current) return

    if (typeof intentToken !== "string" || !intentToken) {
      setStatus("expired")
      setErrorMessage("소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.")
      return
    }

    const nicknameResult = validateNickname(nickname)
    if (!nicknameResult.ok) {
      setStatus("error")
      setErrorMessage(nicknameResult.message)
      return
    }

    let birthDateValue
    if (birthDate) {
      const birthDateResult = validateBirthDate(birthDate)
      if (!birthDateResult.ok) {
        setStatus("error")
        setErrorMessage(birthDateResult.message)
        return
      }
      birthDateValue = birthDateResult.value
    }

    submittingRef.current = true
    setStatus("submitting")
    setErrorMessage(null)
    try {
      const { user } = await completeSocialSignupApi({
        intentToken,
        nickname: nicknameResult.value,
        birthDate: birthDateValue,
      })
      login(user)
      setStatus("done")
      navigate("/lobby")
    } catch (error) {
      // response.js가 서버의 code(INTENT_EXPIRED 등, backend/service/socialAuth.service.js
      // 참고)를 Error.code로 실어 준다 — 메시지 문자열이 아니라 code로 분기해야 서버 메시지
      // 문구가 바뀌어도 상태 분기가 깨지지 않는다.
      switch (error?.code) {
        case "INTENT_EXPIRED":
          setStatus("expired")
          break
        case "INTENT_CONSUMED":
          setStatus("cancelled")
          break
        case "EMAIL_CONFLICT":
          setStatus("conflict")
          break
        default:
          setStatus("error")
      }
      setErrorMessage(error?.message || "가입을 완료할 수 없습니다.")
    } finally {
      submittingRef.current = false
    }
  }

  const reset = () => {
    submittingRef.current = false
    setStatus("idle")
    setErrorMessage(null)
  }

  return { status, errorMessage, submit, reset }
}
