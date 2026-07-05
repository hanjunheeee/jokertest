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

/** 인게임 좌측 상단 — 햄버거(전적목록)·마이크 버튼 */
export default function InGameTopControls({
  onMenuClick,
  onMicClick,
  className = INGAME_TOP_CONTROLS_POSITION_CLASS,
}) {
  return (
    <div className={className} aria-label="인게임 컨트롤">
      <ControlButton
        ariaLabel="플레이어별 전적목록"
        src={INGAME_CONTROLS_ASSETS.settings}
        onClick={onMenuClick}
      />
      <ControlButton
        ariaLabel="마이크"
        src={INGAME_CONTROLS_ASSETS.mic}
        onClick={onMicClick}
      />
    </div>
  )
}
