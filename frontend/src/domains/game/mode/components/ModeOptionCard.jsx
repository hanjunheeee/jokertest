/**
 * 게임 모드·멀티플레이 옵션 선택용 이미지 카드 버튼
 * GameModePage, MultiplayEntryPage에서 GAME_MODES / MULTIPLAY_OPTIONS 목록을 map할 때 사용
 *
 * props
 * - label: 접근성·alt용 카드 이름 (예: "멀티플레이")
 * - title: 프레임 상단에 겹칠 모드명 (선택, 신라문화체)
 * - descriptionLines: 프레임 하단 설명 줄 배열 (선택, 나눔명조체)
 * - frame: 카드 프레임 이미지 경로 (modeAssets.js)
 * - onSelect: 카드 클릭 시 호출 (부모에서 라우팅·분기 처리)
 */
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  MODE_CARD_FRAME_IMAGE_CLASS,
  MODE_CARD_WRAP_CLASS,
} from "../constants/modeCardLayout.js"
import ModeOptionCardOverlay from "./ModeOptionCardOverlay.jsx"

const CARD_BTN_CLASS = "interactive-scale min-w-0 flex-1"

/** 프레임 이미지 한 장을 클릭 가능한 모드 선택 카드로 렌더 */
export default function ModeOptionCard({
  label,
  title,
  descriptionLines,
  frame,
  onSelect,
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onSelect}
      className={CARD_BTN_CLASS}
    >
      <div className={MODE_CARD_WRAP_CLASS}>
        <PublicAsset
          src={frame}
          alt={label}
          className={MODE_CARD_FRAME_IMAGE_CLASS}
        />

        <ModeOptionCardOverlay
          title={title}
          descriptionLines={descriptionLines}
        />
      </div>
    </button>
  )
}
