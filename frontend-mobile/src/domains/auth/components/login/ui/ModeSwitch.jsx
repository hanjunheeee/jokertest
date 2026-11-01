// 로그인↔가입 모드 바꾸기 한 줄 (질문 + 글자 버튼)
// login/LoginForm.jsx, signup/SignupForm.jsx가 씀
import { LINK_CLASS } from "@m/domains/auth/components/login/ui/styles.js"

// 버튼이 type=button이라 눌러도 액자 form 제출 안 됨
export default function ModeSwitch({ question, actionLabel, onSwitch }) {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-1 text-center font-subheading font-bold text-text-body app-text-scaled [--app-text-size:14px]">
      {question}
      <button type="button" onClick={onSwitch} className={LINK_CLASS}>{actionLabel}</button>
    </p>
  )
}
