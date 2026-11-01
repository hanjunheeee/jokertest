// 소셜 가입 화면 상태 묶음 (가입 정보 불러오기·이메일 인증·가입 완료)
// components/SocialSignupForm.jsx가 사용, 불러오기는 socialSignup/useIntentLoad.js·보내기는 socialSignup/submit.js가 맡음
import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/auth.store.js"
import { useSignupEmailVerification } from "./useSignupEmailVerification.js"
import { useIntentLoad } from "./socialSignup/useIntentLoad.js"
import { submitSignup } from "./socialSignup/submit.js"

// status는 가입 진행(idle·submitting·done·error·expired·cancelled·conflict), intentStatus는 가입 정보 불러오기
export function useSocialSignup(intentToken) {
  const [status, setStatus] = useState("idle")
  const [errorMessage, setErrorMessage] = useState(null)
  const [intentStatus, setIntentStatus] = useState("loading")
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false)
  const [email, setEmail] = useState("")
  const [intentAttempt, setIntentAttempt] = useState(0)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const submittingRef = useRef(false)
  const intentGenRef = useRef(0)

  // 인증은 가입 정보가 준비되고 서버가 요구할 때만 켬, 다시 불러오면 인증도 처음부터
  const verification = useSignupEmailVerification({
    email,
    active: intentStatus === "ready" && emailVerificationRequired,
    attemptKey: `${typeof intentToken === "string" ? intentToken : ""}:${intentAttempt}`,
  })

  useIntentLoad({
    intentToken, intentAttempt, genRef: intentGenRef,
    setIntentStatus, setEmailVerificationRequired, setEmail, setStatus, setErrorMessage,
  })

  // token이 없으면 다시 불러올 게 없음
  const retryIntent = () => {
    if (typeof intentToken !== "string" || !intentToken) return
    setIntentAttempt((attempt) => attempt + 1)
  }

  // 주소가 바뀌면 받은 인증을 버림
  const handleEmailChange = (e) => {
    const { value } = e.target
    if (value !== email) verification.reset()
    setEmail(value)
  }

  // 가입 정보 준비됨 + 보내는 중·끝남 아님 + (인증이 필요하면) 인증 끝
  const canSubmit = (
    intentStatus === "ready"
    && status !== "submitting"
    && status !== "done"
    && (!emailVerificationRequired || verification.hasValidSignupProof)
  )

  const submitCtx = {
    intentToken, intentStatus, emailVerificationRequired, verification,
    submittingRef, genRef: intentGenRef, setStatus, setErrorMessage, login, navigate,
  }
  const submit = (fields) => submitSignup(submitCtx, fields)

  // 에러를 지우고 입력 화면으로 (잠금도 풂)
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
