export default function AuthModeSwitchPrompt({ question, actionLabel, onSwitch }) {
  return (
    <p className="mt-2 text-center font-subheading app-text-scaled [--app-text-size:13px] font-bold text-text-body">
      {question}{" "}
      <button type="button" onClick={onSwitch} className="auth-text-link">{actionLabel}</button>
    </p>
  )
}
