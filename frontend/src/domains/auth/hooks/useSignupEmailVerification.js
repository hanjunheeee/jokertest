import { useEffect, useRef, useState } from "react"
import { requestSignupCodeApi, verifySignupCodeApi } from "../api/auth.api.js"

// F-31(AC-04): F-31b가 useLoginPage.js 안에 만들었던 가입 이메일 인증 상태 머신을 그대로
// 이 훅으로 옮긴 것입니다 — 로직을 다시 구현하지 않고 한 구현을 두 곳(로컬 가입
// useLoginPage, 소셜 가입 보완 useSocialSignup)이 공유합니다. 서버 쪽 발송·빈도 제한·
// 증명 발급(F-31a)도 그대로 재사용하며, 이 훅은 기존 requestSignupCodeApi/
// verifySignupCodeApi만 호출합니다.
//
// 입력:
//   email      — 지금 인증 대상이 되는 이메일 주소(호출부의 입력값). 값이 바뀌면 인증
//                상태를 전부 초기화합니다(AC-04: A→B→A로 되돌아가도 매 전이마다 초기화).
//   active     — 이 인증 흐름이 화면에 살아있는지. false가 되면(모드 이탈 등) 번호·증명을
//                폐기합니다.
//   attemptKey — "같은 화면 안의 다른 가입 시도"를 구분하는 값(소셜 가입의 intentToken 등).
//                바뀌면 이전 시도의 인증 결과를 물려주지 않습니다.
//
// 반환값에는 signupProof 원문을 넣지 않습니다(AC-05) — 증명은 이 훅의 state에만 있다가
// buildSignupPayload()가 제출 payload를 만들 때 한 번 읽힙니다.

// 화면 수명 동안만 존재하는 값이라 formData·auth store 어디에도 넣지 않습니다.
const INITIAL_EMAIL_VERIFICATION = {
  // unverified → sending → codeSent → verifying → verified
  //                  ↑         ↓  (오답/만료/시도초과)
  //                  └── codeExpired · locked (대기 종료 후 재발송 가능, 확인은 불가)
  stage: "unverified",
  email: "", // 이 상태가 유효한 이메일(발송 대상) — 입력값과 다르면 재인증이 필요합니다.
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
export function isValidSignupEmailFormat(email) {
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

// 재검토 지적(F-31b AC-03): code만 보고 분기하면 5xx 응답에 익숙한 code가 우연히 실려 와도
// 확정된 실패 사유로 오인할 수 있다 — 승인 계약대로 status(서버가 실제로 약속한 4xx)와
// code가 함께 맞을 때만 그 사유로 인정하고, 그 외(5xx·형식 밖 응답)는 통신 실패로 본다.
const SIGNUP_CODE_ERROR_STATUS = {
  RESEND_TOO_SOON: 429,
  RATE_LIMITED: 429,
  INVALID_INPUT: 400,
  CODE_INVALID: 400,
  CODE_EXPIRED: 400,
  TOO_MANY_ATTEMPTS: 429,
}

function isKnownSignupCodeError(error, code) {
  return error?.code === code && error?.status === SIGNUP_CODE_ERROR_STATUS[code]
}

// POST /auth/signup/email-code 실패를 화면에 보여줄 안내로 옮깁니다.
function describeSignupCodeRequestError(error) {
  if (isKnownSignupCodeError(error, "RESEND_TOO_SOON") && Number.isFinite(error.resendAfterSec)) {
    return { kind: "RESEND_TOO_SOON", resendAfterSec: error.resendAfterSec }
  }
  if (isKnownSignupCodeError(error, "RATE_LIMITED")) return { kind: "RATE_LIMITED" }
  if (isKnownSignupCodeError(error, "INVALID_INPUT")) return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
}

// POST /auth/signup/email-code/verify 실패를 화면에 보여줄 안내로 옮깁니다.
function describeSignupCodeVerifyError(error) {
  if (isKnownSignupCodeError(error, "CODE_INVALID")) {
    return { kind: "CODE_INVALID", attemptsRemaining: Number.isFinite(error.attemptsRemaining) ? error.attemptsRemaining : null }
  }
  if (isKnownSignupCodeError(error, "CODE_EXPIRED")) return { kind: "CODE_EXPIRED" }
  if (isKnownSignupCodeError(error, "TOO_MANY_ATTEMPTS")) return { kind: "TOO_MANY_ATTEMPTS" }
  if (isKnownSignupCodeError(error, "RATE_LIMITED")) return { kind: "RATE_LIMITED" }
  if (isKnownSignupCodeError(error, "INVALID_INPUT")) return { kind: "INVALID_INPUT" }
  return { kind: "UNKNOWN" }
}

export function useSignupEmailVerification({ email = "", active = true, attemptKey = "" } = {}) {
  const [emailVerification, setEmailVerification] = useState(INITIAL_EMAIL_VERIFICATION)

  // 이메일 변경·재발송·모드 이탈마다 증가해, 이미 무효화된 요청의 늦은 응답이 최신 상태를
  // 덮어쓰지 못하게 막습니다(A→B→A, 진행 중 주소 변경 포함).
  const verificationGenerationRef = useRef(0)
  // 더블 클릭 등 연속 클릭으로 같은 요청이 중복 발사되지 않게 막는 동기 잠금입니다.
  const verificationRequestInFlightRef = useRef(false)
  // 재발송 대기·인증번호 만료 카운트다운을 1초마다 다시 그리기 위한 트리거입니다 — 값
  // 자체는 읽지 않고 setState 호출로 리렌더만 유발합니다.
  const [, forceVerificationTick] = useState(0)

  // AC-04: 이메일이 바뀌거나(대소문자·공백만 바뀌어도), 이 흐름이 비활성화되거나(가입
  // 모드 이탈 등), 다른 가입 시도로 바뀌면 인증 상태를 전부 초기화합니다. 이벤트 핸들러가
  // 아니라 렌더 중에 판정하므로, 입력이 어떤 경로로 바뀌든(붙여넣기·프로그램적 변경 포함)
  // 같은 초기화가 일어납니다. generation을 함께 올려 진행 중이던 발송·확인 응답이 나중에
  // 도착해도 무시되게 합니다. 구분자는 입력값에 나타날 수 없는 NUL(이스케이프)입니다.
  //
  // 단, 렌더 시점 비교는 한 배치 안에서 A→B→A로 되돌아간 변경을 "변화 없음"으로 봅니다.
  // 그래서 이메일 입력의 변경 핸들러(useLoginPage.handleInputChange·useSocialSignup.
  // handleEmailChange)가 값이 바뀔 때마다 아래 reset()을 동기적으로 호출해 전이마다
  // 폐기합니다 — 이 렌더 비교는 그 밖의 경로(모드 이탈·시도 교체)를 위한 보조 장치입니다.
  const resetSignature = `${active ? "1" : "0"}\u0000${attemptKey ?? ""}\u0000${email}`
  const [appliedSignature, setAppliedSignature] = useState(resetSignature)
  if (appliedSignature !== resetSignature) {
    setAppliedSignature(resetSignature)
    verificationGenerationRef.current += 1
    setEmailVerification(INITIAL_EMAIL_VERIFICATION)
  }

  // 언마운트되면 요청 세대를 올려, 진행 중이던 발송·확인의 늦은 응답이 무시되게 합니다.
  useEffect(() => () => { verificationGenerationRef.current += 1 }, [])

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

  // 인증번호 입력칸 전용 변경 핸들러입니다.
  const handleSignupCodeChange = (e) => {
    const { value } = e.target
    setEmailVerification((prev) => ({ ...prev, code: value }))
  }

  // 인증번호를 발송(최초)하거나 재발송합니다.
  const handleRequestSignupCode = async () => {
    const current = emailVerification

    if (!active) return
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

    if (!active) return
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
    const targetEmail = current.email
    const code = current.code

    setEmailVerification((prev) => ({ ...prev, stage: "verifying", message: "" }))

    try {
      const result = await verifySignupCodeApi({ email: targetEmail, code })
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
  // 허용합니다. 이메일을 인증 이후에 바꾸면 위 초기화가 이미 상태를 지우므로 이 조건은
  // 사실상 "verified"와 같아지지만, 방어적으로 이메일 일치까지 재확인합니다.
  const hasValidSignupProof = (
    active
    && emailVerification.stage === "verified"
    && emailVerification.email === email
    && typeof emailVerification.signupProof === "string"
    && emailVerification.signupProof.length > 0
  )

  // 제출 payload를 만드는 유일한 통로입니다 — 증명 원문은 여기서만 밖으로 나갑니다(AC-05).
  const buildSignupPayload = () => (
    hasValidSignupProof ? { email: emailVerification.email, signupProof: emailVerification.signupProof } : null
  )

  // 가입 성공·서버의 증명 거부처럼 "지금 들고 있는 번호·증명을 즉시 버려야 하는" 사건에서
  // 호출합니다. generation도 함께 올려 진행 중이던 응답이 되살리지 못하게 합니다.
  const reset = () => {
    verificationGenerationRef.current += 1
    setEmailVerification(INITIAL_EMAIL_VERIFICATION)
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
    // 화면용 상태 — signupProof는 절대 포함하지 않습니다(AC-05).
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
    hasValidSignupProof,
    buildSignupPayload,
    reset,
  }
}
