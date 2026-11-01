// 설정 패널 취소 버튼 (취소 그림 + 글자)
// GameSetupPanel이 씀
import { GAME_SETUP_ASSETS } from "../constants/gameSetupAssets.js"
import {
  FORM_ACTION_BTN_CLASS,
  FORM_ACTION_LABEL_CLASS,
} from "../constants/gameSetupFormActions.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 취소 버튼 (닫기 효과음은 data-sfx-kind로 냄)
export default function GameSetupCancelButton({
  onClick,
  disabled = false,
  label = "취소",
  ariaLabel = label,
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      data-sfx-kind="ui-cancel"
      className={FORM_ACTION_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={GAME_SETUP_ASSETS.cancelButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className={FORM_ACTION_LABEL_CLASS}>{label}</span>
    </button>
  )
}
