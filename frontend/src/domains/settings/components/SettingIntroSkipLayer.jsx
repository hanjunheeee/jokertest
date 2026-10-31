export default function SettingIntroSkipLayer({ visible, onSkip }) {
  if (!visible) return null

  return (
    <button
      type="button"
      aria-label="인트로 건너뛰기"
      onClick={onSkip}
      className="absolute inset-0 z-30 cursor-pointer border-0 bg-transparent p-0"
    />
  )
}
