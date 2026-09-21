import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { checkEmailApi, getMeApi, loginApi, signupApi } from "../api/auth.api.js"
import { selectIsAuthenticated, useAuthStore } from "../store/auth.store.js"
import { useSignupEmailVerification } from "./useSignupEmailVerification.js"
import { validateSignupForm } from "../validation/signupValidation.js"

const INITIAL_FORM_DATA = { email: "", password: "", passwordConfirm: "", nickname: "", birthDate: "" }

// F-06/F-07 AC-04: 서버(user.controller.js googleAuthCallback/discordAuthCallback)가 실어
// 보내는 socialError 코드를 사용자가 이해할 수 있는 문구로 옮긴다. 서버가 낼 수 있는 코드를
// 유한 집합으로 미리 정의해 두고(경계 매핑), 이 목록에 없는 값이 와도 조용히 숨기지 않고
// 안전한 기본 문구로 대체한다.
//
// F-07 R-IMPL: OAUTH_CANCELLED/EMAIL_MISSING/PROVIDER_INVALID/STATE_*는 어느 제공자로
// 실패했는지와 무관하게 socialAuth.service.js(F-05 공통)가 내는 같은 코드다 — Google 최초
// 구현 시점엔 Google만 있어 문구에 "Google"을 못박았지만, 이제 Discord도 같은 코드를 낼 수
// 있으므로 제공자 이름을 박지 않은 문구로 되돌린다(그렇지 않으면 Discord 로그인 취소가
// "Google 로그인을 취소했습니다"로 잘못 안내된다). GOOGLE_*/DISCORD_* 접두 코드는 각
// 제공자 어댑터(googleOAuth.service.js/discordOAuth.service.js)만 내는 값이라 그대로
// 제공자 이름을 명시한다.
//
// F-31 AC-02: EMAIL_MISSING은 이제 신규 소셜 가입에서는 나오지 않는다(제공자가 이메일을
// 검증해 주지 못하면 거부 대신 자체 메일 인증으로 보완한다) — 다만 기존 배포·다른 경로가
// 이 코드를 실어 보낼 수 있으므로 문구 자체는 그대로 남겨 둔다.
export const SOCIAL_ERROR_MESSAGES = {
  OAUTH_CANCELLED: "소셜 로그인을 취소했습니다.",
  STATE_MISSING: "로그인 요청 정보가 없습니다. 다시 시도해주세요.",
  STATE_INVALID: "로그인 요청이 유효하지 않습니다. 다시 시도해주세요.",
  STATE_EXPIRED: "로그인 요청이 만료되었습니다. 다시 시도해주세요.",
  STATE_REUSED: "이미 처리된 로그인 요청입니다. 다시 시도해주세요.",
  STATE_FINGERPRINT_MISMATCH: "요청 출처가 일치하지 않습니다. 다시 시도해주세요.",
  EMAIL_CONFLICT: "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 연결해주세요.",
  EMAIL_MISSING: "소셜 계정에서 이메일 정보를 받지 못했습니다.",
  PROVIDER_INVALID: "소셜 로그인 정보를 확인할 수 없습니다.",
  GOOGLE_OAUTH_NOT_CONFIGURED: "지금은 Google 로그인을 사용할 수 없습니다.",
  GOOGLE_CODE_MISSING: "Google 인증 정보가 없습니다. 다시 시도해주세요.",
  GOOGLE_TOKEN_EXCHANGE_FAILED: "Google 인증에 실패했습니다. 다시 시도해주세요.",
  GOOGLE_PROFILE_FETCH_FAILED: "Google 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  GOOGLE_PROFILE_INVALID: "Google 계정 정보를 확인할 수 없습니다.",
  GOOGLE_OAUTH_TIMEOUT: "Google 응답이 지연되었습니다. 다시 시도해주세요.",
  DISCORD_OAUTH_NOT_CONFIGURED: "지금은 Discord 로그인을 사용할 수 없습니다.",
  DISCORD_CODE_MISSING: "Discord 인증 정보가 없습니다. 다시 시도해주세요.",
  DISCORD_TOKEN_EXCHANGE_FAILED: "Discord 인증에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_FETCH_FAILED: "Discord 프로필 조회에 실패했습니다. 다시 시도해주세요.",
  DISCORD_PROFILE_INVALID: "Discord 계정 정보를 확인할 수 없습니다.",
  DISCORD_OAUTH_TIMEOUT: "Discord 응답이 지연되었습니다. 다시 시도해주세요.",
}
export const DEFAULT_SOCIAL_ERROR_MESSAGE = "소셜 로그인에 실패했습니다. 다시 시도해주세요."

export function mapSocialErrorCode(code) {
  // 재검토 지적(R-IMPL, Chrome 재현: /login?socialError=__proto__ → React #31): 일반
  // 객체를 대괄호 표기법으로 색인하면 own property가 아닌 상속 키(__proto__·constructor·
  // toString·hasOwnProperty 등)까지 값으로 튀어나올 수 있고, 그 값은 문자열이 아니라
  // 객체/함수라 그대로 JSX에 렌더링하면 "Objects are not valid as a React child"(#31)로
  // 크래시한다. hasOwnProperty 가드로 이 목록에 실제로 정의한 own key만 신뢰한다.
  if (typeof code === "string" && Object.prototype.hasOwnProperty.call(SOCIAL_ERROR_MESSAGES, code)) {
    return SOCIAL_ERROR_MESSAGES[code]
  }
  return DEFAULT_SOCIAL_ERROR_MESSAGE
}

// F-06 AC-02: 로그인 화면 URL 쿼리(socialIntent/socialError)를 화면이 그려야 할 모드로
// 번역한다. 실제 쿼리 파싱(useSearchParams)은 페이지가 하고, 이 함수는 이미 꺼낸 값만 받아
// 순수하게 판정한다 — 이 저장소의 node:test 실행에는 JSX 변환기가 없어 LoginPage.jsx를
// 직접 렌더링해 검증할 수 없으므로(위 useEmailAvailabilityCheck와 같은 이유), 그 판정
// 로직만 여기 순수 함수로 분리해 둔다.
export function resolveSocialLoginView({ socialIntent, socialError } = {}) {
  if (typeof socialIntent === "string" && socialIntent) {
    return { mode: "socialSignup", intentToken: socialIntent }
  }
  if (typeof socialError === "string" && socialError) {
    return { mode: "socialError", message: mapSocialErrorCode(socialError) }
  }
  return { mode: "default" }
}

// 가입 입력 단계의 이메일 중복 확인 상태를 관리합니다. SignupFields.jsx는 JSX라 이 저장소의
// node:test 실행(JSX 변환기 없음)으로는 직접 검증할 수 없으므로, 그 상태 로직만 여기 순수
// 훅으로 분리해 useLoginPage.test.js가 renderHook으로 검증할 수 있게 합니다.
// checkedEmail은 "이 결과가 어떤 이메일에 대한 것인지"를 기억해, 확인 이후 email이 바뀌면
// 이전 결과를 무효화(idle로 되돌림)하는 데 씁니다.
export function useEmailAvailabilityCheck(email) {
  const [status, setStatus] = useState("idle")
  const [checkedEmail, setCheckedEmail] = useState(null)

  // check()를 연달아 누르거나(더블 클릭) 응답을 기다리는 중 이메일을 바꿔 다시 누르면
  // 여러 요청이 동시에 떠 있을 수 있다. 나중에 보낸 요청의 응답이 먼저 온 요청의 응답보다
  // 먼저 도착할 순서 보장은 없다. 이전에는 "가장 마지막으로 보낸 요청의 이메일 문자열"을
  // 기억해 뒀는데, 같은 이메일로 두 번 연달아 누르면(예: 더블 클릭) 두 요청의 이메일 값이
  // 같아 오래된 응답이 뒤늦게 도착해도 걸러지지 않았다(재검토 지적) — 이메일 값이 아니라
  // 매 호출마다 증가하는 요청 번호로 "가장 마지막 요청"을 식별해야 같은 이메일의 연속
  // 요청도 구분된다.
  const latestRequestId = useRef(0)

  useEffect(() => {
    if (checkedEmail !== null && checkedEmail !== email) {
      setStatus("idle")
      setCheckedEmail(null)
    }
  }, [email, checkedEmail])

  const check = async () => {
    const trimmed = email.trim()
    if (!trimmed) return

    const requestId = ++latestRequestId.current
    setStatus("checking")
    setCheckedEmail(null)
    try {
      const { available } = await checkEmailApi(trimmed)
      if (latestRequestId.current !== requestId) return
      setStatus(available ? "available" : "duplicate")
      setCheckedEmail(trimmed)
    } catch {
      if (latestRequestId.current !== requestId) return
      setStatus("error")
      setCheckedEmail(null)
    }
  }

  return { status, check }
}

// F-31(AC-04): F-31b의 가입 이메일 인증 상태 머신(단계 전이·요청 세대·중복 방지·
// 카운트다운·오류 해석·증명 폐기)은 이제 useSignupEmailVerification.js 한 곳에만
// 있습니다 — 로컬 가입(이 훅)과 소셜 가입 보완(useSocialSignup.js)이 같은 구현을 씁니다.
// 이 훅은 그 공용 훅에 "지금 이메일·가입 모드인지"만 전달하고, 기존 반환 필드와 가입
// payload 구성(signupApi에 signupProof를 싣는 자리)은 그대로 유지합니다.

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

  // F-31b/F-31: 가입 이메일 인증 상태 머신입니다(공용 훅). AC-05에 따라 signupProof는 그
  // 훅의 state에만 존재하고, 화면에는 signupProof를 뺀 부분집합만 넘어갑니다. 이메일
  // 변경(대소문자·공백만 바뀌어도)과 가입 모드 이탈 시의 초기화·요청 세대 무효화도 그
  // 훅이 email·active를 보고 직접 수행합니다(AC-04).
  const {
    signupEmailVerification,
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    hasValidSignupProof,
    buildSignupPayload,
    reset: resetSignupEmailVerification,
  } = useSignupEmailVerification({ email: formData.email, active: isSignupMode })

  // 재검토 지적(AC-02): isSubmitting은 React state라 리렌더 전에는 같은 클로저가 이전 값을
  // 그대로 들고 있다 — 같은 틱에 handleSubmit이 두 번 호출되면(더블 클릭 등) 둘 다 그
  // 리렌더 전 값을 읽어 검사를 통과할 수 있다. ref는 동기적으로 갱신·공유되므로 이 경합을
  // 막는다.
  const submitInFlightRef = useRef(false)

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

  // input의 name 값을 기준으로 formData의 같은 key를 업데이트합니다. 이메일이 바뀌었을 때의
  // 인증 초기화는 공용 훅이 email 값 자체를 보고 수행하므로 여기서 따로 하지 않습니다.
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // 현재 모드에 따라 로그인 또는 회원가입 요청을 보냅니다.
  const handleSubmit = async (e) => {
    e.preventDefault()
    // 재검토 지적(AC-02): 아래 isSubmitting state 검사보다 먼저 동기 ref로 막습니다 —
    // 같은 틱에 두 번 호출돼도(예: 더블 클릭) 두 호출 모두 리렌더 전 state 클로저를 보게
    // 되어 state만으로는 중복 호출을 막을 수 없습니다.
    if (submitInFlightRef.current) return
    if (isSubmitting) return
    submitInFlightRef.current = true

    try {
      // 닉네임 길이/문자셋, 비밀번호 길이·확인 일치, 생년월일 유효성을 서버에 보내기 전에
      // 먼저 걸러낸다. 서버(backend/validation/signupValidation.js)도 같은 규칙을 다시
      // 검사하므로, 여기서는 빠른 실패로 불필요한 요청만 줄인다.
      let signupPayload = null
      if (isSignupMode) {
        const validation = validateSignupForm(formData)
        if (!validation.ok) {
          alert(validation.message)
          return
        }

        // AC-01: 이메일 인증을 마치지 않았으면(또는 그 사이 이메일을 바꿔 인증이
        // 초기화됐으면) API를 호출하지 않고 여기서 막습니다 — Enter 제출·강제 form
        // submit으로 버튼의 disabled를 우회해도 이 검사가 최종 방어선입니다.
        signupPayload = buildSignupPayload()
        if (!signupPayload) {
          alert("이메일 인증을 완료해주세요.")
          return
        }
      }

      setIsSubmitting(true)
      try {
        if (isSignupMode) {
          const result = await signupApi({ ...formData, signupProof: signupPayload.signupProof })
          if (result?.success !== true) {
            alert("서버와 연결할 수 없습니다. 다시 시도해주세요.")
            return
          }
          alert("회원가입이 완료되었습니다! 로그인해주세요.")
          setIsSignupMode(false)
          // AC-05: 가입 증명·번호는 성공 즉시(1회용) 폐기합니다 — 성공 응답을 재사용해
          // 다시 제출할 수 없게 요청 세대도 함께 올라갑니다(공용 훅의 reset).
          resetSignupEmailVerification()
        } else {
          const { user } = await loginApi({ ...formData, rememberMe })
          login(user)
          navigate("/lobby")
        }
      } catch (error) {
        if (isSignupMode && (error.code === "SIGNUP_PROOF_REQUIRED" || error.code === "SIGNUP_PROOF_INVALID")) {
          // 서버가 증명을 거부했습니다 — 이미 소비됐거나 만료된 증명이므로 화면에 남겨두면
          // 안 됩니다(AC-05). 재인증을 요구합니다.
          resetSignupEmailVerification()
          alert(
            error.code === "SIGNUP_PROOF_REQUIRED"
              ? "이메일 인증이 필요합니다. 다시 인증해주세요."
              : "이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요.",
          )
        } else {
          console.error("API 통신 에러")
          alert(error.message || "서버와 연결할 수 없습니다.")
        }
      } finally {
        setIsSubmitting(false)
      }
    } finally {
      submitInFlightRef.current = false
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
    // F-31b: signupProof는 절대 포함하지 않습니다(AC-05) — 공용 훅이 화면용 부분집합만
    // 돌려주고, 그 객체를 그대로 내보냅니다.
    signupEmailVerification,
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    canSubmitSignup: hasValidSignupProof && !isSubmitting,
  }
}
