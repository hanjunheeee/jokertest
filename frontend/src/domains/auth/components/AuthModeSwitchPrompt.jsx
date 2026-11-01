// 로그인↔가입 모드 바꾸기 한 줄 (질문 + 글자 버튼)
// components/LoginForm.jsx, components/SignupForm.jsx가 사용

// 버튼이 type=button이라 눌러도 액자 form 제출 안 됨
export default function AuthModeSwitchPrompt({ question, actionLabel, onSwitch }) {
  return (
    <p className="mt-2 text-center font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body">
      {question}{" "}
      <button type="button" onClick={onSwitch} className="auth-text-link">{actionLabel}</button>
    </p>
  )
}
