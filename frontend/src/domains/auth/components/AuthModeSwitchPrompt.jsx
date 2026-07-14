// 로그인 폼/회원가입 폼 전환 안내 문구입니다.
export default function AuthModeSwitchPrompt({ question, actionLabel, onSwitch }) {
  return (
    <p className="mt-2 text-center font-subheading text-[13px] font-bold text-text-body">
      {question}{" "}
      <button type="button" onClick={onSwitch} className="auth-text-link">{actionLabel}</button>
    </p>
  )
}
