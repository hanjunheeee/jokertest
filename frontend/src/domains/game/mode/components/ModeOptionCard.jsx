// 파일 역할: ModeOptionCard.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  MODE_CARD_FRAME_IMAGE_CLASS,
  MODE_CARD_WRAP_CLASS,
} from "@/domains/game/mode/constants/modeCardLayout.js"
import ModeOptionCardOverlay from "@/domains/game/mode/components/ModeOptionCardOverlay.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const CARD_BTN_CLASS = "interactive-scale min-w-0 flex-1"

// 게임 모드 선택 화면에서 하나의 선택 카드를 보여줍니다.
export default function ModeOptionCard({ label, title, descriptionLines, frame, onSelect }) {
  return (
    <button type="button" aria-label={label} onClick={onSelect} className={CARD_BTN_CLASS}>
      <div className={MODE_CARD_WRAP_CLASS}>
        <PublicAsset src={frame} alt={label} className={MODE_CARD_FRAME_IMAGE_CLASS} />
        <ModeOptionCardOverlay title={title} descriptionLines={descriptionLines} />
      </div>
    </button>
  )
}
