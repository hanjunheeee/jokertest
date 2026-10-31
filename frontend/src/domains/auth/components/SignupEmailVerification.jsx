import { useLayoutEffect, useRef } from "react"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthInputSlot from "@/domains/auth/components/AuthInputSlot.jsx"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import {
  SIGNUP_ACTION_BUTTON_INTERACTION_CLASS,
  SIGNUP_ACTION_BUTTON_LABEL_CLASS,
  SIGNUP_CODE_SEND_BUTTON_CLASS,
  SIGNUP_EMAIL_VERIFICATION_BLOCK_CLASS,
  SIGNUP_EMAIL_VERIFICATION_NOTICE_ERROR_CLASS,
  SIGNUP_EMAIL_VERIFICATION_NOTICE_INFO_CLASS,
  SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_CLASS,
  SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_RESERVED_CLASS,
  SIGNUP_EMAIL_VERIFICATION_NOTICE_SUCCESS_CLASS,
  SIGNUP_EMAIL_VERIFICATION_TITLE_CLASS,
} from "@/domains/auth/constants/signupLayoutStyle.js"

function getSignupCodeSendButtonLabel(stage, resendRemainingSec) {
  if (stage === "sending") return "발송 중..."
  if (stage === "unverified") return "인증번호 받기"
  if (resendRemainingSec > 0) return `재발송 (${resendRemainingSec}초)`
  return "재발송"
}

function resolveSignupVerificationNotice({ isVerified, stage, message, codeRemainingSec }) {
  if (isVerified) {
    return {
      className: SIGNUP_EMAIL_VERIFICATION_NOTICE_SUCCESS_CLASS,
      text: "이메일 인증이 완료되었습니다.",
    }
  }
  if (message) {
    return { className: SIGNUP_EMAIL_VERIFICATION_NOTICE_ERROR_CLASS, text: message }
  }
  if (stage === "codeSent" && codeRemainingSec !== null) {
    return {
      className: SIGNUP_EMAIL_VERIFICATION_NOTICE_INFO_CLASS,
      text: `남은 시간 ${codeRemainingSec}초`,
    }
  }
  return null
}

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

export default function SignupEmailVerification({
  emailVerification, onSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode,
}) {
  const { stage, code, message, codeRemainingSec, resendRemainingSec } = emailVerification
  const isSending = stage === "sending"
  const isVerifying = stage === "verifying"
  const isVerified = stage === "verified"
  const showCodeInput = stage !== "unverified"
  const canResend = !isSending && !isVerified
    && (stage === "codeSent" || stage === "codeExpired" || stage === "locked")
    && resendRemainingSec <= 0
  const canVerify = stage === "codeSent" && code.trim().length > 0 && !isVerifying
  const sendButtonLabel = getSignupCodeSendButtonLabel(stage, resendRemainingSec)
  const notice = resolveSignupVerificationNotice({
    isVerified, stage, message, codeRemainingSec,
  })
  const blockRef = useRef(null)
  const noticeRef = useRef(null)

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
    <div className={SIGNUP_EMAIL_VERIFICATION_BLOCK_CLASS}>
      <div className="flex items-center justify-between gap-1">
        <span className={SIGNUP_EMAIL_VERIFICATION_TITLE_CLASS}>이메일 인증</span>
        {!isVerified && (
          <AuthImageButton
            type="button"
            inline
            data-testid="signup-code-send"
            onClick={handleSendCodeClick}
            disabled={stage === "unverified" ? isSending : !canResend}
            src={LOGIN_ASSETS.signupCodeSendButton}
            label={sendButtonLabel}
            visibleLabel={sendButtonLabel}
            visibleLabelClassName={SIGNUP_ACTION_BUTTON_LABEL_CLASS}
            interactionClassName={SIGNUP_ACTION_BUTTON_INTERACTION_CLASS}
            className={SIGNUP_CODE_SEND_BUTTON_CLASS}
          />
        )}
      </div>

      {showCodeInput && !isVerified && (
        <div className="flex items-center gap-1 px-0.5">
          <div className="min-w-0 flex-1">
            <AuthInputSlot
              type="text"
              inputMode="numeric"
              name="signupEmailCode"
              inputTestId="signup-code-input"
              value={code}
              onChange={handleCodeInputChange}
              placeholder="인증번호를 입력하세요"
              disabled={stage === "codeExpired" || stage === "locked"}
              compact
            />
          </div>
          <button
            type="button"
            data-testid="signup-code-verify"
            onClick={handleVerifyCodeClick}
            disabled={!canVerify}
            className="cursor-pointer rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isVerifying ? "확인 중..." : "확인"}
          </button>
        </div>
      )}

      {(notice || (showCodeInput && !isVerified)) && (
        <div
          ref={noticeRef}
          className={`${SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_CLASS} ${showCodeInput && !isVerified ? SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_RESERVED_CLASS : ""}`}
          aria-live="polite"
        >
          {notice ? (
            <p data-testid="signup-email-verification-notice" className={notice.className}>
              {notice.text}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
