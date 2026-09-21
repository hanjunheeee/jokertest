import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { completeSocialSignupApi, getSocialSignupIntentApi } from "../api/auth.api.js"
import { useAuthStore } from "../store/auth.store.js"
import { useSignupEmailVerification } from "./useSignupEmailVerification.js"
import { validateNickname, validateBirthDate } from "../validation/signupValidation.js"

// F-05: 소셜 로그인 최초 인증 이후, 닉네임 등 필수 정보를 보완해 가입을 완료하는 단계의
// 프론트 상태를 관리한다. intentToken은 콜백(F-06/F-07 제공자 연동)이 이 화면으로 넘겨주는
// 1회용 식별자로, 실제 라우팅 방식과 무관하게 이 훅은 문자열 하나만 받는다.
//
// F-31 AC-02: 제공자가 이메일을 검증해 주지 못한 가입(Google email_verified:false·Discord
// verified:false·이메일 미제공)은 이제 거부되지 않고 자체 메일 인증으로 보완된다. 그
// 필요 여부는 URL이나 클라이언트 추측이 아니라 서버의 비소비 intent 조회
// (getSocialSignupIntentApi)로만 판정하고, 인증 자체는 F-31b와 같은 공용 훅
// (useSignupEmailVerification)이 수행한다 — 이 훅은 그 결과를 완료 요청에 실어 보낸다.
//
// F-31b와 같은 원칙: 5xx 응답에 익숙한 code가 우연히 실려 와도 확정된 거부 사유로 보지
// 않는다(response.js가 서버 응답 status를 error.status로 싣는다). 서버가 실제로 약속한
// 거부는 4xx뿐이므로, 5xx면 code를 버리고 통신 실패로 처리한다.
const trustedErrorCode = (error) => (
  typeof error?.status === "number" && error.status >= 500 ? undefined : error?.code
)

// status: idle(입력 대기) | submitting(제출 중) | done(가입 완료) | expired(가입 자격 만료)
//         | cancelled(이미 처리된 요청) | conflict(이메일 충돌) | error(그 외 입력/서버 오류)
// intentStatus: loading(서버 intent 조회 중) | ready(조회 완료) | error(조회 실패, 재시도 가능)
export function useSocialSignup(intentToken) {
  const [status, setStatus] = useState("idle")
  const [errorMessage, setErrorMessage] = useState(null)
  const [intentStatus, setIntentStatus] = useState("loading")
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false)
  // 자체 인증이 필요한 경우에만 쓰이는 입력값이다 — 제공자가 확인한 이메일은 서버가 들고
  // 있으므로 화면에 내려오지 않는다.
  const [email, setEmail] = useState("")
  // 조회 실패 후 "다시 시도"를 누를 때마다 올라가, 아래 effect가 다시 돈다.
  const [intentAttempt, setIntentAttempt] = useState(0)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  // useLoginPage.isSubmitting과 같은 목적 — 제출 중 중복 클릭으로 같은 intentToken이
  // 두 번 소비 시도되는 것을 막는다(서버도 소비 시 원자적으로 거부하지만, 불필요한 요청을
  // 프론트에서부터 줄인다).
  const submittingRef = useRef(false)
  // intent 교체·재시도·언마운트마다 올라가, 이미 무효해진 조회의 늦은 응답이 화면 상태를
  // 되살리지 못하게 막는다(useSignupEmailVerification의 요청 세대와 같은 원칙).
  const intentGenerationRef = useRef(0)

  // F-31 AC-04: 인증 상태 머신은 로컬 가입과 같은 공용 훅을 쓴다 — 여기서 다시 구현하지
  // 않는다. active가 false이거나 이메일·가입 시도가 바뀌면 그 훅이 번호·증명을 폐기한다.
  const verification = useSignupEmailVerification({
    email,
    active: intentStatus === "ready" && emailVerificationRequired,
    attemptKey: `${typeof intentToken === "string" ? intentToken : ""}:${intentAttempt}`,
  })

  useEffect(() => {
    const generation = ++intentGenerationRef.current

    if (typeof intentToken !== "string" || !intentToken) {
      setIntentStatus("error")
      setStatus("expired")
      setErrorMessage("소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.")
      return undefined
    }

    setIntentStatus("loading")
    setEmailVerificationRequired(false)
    setEmail("")
    setStatus("idle")
    setErrorMessage(null)

    getSocialSignupIntentApi({ intentToken })
      .then((data) => {
        if (intentGenerationRef.current !== generation) return // 이미 무효화됨(교체·재시도·언마운트)
        // 계약 밖 응답은 "인증이 필요 없다"로 단정하지 않는다 — 조회 실패로 처리해
        // 사용자가 다시 시도하게 한다(인증 생략을 응답 모양으로 얻어낼 수 없다).
        if (typeof data?.emailVerificationRequired !== "boolean") {
          setIntentStatus("error")
          setErrorMessage("가입 정보를 불러오지 못했습니다. 다시 시도해주세요.")
          return
        }
        setEmailVerificationRequired(data.emailVerificationRequired)
        setIntentStatus("ready")
      })
      .catch((error) => {
        if (intentGenerationRef.current !== generation) return

        // 조회 단계에서도 완료와 같은 intent 오류 코드가 올 수 있다 — 그때는 재시도가
        // 아니라 로그인 화면으로 돌아가야 하므로 기존 status 분기를 그대로 쓴다.
        const code = trustedErrorCode(error)
        switch (code) {
          case "INTENT_EXPIRED":
          case "INTENT_INVALID":
            setIntentStatus("error")
            setStatus("expired")
            break
          case "INTENT_CONSUMED":
            setIntentStatus("error")
            setStatus("cancelled")
            break
          default:
            setIntentStatus("error")
        }
        setErrorMessage(
          code ? (error?.message || "가입 정보를 불러오지 못했습니다. 다시 시도해주세요.")
            : "가입 정보를 불러오지 못했습니다. 다시 시도해주세요.",
        )
      })

    return () => { intentGenerationRef.current += 1 }
  }, [intentToken, intentAttempt])

  const retryIntent = () => {
    if (typeof intentToken !== "string" || !intentToken) return
    setIntentAttempt((attempt) => attempt + 1)
  }

  const handleEmailChange = (e) => setEmail(e.target.value)

  // 조회가 끝나기 전에는 완료 제출을 막는다 — 자체 인증이 필요한지 모르는 상태로 완료를
  // 보내면, 서버가 증명 없는 요청을 거절하게 될 뿐 사용자는 이유를 알 수 없다.
  const canSubmit = (
    intentStatus === "ready"
    && status !== "submitting"
    && status !== "done"
    && (!emailVerificationRequired || verification.hasValidSignupProof)
  )

  const submit = async ({ nickname, birthDate }) => {
    if (submittingRef.current) return

    if (typeof intentToken !== "string" || !intentToken) {
      setStatus("expired")
      setErrorMessage("소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.")
      return
    }

    if (intentStatus !== "ready") {
      setStatus("error")
      setErrorMessage("가입 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.")
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

    // AC-02: 자체 인증이 필요한 intent는 인증을 마치기 전에는 완료 API 자체를 부르지 않는다.
    let verifiedPayload
    if (emailVerificationRequired) {
      verifiedPayload = verification.buildSignupPayload()
      if (!verifiedPayload) {
        setStatus("error")
        setErrorMessage("이메일 인증을 완료해주세요.")
        return
      }
    }

    submittingRef.current = true
    setStatus("submitting")
    setErrorMessage(null)
    try {
      const result = await completeSocialSignupApi({
        intentToken,
        nickname: nicknameResult.value,
        birthDate: birthDateValue,
        email: verifiedPayload?.email,
        signupProof: verifiedPayload?.signupProof,
      })
      // 계약 밖 200 응답(user 없음)은 가입 완료로 단정하지 않는다 — 로그인 상태를 만들지
      // 않고 오류로 남겨 사용자가 다시 시도하게 한다.
      const user = result?.user
      if (!user || typeof user !== "object") {
        setStatus("error")
        setErrorMessage("가입 결과를 확인할 수 없습니다. 다시 시도해주세요.")
        return
      }
      login(user)
      setStatus("done")
      navigate("/lobby")
    } catch (error) {
      // response.js가 서버의 code(INTENT_EXPIRED 등, backend/service/socialAuth.service.js
      // 참고)를 Error.code로 실어 준다 — 메시지 문자열이 아니라 code로 분기해야 서버 메시지
      // 문구가 바뀌어도 상태 분기가 깨지지 않는다.
      const code = trustedErrorCode(error)
      switch (code) {
        case "INTENT_EXPIRED":
          setStatus("expired")
          break
        case "INTENT_CONSUMED":
          setStatus("cancelled")
          break
        case "EMAIL_CONFLICT":
          setStatus("conflict")
          break
        case "SIGNUP_PROOF_REQUIRED":
        case "SIGNUP_PROOF_INVALID":
          // AC-02: 서버가 증명을 거부했다 — 이미 소비됐거나 만료된 증명이므로 화면에서도
          // 즉시 폐기하고 자체 인증 상태로 되돌린다(useLoginPage와 같은 처리).
          verification.reset()
          setStatus("error")
          break
        default:
          setStatus("error")
      }
      setErrorMessage(
        code === "SIGNUP_PROOF_REQUIRED" ? "이메일 인증이 필요합니다. 다시 인증해주세요."
          : code === "SIGNUP_PROOF_INVALID" ? "이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요."
            : code !== error?.code ? "서버와 통신할 수 없습니다. 다시 시도해주세요."
              : error?.message || "가입을 완료할 수 없습니다.",
      )
    } finally {
      submittingRef.current = false
    }
  }

  const reset = () => {
    submittingRef.current = false
    setStatus("idle")
    setErrorMessage(null)
  }

  return {
    status,
    errorMessage,
    submit,
    reset,
    // F-31: 서버 intent 조회 상태와 자체 인증 화면에 필요한 값들이다. signupProof는 여기
    // 어디에도 실리지 않는다(AC-05) — 공용 훅의 화면용 상태만 그대로 넘긴다.
    intentStatus,
    emailVerificationRequired,
    retryIntent,
    canSubmit,
    email,
    handleEmailChange,
    emailVerification: verification.signupEmailVerification,
    handleSignupCodeChange: verification.handleSignupCodeChange,
    handleRequestSignupCode: verification.handleRequestSignupCode,
    handleVerifySignupCode: verification.handleVerifySignupCode,
  }
}
