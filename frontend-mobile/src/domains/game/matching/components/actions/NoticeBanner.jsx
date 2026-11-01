// 바닥 줄 위 안내 띠: 문구 + 버튼 하나 (설정 저장 결과 확인 대기·저장 결과 안내)
// ActionBar가 씀, 데스크톱 SettingsPendingNotice·RoomSettingsResultNotice와 같은 문구·동작
export default function NoticeBanner({ role = "status", ariaLabel, message, actionLabel, actionAriaLabel, onAction }) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className="flex items-center gap-2 rounded-md border border-[#c9b892]/60 bg-black/80 px-3 py-1.5 text-[#f5f0e6]"
    >
      <span className="min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:0.85rem] leading-snug">
        {message}
      </span>
      {/* 버튼 함수 받았을 때만 */}
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          aria-label={actionAriaLabel ?? actionLabel}
          className="min-h-11 shrink-0 cursor-pointer rounded border border-[#c9b892]/60 bg-transparent px-3 font-bold text-[#f5f0e6] active:scale-95"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
