// 가입 단계 표시 줄 (계정·이메일 인증·프로필), 누르면 그 단계로
// signup/SignupForm.jsx가 머리글 아래에 씀
import { SIGNUP_STEPS } from "@m/domains/auth/hooks/useSignupSteps.js"

// 지금 단계는 진한 빨강, 지난 단계는 흐린 빨강, 남은 단계는 회색
export default function StepIndicator({ step, onSelect }) {
  return (
    <ol className="flex items-stretch gap-1" aria-label="회원가입 단계">
      {SIGNUP_STEPS.map((name, index) => {
        const current = index === step
        const done = index < step
        return (
          <li key={name} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={current ? "step" : undefined}
              className={`flex min-h-11 w-full flex-col items-center justify-center gap-1 border-0 bg-transparent px-0.5 font-subheading font-bold app-text-scaled [--app-text-size:12px] ${
                current ? "text-text-main" : done ? "text-text-main/60" : "text-black/45"
              }`}
            >
              <span className={`h-1 w-full rounded-full ${current ? "bg-text-main" : done ? "bg-text-main/50" : "bg-black/20"}`} />
              <span className="truncate">{index + 1}. {name}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
