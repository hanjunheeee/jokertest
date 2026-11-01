// 소셜 가입 정보를 못 불러왔을 때 화면 (다시 시도·로그인 화면으로)
// social/SocialSignupForm.jsx가 intentStatus가 error일 때 씀
import { SOCIAL_SIGNUP_TEXT } from "@/domains/auth/constants/socialMessages.js"
import { ERROR_TEXT_CLASS, LINK_CLASS } from "@m/domains/auth/components/login/ui/styles.js"

// 서버 문구가 없으면 기본 실패 문구
export default function IntentError({ errorMessage, onRetry, onCancel }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <p role="alert" className={ERROR_TEXT_CLASS}>{errorMessage || SOCIAL_SIGNUP_TEXT.intentLoadFailed}</p>
      <button type="button" data-testid="social-intent-retry" onClick={onRetry} className={LINK_CLASS}>다시 시도</button>
      <button type="button" onClick={onCancel} className={LINK_CLASS}>로그인 화면으로</button>
    </div>
  )
}
