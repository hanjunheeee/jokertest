// 소셜 첫 로그인 가입 칸 (닉네임·생년월일, 서버가 요구하면 이메일 인증까지), 짧은 양식 한 장
// pages/LoginPage.jsx가 주소에 socialIntent가 있을 때 씀, 상태는 데스크톱 useSocialSignup 그대로
import { useState } from "react"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import { SOCIAL_SIGNUP_TEXT } from "@/domains/auth/constants/socialMessages.js"
import { useSocialSignup } from "@/domains/auth/hooks/useSocialSignup.js"
import ImageButton from "@m/domains/auth/components/login/ui/ImageButton.jsx"
import { ERROR_TEXT_CLASS, HEADER_TEXT_CLASS } from "@m/domains/auth/components/login/ui/styles.js"
import IntentError from "@m/domains/auth/components/social/IntentError.jsx"
import SocialFields from "@m/domains/auth/components/social/SocialFields.jsx"

// 더 진행할 수 없는 가입 상태 (만료·잘못됨, 이미 쓴 가입 정보, 이미 있는 이메일)
const BLOCKED_STATUSES = new Set(["expired", "cancelled", "conflict"])

// 끝남 → 막힘 → 불러오기 실패 → 입력 화면 순서로 고름 (데스크톱과 같음)
export default function SocialSignupForm({ intentToken, onCancel }) {
  const signup = useSocialSignup(intentToken)
  const { status, errorMessage, submit, intentStatus, emailVerificationRequired, retryIntent, canSubmit } = signup
  const [nickname, setNickname] = useState("")
  const [birthDate, setBirthDate] = useState("")
  const [localError, setLocalError] = useState(null)

  // 훅은 생년월일이 비어도 그대로 보내서, 필수 검사는 화면에서 먼저 함
  const handleSubmit = async () => {
    if (status === "submitting") return
    if (!canSubmit) return
    if (!birthDate) {
      setLocalError(SOCIAL_SIGNUP_TEXT.needBirthDate)
      return
    }
    setLocalError(null)
    await submit({ nickname, birthDate })
  }

  // 가입 끝: 로비로 가는 동안 안내만
  if (status === "done") {
    return <p className={`${HEADER_TEXT_CLASS} py-6`}>가입이 완료되었습니다. 로비로 이동합니다...</p>
  }

  // 막힘: 문구 + 로그인 화면으로 버튼만 (다시 시도 없음)
  if (BLOCKED_STATUSES.has(status)) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p role="alert" className={ERROR_TEXT_CLASS}>{errorMessage}</p>
        <ImageButton onClick={onCancel} src={LOGIN_ASSETS.loginButton} label="로그인 화면으로" className="mx-auto w-[86%]" />
      </div>
    )
  }

  // 가입 정보 못 불러옴: 다시 시도·로그인 화면으로
  if (intentStatus === "error") {
    return <IntentError errorMessage={errorMessage} onRetry={retryIntent} onCancel={onCancel} />
  }

  // 화면에서 막은 에러가 먼저, 없으면 훅 에러(error 상태일 때만)
  const visibleError = localError || (status === "error" ? errorMessage : null)

  return (
    <>
      <p className={HEADER_TEXT_CLASS}>
        {emailVerificationRequired
          ? "소셜 계정으로 처음 오셨네요. 이메일 인증과 닉네임·생년월일이 필요해요"
          : "소셜 계정으로 처음 오셨네요. 닉네임과 생년월일을 알려주세요"}
      </p>
      <SocialFields
        signup={signup}
        nickname={nickname}
        setNickname={setNickname}
        birthDate={birthDate}
        setBirthDate={setBirthDate}
        visibleError={visibleError}
        onSubmit={handleSubmit}
        onCancel={onCancel}
      />
    </>
  )
}
