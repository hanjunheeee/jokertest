// 그림 버튼 하나 (수락 그림 = 만들기·저장, 취소 그림 = 취소)
// actions/SetupActions가 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import { GAME_SETUP_ASSETS } from "@/domains/game/setup/constants/gameSetupAssets.js"

const BTN_CLASS =
  "group relative block w-full max-w-60 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60"

const LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:1.1rem] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 취소면 닫기 효과음(data-sfx-kind), 만들기면 기본 클릭음
export default function ActionButton({ kind = "submit", label, ariaLabel = label, busy = false, disabled, onClick }) {
  const isCancel = kind === "cancel"
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onClick}
      data-sfx-kind={isCancel ? "ui-cancel" : undefined}
      className={BTN_CLASS}
    >
      <PublicAsset
        src={isCancel ? GAME_SETUP_ASSETS.cancelButton : GAME_SETUP_ASSETS.createGameButton}
        alt=""
        className="block h-14 w-full select-none object-fill transition-transform group-active:scale-[0.97] land:h-11"
      />
      <span className={LABEL_CLASS}>{label}</span>
    </button>
  )
}
