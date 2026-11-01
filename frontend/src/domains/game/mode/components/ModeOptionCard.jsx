// 모드 카드 하나: 틀 그림·제목·설명, 준비중이면 잠금
// GameModeOptionsArea가 씀
import {
  MODE_CARD_BUTTON_CLASS,
  FRAME_IMG_CLASS,
  MODE_CARD_WRAP_CLASS,
} from "@/domains/game/mode/constants/modeCardLayout.js"
import ModeOptionCardComingSoon from "@/domains/game/mode/components/ModeOptionCardComingSoon.jsx"
import ModeOptionCardOverlay from "@/domains/game/mode/components/ModeOptionCardOverlay.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 모드 카드 버튼
export default function ModeOptionCard({
  label,
  title,
  descriptionLines,
  frame,
  comingSoon = false,
  onSelect,
}) {
  return (
    <button
      type="button"
      aria-label={comingSoon ? `${label} 준비중` : label}
      disabled={comingSoon}
      onClick={onSelect}
      className={MODE_CARD_BUTTON_CLASS}
    >
      <div className={MODE_CARD_WRAP_CLASS}>
        <PublicAsset src={frame} alt={label} className={FRAME_IMG_CLASS} />
        <ModeOptionCardOverlay title={title} descriptionLines={descriptionLines} />
        {/* 준비중 모드면 가림막 */}
        {comingSoon ? <ModeOptionCardComingSoon /> : null}
      </div>
    </button>
  )
}
