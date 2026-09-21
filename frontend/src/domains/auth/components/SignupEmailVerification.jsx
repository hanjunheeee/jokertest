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

// F-31(AC-04): F-31b가 SignupForm.jsx 본문에 만들었던 인증 블록(발송·재발송 버튼, 번호
// 입력, 확인 버튼, 카운트다운·안내 문구)을 그대로 옮긴 공용 컴포넌트입니다 — 로컬 가입
// (SignupForm)과 소셜 가입 보완(SocialSignupForm)이 같은 화면·같은 data-testid·같은
// 단계별 disabled 규칙을 씁니다. 이 컴포넌트는 인증 결과를 스스로 저장하지 않고, 전달받은
// 상태(useSignupEmailVerification의 화면용 부분집합)만 그려 이벤트를 위로 넘깁니다.
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

  // F-31b: 인증번호 발송·확인·입력 이벤트를 훅의 핸들러로 직접 호출합니다.
  const handleSendCodeClick = () => handleRequestSignupCode()
  const handleVerifyCodeClick = () => handleVerifySignupCode()
  const handleCodeInputChange = (e) => onSignupCodeChange(e)

  return (
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
  )
}
