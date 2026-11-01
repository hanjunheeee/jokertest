// 가입 이메일 인증 칸 (받기·재발송 버튼, 인증번호 입력 줄, 안내 줄)
// signup/SignupForm.jsx(일반 가입)·social/SocialFields.jsx(소셜)가 씀, 단계 판단은 데스크톱과 같음
import { useLayoutEffect, useRef } from "react"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"
import { pickNotice, sendButtonLabel } from "@/domains/auth/utils/emailVerification/notice.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import CodeRow from "@m/domains/auth/components/signup/verification/CodeRow.jsx"
import Notice from "@m/domains/auth/components/signup/verification/Notice.jsx"

// 단계(stage)에 따라 버튼 잠금·입력 줄·안내 줄을 정함
export default function EmailVerification({
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
  // 확인은 보낸 상태에서 번호를 적었고 확인 중이 아닐 때만
  const canVerify = stage === "codeSent" && code.trim().length > 0 && !isVerifying
  const sendLabel = sendButtonLabel(stage, resendRemainingSec)
  const notice = pickNotice({ isVerified, stage, message, codeRemainingSec })
  const noticeRef = useRef(null)

  // 안내 문구가 바뀌면 그 줄이 보이게 (폰 키보드에 가려지지 않게) 페이지를 조금 굴림
  useLayoutEffect(() => {
    if (!notice?.text) return
    noticeRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" })
  }, [notice?.text])

  return (
    <div className="flex flex-col gap-1.5 rounded bg-white/10 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="px-1 font-subheading font-bold leading-none text-black app-text-scaled [--app-text-size:14px]">이메일 인증</span>
        {/* 받기·재발송 버튼: 처음엔 보내는 중만 잠금, 그 뒤엔 canResend로 */}
        {!isVerified && (
          <ImageButton
            data-testid="signup-code-send"
            onClick={() => handleRequestSignupCode()}
            disabled={stage === "unverified" ? isSending : !canResend}
            src={LOGIN_ASSETS.signupCodeSendButton}
            ariaLabel={sendLabel}
            label={sendLabel}
            labelClassName="!text-black whitespace-nowrap app-text-scaled [--app-text-size:13px]"
            className="w-[7.5rem] shrink-0"
          />
        )}
      </div>

      {/* 번호 입력 줄: 받기를 누른 뒤부터 인증 끝나기 전까지 */}
      {showCodeInput && !isVerified && (
        <CodeRow
          stage={stage}
          code={code}
          canVerify={canVerify}
          isVerifying={isVerifying}
          onCodeChange={(e) => onSignupCodeChange(e)}
          onVerify={() => handleVerifySignupCode()}
        />
      )}

      {/* 안내 줄: 문구가 있거나 입력 줄이 열려 있으면 자리 잡음 */}
      {(notice || (showCodeInput && !isVerified)) && (
        <Notice ref={noticeRef} notice={notice} reserveSpace={showCodeInput && !isVerified} />
      )}
    </div>
  )
}
