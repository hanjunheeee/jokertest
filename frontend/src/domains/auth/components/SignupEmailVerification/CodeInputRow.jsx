// 인증번호 입력 칸 + 확인 버튼 한 줄
// components/SignupEmailVerification.jsx가 받기를 누른 뒤(인증 끝나기 전)에만 씀
import AuthInputSlot from "@/shared/ui/AuthInputSlot.jsx"

// 만료·잠김이면 입력 칸만 잠그고, 버튼은 canVerify로 따로 잠금
export default function CodeInputRow({ stage, code, canVerify, isVerifying, onCodeChange, onVerify }) {
  return (
    <div className="flex items-center gap-1 px-0.5">
      <div className="min-w-0 flex-1">
        <AuthInputSlot
          type="text"
          inputMode="numeric"
          name="signupEmailCode"
          inputTestId="signup-code-input"
          value={code}
          onChange={onCodeChange}
          placeholder="인증번호를 입력하세요"
          disabled={stage === "codeExpired" || stage === "locked"}
          compact
        />
      </div>
      <button
        type="button"
        data-testid="signup-code-verify"
        onClick={onVerify}
        disabled={!canVerify}
        className="cursor-pointer rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isVerifying ? "확인 중..." : "확인"}
      </button>
    </div>
  )
}
