import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import {
  FORM_ACTION_BTN_CLASS,
  FORM_ACTION_LABEL_CLASS,
} from "../constants/gameSetupFormActions.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function GameSetupCreateButton({
  onClick,
  disabled = false,
  label = "게임 만들기",
  ariaLabel = label,
  busy = false,
  busyLabel = null,
}) {
  const displayLabel = busy && busyLabel ? busyLabel : label
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      onClick={onClick}
      disabled={disabled}
      className={FORM_ACTION_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={GAME_SETUP_ASSETS.createGameButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={FORM_ACTION_LABEL_CLASS}>{displayLabel}</span>
    </button>
  )
}
