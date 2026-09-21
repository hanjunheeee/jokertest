import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  checkEmailApi, getMeApi, loginApi, requestSignupCodeApi, signupApi, verifySignupCodeApi,
} from "../api/auth.api.js"
import { selectIsAuthenticated, useAuthStore } from "../store/auth.store.js"
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

// F-31b(AC-02/AC-03): 가입 이메일 인증번호 발송·확인 상태 머신의 초기값입니다. 화면
// 수명 동안만 존재하는 값이라 formData·auth store 어디에도 넣지 않습니다(AC-05) —
// signupProof는 이 객체 안에만 있다가 handleSubmit이 가입 요청 body를 만들 때 한 번
// 읽힙니다.
const INITIAL_EMAIL_VERIFICATION = {
  // unverified → sending → codeSent → verifying → verified
  //                  ↑         ↓  (오답/만료/시도초과)
  //                  └── codeExpired · locked (대기 종료 후 재발송 가능, 확인은 불가)
  stage: "unverified",
  email: "", // 이 상태가 유효한 이메일(발송 대상) — formData.email과 다르면 재인증이 필요합니다.
  code: "",
  signupProof: null,
  resendAvailableAt: null, // 절대 시각(ms). 재발송 가능 시각.
  codeExpiresAt: null, // 절대 시각(ms). codeSent일 때만 의미가 있습니다.
  attemptsRemaining: null,
  message: "",
}

const SIGNUP_EMAIL_MAX_LENGTH = 100 // backend/validation/signupEmailVerificationValidation.js와 동일한 상한.

// backend/validation/signupEmailVerificationValidation.js::validateEmailFormat과 동일한
// 규칙입니다 — 서버가 INVALID_INPUT으로 거부할 입력을 발송 전에 걸러 불필요한 요청을
// 줄입니다(최종 판정은 여전히 서버가 내립니다).
function isValidSignupEmailFormat(email) {
  if (typeof email !== "string") return false
  const trimmed = email.trim()
  if (!trimmed || trimmed.length > SIGNUP_EMAIL_MAX_LENGTH) return false
  if (/\s/.test(trimmed)) return false

  const atIndex = trimmed.indexOf("@")
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return false

  const domain = trimmed.slice(atIndex + 1)
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return false

  return true
}

const GENERIC_SIGNUP_CODE_RETRY_MESSAGE = "서버와 통신할 수 없습니다. 다시 시도해주세요."

// POST /auth/signup/email-code 실패를 화면에 보여줄 안내로 옮깁니다.
function describeSignupCodeRequestError(error) {
  if (error?.code === "RESEND_TOO_SOON" && Number.isFinite(error.resendAfterSec)) {
    return { kind: "RESEND_TOO_SOON", resendAfterSec: error.resendAfterSec }
  }
  if (error?.code === "RATE_LIMITED") return { kind: "RATE_LIMITED" }
  if (error?.code === "INVALID_INPUT") return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
}

// POST /auth/signup/email-code/verify 실패를 화면에 보여줄 안내로 옮깁니다.
function describeSignupCodeVerifyError(error) {
  if (error?.code === "CODE_INVALID") {
    return { kind: "CODE_INVALID", attemptsRemaining: Number.isFinite(error.attemptsRemaining) ? error.attemptsRemaining : null }
  }
  if (error?.code === "CODE_EXPIRED") return { kind: "CODE_EXPIRED" }
  if (error?.code === "TOO_MANY_ATTEMPTS") return { kind: "TOO_MANY_ATTEMPTS" }
  if (error?.code === "RATE_LIMITED") return { kind: "RATE_LIMITED" }
  if (error?.code === "INVALID_INPUT") return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
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

  // F-31b: 가입 이메일 인증 상태 머신입니다. AC-05에 따라 signupProof는 이 state에만
  // 존재하고, 아래 return에서는 signupProof를 뺀 부분집합만 화면에 넘깁니다.
  const [emailVerification, setEmailVerification] = useState(INITIAL_EMAIL_VERIFICATION)
  // 이메일 변경·재발송·모드 이탈마다 증가해, 이미 무효화된 요청의 늦은 응답이 최신 상태를
  // 덮어쓰지 못하게 막습니다(A→B→A, 진행 중 주소 변경 포함).
  const verificationGenerationRef = useRef(0)
  // 더블 클릭 등 연속 클릭으로 같은 요청이 중복 발사되지 않게 막는 동기 잠금입니다.
  const verificationRequestInFlightRef = useRef(false)
  // 재발송 대기·인증번호 만료 카운트다운을 1초마다 다시 그리기 위한 트리거입니다 — 값
  // 자체는 읽지 않고 setState 호출로 리렌더만 유발합니다.
  const [, forceVerificationTick] = useState(0)

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

  // AC-04: 회원가입 모드를 벗어나면(로그인 모드 전환) 인증 상태를 완전히 지웁니다. 훅
  // 자체는 모드를 바꿔도 언마운트되지 않으므로, 이걸 하지 않으면 이전 가입 시도의 인증
  // 결과가 다음 가입 재진입까지 남아 재인증을 요구하지 못합니다.
  useEffect(() => {
    if (isSignupMode) return
    verificationGenerationRef.current += 1
    setEmailVerification(INITIAL_EMAIL_VERIFICATION)
  }, [isSignupMode])

  // AC-03: 재발송 대기·인증번호 만료 카운트다운을 화면에 살아있게 보여주기 위한 1초
  // 간격 타이머입니다. codeSent에서 만료 시각을 지나면 codeExpired로 전이시키고, 그
  // 외에는(codeExpired·locked의 재발송 대기 카운트다운 표시용) 리렌더만 유발합니다.
  useEffect(() => {
    const relevantStages = new Set(["codeSent", "codeExpired", "locked"])
    if (!relevantStages.has(emailVerification.stage)) return undefined

    const id = setInterval(() => {
      setEmailVerification((prev) => {
        if (prev.stage === "codeSent" && prev.codeExpiresAt !== null && Date.now() >= prev.codeExpiresAt) {
          return { ...prev, stage: "codeExpired", message: "인증번호가 만료되었습니다. 다시 받아주세요." }
        }
        return prev
      })
      forceVerificationTick((tick) => tick + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [emailVerification.stage])

  // input의 name 값을 기준으로 formData의 같은 key를 업데이트합니다.
  const handleInputChange = (e) => {
    const { name, value } = e.target

    // AC-04: 이메일 입력이 실제로 바뀌면(대소문자·공백만 바뀌어도) 인증 상태를 전부
    // 초기화합니다 — A→B→A로 되돌아가도 각 전이마다 초기화가 일어나므로 이전 인증이
    // 그대로 되살아나지 않습니다. generation을 먼저 올려 진행 중이던 발송·확인 응답이
    // 나중에 도착해도 무시되게 합니다.
    if (name === "email" && value !== formData.email) {
      verificationGenerationRef.current += 1
      setEmailVerification(INITIAL_EMAIL_VERIFICATION)
    }

    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // 인증번호 입력칸 전용 변경 핸들러입니다. formData가 아니라 emailVerification.code를
  // 갱신합니다.
  const handleSignupCodeChange = (e) => {
    const { value } = e.target
    setEmailVerification((prev) => ({ ...prev, code: value }))
  }

  // 인증번호를 발송(최초)하거나 재발송합니다.
  const handleRequestSignupCode = async () => {
    const email = formData.email
    const current = emailVerification

    // 허용 상태 검사: 이미 진행 중이거나 인증이 끝난 상태에서는 새로 발송하지 않습니다.
    if (current.stage === "sending" || current.stage === "verifying" || current.stage === "verified") return
    if (!isValidSignupEmailFormat(email)) return
    if (verificationRequestInFlightRef.current) return
    // 이벤트 진입 시점에 재발송 대기를 다시 검사합니다(타이머 리렌더가 늦었을 수 있음).
    if (current.resendAvailableAt !== null && Date.now() < current.resendAvailableAt) return

    verificationRequestInFlightRef.current = true
    const requestGeneration = ++verificationGenerationRef.current
    const stageBeforeSend = current.stage
    const isResend = stageBeforeSend !== "unverified"

    setEmailVerification((prev) => ({
      ...prev,
      stage: "sending",
      email,
      code: isResend ? "" : prev.code, // 재발송이면 이전에 입력하던 번호를 비웁니다.
      message: "",
    }))

    try {
      const result = await requestSignupCodeApi({ email })
      if (verificationGenerationRef.current !== requestGeneration) return // 이미 무효화됨

      if (result?.ok === true && Number.isFinite(result.resendAfterSec) && Number.isFinite(result.expiresInSec)) {
        const now = Date.now()
        setEmailVerification((prev) => ({
          ...prev,
          stage: "codeSent",
          email,
          resendAvailableAt: now + result.resendAfterSec * 1000,
          codeExpiresAt: now + result.expiresInSec * 1000,
          attemptsRemaining: null,
          message: "",
        }))
        return
      }

      // 계약 밖 응답(ok 누락·false, 잘못된 수치)은 특정 실패로 단정하지 않고 재시도를 안내합니다.
      setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
    } catch (error) {
      if (verificationGenerationRef.current !== requestGeneration) return

      const described = describeSignupCodeRequestError(error)
      if (described.kind === "RESEND_TOO_SOON") {
        // A-03: 이전 만료 시각을 모르면(예: 첫 시도부터 RESEND_TOO_SOON) 임의로 지어내지
        // 않습니다 — codeExpiresAt은 건드리지 않고 서버의 확인 응답이 만료를 판정합니다.
        setEmailVerification((prev) => ({
          ...prev,
          stage: stageBeforeSend === "unverified" ? "codeSent" : stageBeforeSend,
          email,
          resendAvailableAt: Date.now() + described.resendAfterSec * 1000,
          message: `${described.resendAfterSec}초 후 재발송할 수 있습니다.`,
        }))
      } else if (described.kind === "RATE_LIMITED") {
        setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }))
      } else if (described.kind === "INVALID_INPUT") {
        setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: "입력을 확인해주세요." }))
      } else {
        setEmailVerification((prev) => ({ ...prev, stage: stageBeforeSend, message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
      }
    } finally {
      verificationRequestInFlightRef.current = false
    }
  }

  // 입력한 인증번호를 서버에 확인받습니다.
  const handleVerifySignupCode = async () => {
    const current = emailVerification
    // codeExpired·locked에서는 확인 자체를 막습니다 — 재발송만 가능합니다.
    if (current.stage !== "codeSent") return
    if (!current.code) return
    if (verificationRequestInFlightRef.current) return

    // 이벤트 진입 시점에 만료를 다시 검사합니다(타이머 리렌더가 아직 안 왔을 수 있음).
    if (current.codeExpiresAt !== null && Date.now() >= current.codeExpiresAt) {
      setEmailVerification((prev) => (
        prev.stage === "codeSent"
          ? { ...prev, stage: "codeExpired", message: "인증번호가 만료되었습니다. 다시 받아주세요." }
          : prev
      ))
      return
    }

    verificationRequestInFlightRef.current = true
    const requestGeneration = verificationGenerationRef.current
    const email = current.email
    const code = current.code

    setEmailVerification((prev) => ({ ...prev, stage: "verifying", message: "" }))

    try {
      const result = await verifySignupCodeApi({ email, code })
      if (verificationGenerationRef.current !== requestGeneration) return

      if (result?.ok === true && typeof result.signupProof === "string" && result.signupProof) {
        setEmailVerification((prev) => ({ ...prev, stage: "verified", signupProof: result.signupProof, message: "" }))
        return
      }

      // 계약 밖 응답(빈 증명 등)은 특정 실패로 단정하지 않고 입력을 유지한 채 재시도를 안내합니다.
      setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
    } catch (error) {
      if (verificationGenerationRef.current !== requestGeneration) return

      const described = describeSignupCodeVerifyError(error)
      if (described.kind === "CODE_INVALID") {
        setEmailVerification((prev) => ({
          ...prev,
          stage: "codeSent",
          attemptsRemaining: described.attemptsRemaining,
          message: described.attemptsRemaining !== null
            ? `인증번호가 올바르지 않습니다. (남은 시도 ${described.attemptsRemaining}회)`
            : "인증번호가 올바르지 않습니다.",
        }))
      } else if (described.kind === "CODE_EXPIRED") {
        setEmailVerification((prev) => ({ ...prev, stage: "codeExpired", message: "인증번호가 만료되었습니다. 다시 받아주세요." }))
      } else if (described.kind === "TOO_MANY_ATTEMPTS") {
        setEmailVerification((prev) => ({ ...prev, stage: "locked", message: "오입력 횟수를 초과했습니다. 다시 받아주세요." }))
      } else if (described.kind === "RATE_LIMITED") {
        setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." }))
      } else if (described.kind === "INVALID_INPUT") {
        setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: "입력을 확인해주세요." }))
      } else {
        setEmailVerification((prev) => ({ ...prev, stage: "codeSent", message: GENERIC_SIGNUP_CODE_RETRY_MESSAGE }))
      }
    } finally {
      verificationRequestInFlightRef.current = false
    }
  }

  // AC-01: verified 상태이면서 그 증명이 지금 이메일 입력값에 대한 것일 때만 제출을
  // 허용합니다. 이메일을 인증 이후에 바꾸면 handleInputChange가 이미 상태를 초기화하므로
  // 이 조건은 사실상 "verified"와 같아지지만, 방어적으로 이메일 일치까지 재확인합니다.
  const hasValidSignupProof = (
    emailVerification.stage === "verified"
    && emailVerification.email === formData.email
    && typeof emailVerification.signupProof === "string"
    && emailVerification.signupProof.length > 0
  )

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

      // AC-01: 이메일 인증을 마치지 않았으면(또는 그 사이 이메일을 바꿔 인증이
      // 초기화됐으면) API를 호출하지 않고 여기서 막습니다 — Enter 제출·강제 form
      // submit으로 버튼의 disabled를 우회해도 이 검사가 최종 방어선입니다.
      if (!hasValidSignupProof) {
        alert("이메일 인증을 완료해주세요.")
        return
      }
    }

    setIsSubmitting(true)
    try {
      if (isSignupMode) {
        const signupProof = emailVerification.signupProof
        const result = await signupApi({ ...formData, signupProof })
        if (result?.success !== true) {
          alert("서버와 연결할 수 없습니다. 다시 시도해주세요.")
          return
        }
        alert("회원가입이 완료되었습니다! 로그인해주세요.")
        setIsSignupMode(false)
        // AC-05: 가입 증명·번호는 성공 즉시(1회용) 폐기합니다 — 성공 응답을 재사용해
        // 다시 제출할 수 없게 generation도 함께 올립니다.
        verificationGenerationRef.current += 1
        setEmailVerification(INITIAL_EMAIL_VERIFICATION)
      } else {
        const { user } = await loginApi({ ...formData, rememberMe })
        login(user)
        navigate("/lobby")
      }
    } catch (error) {
      if (isSignupMode && (error.code === "SIGNUP_PROOF_REQUIRED" || error.code === "SIGNUP_PROOF_INVALID")) {
        // 서버가 증명을 거부했습니다 — 이미 소비됐거나 만료된 증명이므로 화면에 남겨두면
        // 안 됩니다(AC-05). 재인증을 요구합니다.
        verificationGenerationRef.current += 1
        setEmailVerification(INITIAL_EMAIL_VERIFICATION)
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
  }

  // AC-03: 화면에 보여줄 카운트다운은 절대 시각에서 매 렌더마다 다시 계산합니다 — 위
  // 1초 타이머가 리렌더를 유발할 때마다 최신 값으로 갱신됩니다.
  const nowForCountdown = Date.now()
  const resendRemainingSec = emailVerification.resendAvailableAt !== null
    ? Math.max(0, Math.ceil((emailVerification.resendAvailableAt - nowForCountdown) / 1000))
    : 0
  const codeRemainingSec = (emailVerification.stage === "codeSent" && emailVerification.codeExpiresAt !== null)
    ? Math.max(0, Math.ceil((emailVerification.codeExpiresAt - nowForCountdown) / 1000))
    : null

  return {
    formData,
    rememberMe,
    isSignupMode,
    handleInputChange,
    handleSubmit,
    setRememberMe,
    setIsSignupMode,
    // F-31b: signupProof는 절대 포함하지 않습니다(AC-05) — 화면에 필요한 상태만 내보냅니다.
    signupEmailVerification: {
      stage: emailVerification.stage,
      code: emailVerification.code,
      message: emailVerification.message,
      attemptsRemaining: emailVerification.attemptsRemaining,
      resendRemainingSec,
      codeRemainingSec,
    },
    handleSignupCodeChange,
    handleRequestSignupCode,
    handleVerifySignupCode,
    canSubmitSignup: hasValidSignupProof && !isSubmitting,
  }
}
