// 로그인·일반 가입 제출 (가입은 입력 검사와 이메일 인증 확인 뒤 요청)
// hooks/useLoginPage.js가 사용, 막히면 alert로 알림
import { useRef, useState } from "react"
import { loginApi, signupApi } from "../../api/auth.api.js"
import { validateSignupForm } from "../../validation/signupValidation.js"

// 보내는 중 표시(isSubmitting)와 제출 처리(handleSubmit)를 돌려줌
export function useLoginSubmit({
  formData, rememberMe, isSignupMode, setIsSignupMode, buildSignupPayload, resetVerification, login, navigate,
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  // state는 다음 그림에야 바뀌어서 같은 순간 두 번 누름은 ref로 막음
  const inFlightRef = useRef(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (inFlightRef.current) return
    if (isSubmitting) return
    inFlightRef.current = true

    try {
      // 가입이면 입력 검사 → 인증 증명 확인, 막히면 요청 없이 알림만
      let signupPayload = null
      if (isSignupMode) {
        const validation = validateSignupForm(formData)
        if (!validation.ok) {
          alert(validation.message)
          return
        }

        signupPayload = buildSignupPayload()
        if (!signupPayload) {
          alert("이메일 인증을 완료해주세요.")
          return
        }
      }

      setIsSubmitting(true)
      try {
        if (isSignupMode) {
          // 가입되면 로그인 모드로 돌리고 인증을 비움
          const result = await signupApi({ ...formData, signupProof: signupPayload.signupProof })
          if (result?.success !== true) {
            alert("서버와 연결할 수 없습니다. 다시 시도해주세요.")
            return
          }
          alert("회원가입이 완료되었습니다! 로그인해주세요.")
          setIsSignupMode(false)
          resetVerification()
        } else {
          const { user } = await loginApi({ ...formData, rememberMe })
          login(user)
          navigate("/lobby")
        }
      } catch (error) {
        // 인증 증명이 없거나 만료·사용됨이면 인증부터 다시
        if (isSignupMode && (error.code === "SIGNUP_PROOF_REQUIRED" || error.code === "SIGNUP_PROOF_INVALID")) {
          resetVerification()
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
      inFlightRef.current = false
    }
  }

  return { isSubmitting, handleSubmit }
}
