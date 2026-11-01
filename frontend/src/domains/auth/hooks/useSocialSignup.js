// 소셜 가입 화면 상태 묶음 (가입 정보 불러오기·이메일 인증·가입 완료)
// components/SocialSignupForm.jsx가 사용, 불러오기·보내기는 socialSignup 폴더 파일이 맡음
import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "../store/auth.store.js"
import { useSignupEmailVerification } from "./useSignupEmailVerification.js"
import { useIntentLoad } from "./socialSignup/useIntentLoad.js"
import { submitSignup } from "./socialSignup/submit.js"

// status는 가입 진행 단계, intentStatus는 가입 정보 불러오기(loading·ready·error)
export function useSocialSignup(intentToken) {
  const [status, setStatus] = useState("idle")
  const [errorMessage, setErrorMessage] = useState(null)
  const [intentStatus, setIntentStatus] = useState("loading")
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false)
  const [email, setEmail] = useState("")
  const [intentAttempt, setIntentAttempt] = useState(0)
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  // 보내기 잠금, 가입 정보 세대 번호 (다시 불러오면 옛 응답 버림)
  const submittingRef = useRef(false)
  const intentGenRef = useRef(0)

  // 인증은 가입 정보가 준비되고 서버가 요구할 때만 켬, 다시 불러오면 인증도 처음부터
  const verification = useSignupEmailVerification({
    email,
    active: intentStatus === "ready" && emailVerificationRequired,
    attemptKey: `${typeof intentToken === "string" ? intentToken : ""}:${intentAttempt}`,
  })

  // 가입 정보 불러오기 (token·다시 시도 바뀔 때마다)
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

  // 보내기(submit.js)에 넘길 상태·ref·인증 묶음
  const submitCtx = {
    intentToken, intentStatus, emailVerificationRequired, verification,
    submittingRef, genRef: intentGenRef, setStatus, setErrorMessage, login, navigate,
  }
  // 가입 완료 보내기 (검사·요청은 submit.js가 함)
  const submit = (fields) => submitSignup(submitCtx, fields)

  // 에러를 지우고 입력 화면으로 (잠금도 풂), 화면은 안 쓰고 시험만 부름
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
