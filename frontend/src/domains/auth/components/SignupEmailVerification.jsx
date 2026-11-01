// 가입 이메일 인증 칸 (받기·재발송 버튼, 인증번호 입력 줄, 안내 줄)
// components/SignupForm.jsx(일반 가입), components/SocialSignupForm/SocialSignupFields.jsx(소셜 가입)가 사용
import { useLayoutEffect, useRef } from "react"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import CodeInputRow from "@/domains/auth/components/SignupEmailVerification/CodeInputRow.jsx"
import NoticeSlot from "@/domains/auth/components/SignupEmailVerification/NoticeSlot.jsx"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import {
  ACTION_BTN_INTERACTION_CLASS,
  ACTION_BTN_LABEL_CLASS,
  CODE_SEND_BTN_CLASS,
  EMAIL_VERIFICATION_BLOCK_CLASS,
  EMAIL_VERIFICATION_TITLE_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"
import { pickNotice, sendButtonLabel } from "@/domains/auth/utils/emailVerification/notice.js"

// 대상이 가입 스크롤 칸 밖으로 나가 있으면 그 칸 안에서만 굴려 보이게 함 (페이지는 안 굴림)
function scrollWithinSignupArea(target) {
  if (!target) return
  const scrollEl = target.closest("[data-signup-scroll-area]")
  if (!scrollEl) return

  requestAnimationFrame(() => {
    const margin = 8
    const scrollRect = scrollEl.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()

    if (targetRect.bottom > scrollRect.bottom - margin) {
      scrollEl.scrollTop += targetRect.bottom - scrollRect.bottom + margin
    } else if (targetRect.top < scrollRect.top + margin) {
      scrollEl.scrollTop -= scrollRect.top - targetRect.top + margin
    }
  })
}

// 단계(stage)에 따라 버튼 잠금·입력 줄·안내 줄을 정함
export default function SignupEmailVerification({
  emailVerification, onSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode,
}) {
  const { stage, code, message, codeRemainingSec, resendRemainingSec } = emailVerification
  const isSending = stage === "sending"
  const isVerifying = stage === "verifying"
  const isVerified = stage === "verified"
  const showCodeInput = stage !== "unverified"
  // 재발송은 보낸 뒤·만료·잠김에서 대기 초가 끝났을 때만
  const canResend = !isSending && !isVerified
    && (stage === "codeSent" || stage === "codeExpired" || stage === "locked")
    && resendRemainingSec <= 0
  const canVerify = stage === "codeSent" && code.trim().length > 0 && !isVerifying
  const sendLabel = sendButtonLabel(stage, resendRemainingSec)
  const notice = pickNotice({
    isVerified, stage, message, codeRemainingSec,
  })
  const blockRef = useRef(null)
  const noticeRef = useRef(null)

  // 안내 문구가 바뀌거나 입력 줄이 열리면 그 자리가 보이게 굴림
  useLayoutEffect(() => {
    const target = noticeRef.current ?? blockRef.current
    if (!target) return
    if (!notice?.text && !showCodeInput) return
    scrollWithinSignupArea(target)
  }, [notice?.text, showCodeInput])

  const handleSendCodeClick = () => handleRequestSignupCode()
  const handleVerifyCodeClick = () => handleVerifySignupCode()
  const handleCodeInputChange = (e) => onSignupCodeChange(e)

  return (
    <div className={EMAIL_VERIFICATION_BLOCK_CLASS}>
      <div className="flex items-center justify-between gap-1">
        <span className={EMAIL_VERIFICATION_TITLE_CLASS}>이메일 인증</span>
        {!isVerified && (
          <AuthImageButton
            type="button"
            inline
            data-testid="signup-code-send"
            onClick={handleSendCodeClick}
            disabled={stage === "unverified" ? isSending : !canResend}
            src={LOGIN_ASSETS.signupCodeSendButton}
            label={sendLabel}
            visibleLabel={sendLabel}
            visibleLabelClassName={ACTION_BTN_LABEL_CLASS}
            interactionClassName={ACTION_BTN_INTERACTION_CLASS}
            className={CODE_SEND_BTN_CLASS}
          />
        )}
      </div>

      {showCodeInput && !isVerified && (
        <CodeInputRow
          stage={stage}
          code={code}
          canVerify={canVerify}
          isVerifying={isVerifying}
          onCodeChange={handleCodeInputChange}
          onVerify={handleVerifyCodeClick}
        />
      )}

      {(notice || (showCodeInput && !isVerified)) && (
        <NoticeSlot ref={noticeRef} notice={notice} reserveSpace={showCodeInput && !isVerified} />
      )}
    </div>
  )
}
