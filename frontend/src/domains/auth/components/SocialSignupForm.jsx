// 소셜 첫 로그인 가입 칸 (닉네임·생년월일, 서버가 요구하면 이메일 인증까지)
// pages/LoginPage.jsx가 주소에 socialIntent가 있을 때 씀, 칸 묶음은 SocialSignupForm/*
import { useState } from "react"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import IntentErrorNotice from "@/domains/auth/components/SocialSignupForm/IntentErrorNotice.jsx"
import SocialSignupFields from "@/domains/auth/components/SocialSignupForm/SocialSignupFields.jsx"
import SignupScrollArea from "@/domains/auth/components/SignupScrollArea.jsx"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import { SOCIAL_SIGNUP_TEXT } from "@/domains/auth/constants/socialMessages.js"
import { SIGNUP_FORM_BODY_CLASS, SIGNUP_HEADER_TEXT_CLASS } from "@/domains/auth/constants/signupLayoutStyle.js"
import { useSocialSignup } from "@/domains/auth/hooks/useSocialSignup.js"

// 더 진행할 수 없는 가입 상태 (만료·취소·이미 있는 이메일)
const BLOCKED_STATUSES = new Set(["expired", "cancelled", "conflict"])

// 끝남 → 막힘 → 불러오기 실패 → 입력 화면 순서로 고름
export default function SocialSignupForm({ intentToken, onCancel }) {
  const signup = useSocialSignup(intentToken)
  const { status, errorMessage, submit, intentStatus, emailVerificationRequired, retryIntent, canSubmit } = signup
  const [nickname, setNickname] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [localError, setLocalError] = useState(null)

  const isSubmitting = status === "submitting"

  // 훅은 생년월일이 비어도 그대로 보내서, 필수 검사는 화면에서 먼저 함
  const handleSubmit = async () => {
    if (isSubmitting) return
    if (!canSubmit) return
    if (!birthDate) {
      setLocalError(SOCIAL_SIGNUP_TEXT.needBirthDate)
      return
    }
    setLocalError(null)
    await submit({ nickname, birthDate })
  }

  if (status === "done") {
    return (
      <p className="mt-8 text-center font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body/90">
        가입이 완료되었습니다. 로비로 이동합니다...
      </p>
    )
  }

  if (BLOCKED_STATUSES.has(status)) {
    return (
      <div className="mt-8 flex flex-1 flex-col items-center gap-4 text-center">
        <p role="alert" className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-red-300">{errorMessage}</p>
        <AuthImageButton type="button" onClick={onCancel} src={LOGIN_ASSETS.loginButton} label="로그인 화면으로" />
      </div>
    )
  }

  if (intentStatus === "error") {
    return <IntentErrorNotice errorMessage={errorMessage} onRetry={retryIntent} onCancel={onCancel} />
  }

  // 화면에서 막은 에러가 먼저, 없으면 훅 에러(error 상태일 때만)
  const visibleError = localError || (status === "error" ? errorMessage : null)

  return (
    <div className={SIGNUP_FORM_BODY_CLASS}>
      <header className="shrink-0 text-center">
        <p className={SIGNUP_HEADER_TEXT_CLASS}>
          {emailVerificationRequired
            ? "소셜 계정으로 처음 오셨네요. 이메일 인증과 닉네임·생년월일이 필요해요"
            : "소셜 계정으로 처음 오셨네요. 닉네임과 생년월일을 알려주세요"}
        </p>
      </header>

      <SignupScrollArea>
        <SocialSignupFields
          signup={signup}
          nickname={nickname}
          setNickname={setNickname}
          birthDate={birthDate}
          setBirthDate={setBirthDate}
          visibleError={visibleError}
          onSubmit={handleSubmit}
          onCancel={onCancel}
        />
      </SignupScrollArea>
    </div>
  )
}
