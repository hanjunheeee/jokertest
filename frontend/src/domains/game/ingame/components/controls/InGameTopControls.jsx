import { INGAME_CONTROLS_ASSETS } from "../../constants/ingameControlsAssets.js"
import {
  INGAME_CONTROL_BTN_CLASS,
  INGAME_CONTROL_BTN_IMG_CLASS,
  INGAME_TOP_CONTROLS_POSITION_CLASS,
} from "../../constants/ingameControlsLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

function ControlButton({ ariaLabel, src, onClick }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={INGAME_CONTROL_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={src} alt="" className={INGAME_CONTROL_BTN_IMG_CLASS} />
    </button>
  )
}

/** 인게임 좌측 상단 — 설정·마이크 버튼 */
export default function InGameTopControls({
  onSettingsClick,
  onMicClick,
  className = INGAME_TOP_CONTROLS_POSITION_CLASS,
}) {
  return (
    <div className={className} aria-label="인게임 컨트롤">
      <ControlButton
        ariaLabel="설정"
        src={INGAME_CONTROLS_ASSETS.settings}
        onClick={onSettingsClick}
      />
      <ControlButton
        ariaLabel="마이크"
        src={INGAME_CONTROLS_ASSETS.mic}
        onClick={onMicClick}
      />
    </div>
  )
}
