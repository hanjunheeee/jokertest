// 소셜 가입 정보를 못 불러왔을 때 화면 (다시 시도·로그인 화면으로)
// components/SocialSignupForm.jsx가 intentStatus가 error일 때 씀
import { SOCIAL_SIGNUP_TEXT } from "@/domains/auth/constants/socialMessages.js"

// 서버 문구가 없으면 기본 실패 문구
export default function IntentErrorNotice({ errorMessage, onRetry, onCancel }) {
  return (
    <div className="mt-8 flex flex-1 flex-col items-center gap-4 text-center">
      <p role="alert" className="font-subheading app-text-scaled [--app-text-size:13px] font-bold text-red-300">
        {errorMessage || SOCIAL_SIGNUP_TEXT.intentLoadFailed}
      </p>
      <button type="button" data-testid="social-intent-retry" onClick={onRetry} className="auth-text-link">
        다시 시도
      </button>
      <button type="button" onClick={onCancel} className="auth-text-link">
        로그인 화면으로
      </button>
    </div>
  )
}
