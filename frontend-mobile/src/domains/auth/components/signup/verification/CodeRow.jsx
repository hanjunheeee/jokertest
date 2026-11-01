// 인증번호 입력 칸 + 확인 버튼 한 줄
// signup/verification/EmailVerification.jsx가 받기를 누른 뒤(인증 끝나기 전)에만 씀
import InputSlot from "@m/domains/auth/components/login/ui/InputSlot.jsx"

// 만료·잠김이면 입력 칸만 잠그고, 버튼은 canVerify로 따로 잠금 (데스크톱과 같음)
export default function CodeRow({ stage, code, canVerify, isVerifying, onCodeChange, onVerify }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <InputSlot
          type="text"
          inputMode="numeric"
          name="signupEmailCode"
          inputTestId="signup-code-input"
          value={code}
          onChange={onCodeChange}
          placeholder="인증번호를 입력하세요"
          autoComplete="one-time-code"
          disabled={stage === "codeExpired" || stage === "locked"}
        />
      </div>
      <button
        type="button"
        data-testid="signup-code-verify"
        onClick={onVerify}
        disabled={!canVerify}
        className="h-11 min-w-14 shrink-0 cursor-pointer rounded bg-black/70 px-3 font-subheading font-bold text-white active:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50 app-text-scaled [--app-text-size:14px]"
      >
        {isVerifying ? "확인 중..." : "확인"}
      </button>
    </div>
  )
}
