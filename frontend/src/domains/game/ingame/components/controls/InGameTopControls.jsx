import { INGAME_CONTROLS_ASSETS } from "../../constants/ingameControlsAssets.js"
import {
  INGAME_CONTROL_BTN_CLASS,
  INGAME_CONTROL_BTN_IMG_CLASS,
  INGAME_TOP_CONTROLS_POSITION_CLASS,
} from "../../constants/ingameControlsLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset"

/** 아이콘 버튼 하나를 그리는 내부 헬퍼 (설정·마이크가 이 컴포넌트를 재사용) */
function ControlButton({
  // ariaLabel: 스크린리더용 버튼 설명
  ariaLabel,
  // src: 버튼에 그릴 아이콘 이미지 경로
  src,
  // onClick: 버튼 클릭 시 호출되는 콜백
  onClick,
}) {
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
  // onMenuClick: 햄버거 버튼 클릭 시 호출되는 콜백 — 플레이어별 전적목록 패널을 염
  onMenuClick,
  // onMicClick: 마이크 버튼 클릭 시 호출되는 콜백
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
