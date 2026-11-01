// 가입 2단계: 인증번호를 받을 주소 보여 주기 + 이메일 인증 칸
// signup/SignupForm.jsx가 step 1일 때 씀
import EmailVerification from "@m/domains/auth/components/signup/verification/EmailVerification.jsx"

// 주소는 1단계에서 고침 (여기선 보여 주기만), 비었으면 1단계로 돌아가라는 안내
export default function VerifyStep({ email, verification, onBackToAccount }) {
  const trimmed = email.trim()

  return (
    <>
      <div className="flex min-h-11 items-center justify-between gap-2 rounded bg-black/10 px-3 py-1">
        <span className="min-w-0 break-all font-subheading font-bold text-black app-text-scaled [--app-text-size:14px]">
          {trimmed || "이메일을 먼저 입력해주세요."}
        </span>
        <button
          type="button"
          onClick={onBackToAccount}
          className="min-h-11 shrink-0 cursor-pointer border-0 bg-transparent px-1 font-subheading font-bold text-amber-800 underline app-text-scaled [--app-text-size:13px]"
        >
          주소 바꾸기
        </button>
      </div>

      <EmailVerification
        emailVerification={verification.emailVerification}
        onSignupCodeChange={verification.onSignupCodeChange}
        handleRequestSignupCode={verification.handleRequestSignupCode}
        handleVerifySignupCode={verification.handleVerifySignupCode}
      />
    </>
  )
}
