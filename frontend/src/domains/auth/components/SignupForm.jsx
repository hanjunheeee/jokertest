import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthModeSwitchPrompt from "@/domains/auth/components/AuthModeSwitchPrompt.jsx"
import SignupFields from "@/domains/auth/components/SignupForm/SignupFields.jsx"

// F-31b: 가입 이메일 인증 단계별로 발송/재발송 버튼에 보여줄 문구입니다.
function SignupCodeSendButtonLabel({ stage, resendRemainingSec }) {
  if (stage === "sending") return "발송 중..."
  if (stage === "unverified") return "인증번호 받기"
  if (resendRemainingSec > 0) return `재발송 (${resendRemainingSec}초)`
  return "재발송"
}

// F-31b(AC-03): 상태별 안내 문구입니다. message(서버 실패 안내)가 있으면 그걸 우선
// 보여주고, 없으면 codeSent의 만료 카운트다운을 보여줍니다.
function SignupCodeNotice({ stage, message, codeRemainingSec }) {
  if (message) {
    return <p data-testid="signup-email-verification-notice" className="px-2 text-xs text-red-400">{message}</p>
  }
  if (stage === "codeSent" && codeRemainingSec !== null) {
    return <p data-testid="signup-email-verification-notice" className="px-2 text-xs text-white/70">남은 시간 {codeRemainingSec}초</p>
  }
  return null
}

// 회원가입 화면의 form 내용을 조립하는 컴포넌트입니다.
export default function SignupForm({
  formData, onChange, onSwitchToLogin,
  emailVerification, onSignupCodeChange, handleRequestSignupCode, handleVerifySignupCode, canSubmitSignup,
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

  // F-31b: 인증번호 발송·확인·입력 이벤트를 훅의 핸들러로 직접 호출합니다.
  const handleSendCodeClick = () => handleRequestSignupCode()
  const handleVerifyCodeClick = () => handleVerifySignupCode()
  const handleCodeInputChange = (e) => onSignupCodeChange(e)

  return (
    <>
      <header className="text-center">
        <p className="mt-[40px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-relaxed text-text-body/90">
          새로운 모험을 위한 정보를 입력해주세요
        </p>
      </header>

      {/* F-31b: 인증 UI를 포함하며 늘어난 내용을 스크롤 영역 안에 담습니다. */}
      <div className="mt-4 flex max-h-[70vh] flex-1 flex-col gap-2 overflow-y-auto">
        <SignupFields formData={formData} handleInputChange={onChange} />

        <div className="flex flex-col gap-1 rounded bg-white/10 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="px-1 text-xs text-white/80">이메일 인증</span>
            {!isVerified && (
              <button
                type="button"
                data-testid="signup-code-send"
                onClick={handleSendCodeClick}
                disabled={stage === "unverified" ? isSending : !canResend}
                className="cursor-pointer rounded bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SignupCodeSendButtonLabel stage={stage} resendRemainingSec={resendRemainingSec} />
              </button>
            )}
          </div>

          {showCodeInput && !isVerified && (
            <div className="flex items-center gap-2 px-1">
              <input
                type="text"
                inputMode="numeric"
                name="signupEmailCode"
                data-testid="signup-code-input"
                value={code}
                onChange={handleCodeInputChange}
                placeholder="인증번호를 입력하세요"
                disabled={stage === "codeExpired" || stage === "locked"}
                className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-sm text-white outline-none placeholder:text-white/55"
              />
              <button
                type="button"
                data-testid="signup-code-verify"
                onClick={handleVerifyCodeClick}
                disabled={!canVerify}
                className="cursor-pointer rounded bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isVerifying ? "확인 중..." : "확인"}
              </button>
            </div>
          )}

          {isVerified ? (
            <p className="px-2 text-xs text-emerald-400">이메일 인증이 완료되었습니다.</p>
          ) : (
            <SignupCodeNotice stage={stage} message={message} codeRemainingSec={codeRemainingSec} />
          )}
        </div>

        {!canSubmitSignup && (
          <p className="px-2 text-xs text-white/60">이메일 인증을 완료해야 가입할 수 있습니다.</p>
        )}

        {/* 회원가입 제출 버튼입니다. 이메일 인증 전에는 비활성화됩니다. */}
        <AuthImageButton
          type="submit"
          src={LOGIN_ASSETS.signupButton}
          label="회원가입"
          className="mt-1 cursor-pointer"
          disabled={!canSubmitSignup}
        />

        <AuthModeSwitchPrompt question="이미 계정이 있으신가요?" actionLabel="로그인하기" onSwitch={onSwitchToLogin} />
      </div>
    </>
  )
}
