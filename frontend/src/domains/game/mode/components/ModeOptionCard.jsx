/**
 * 게임 모드·멀티플레이 옵션 선택용 이미지 카드 버튼
 * GameModePage, MultiplayEntryPage에서 GAME_MODES / MULTIPLAY_OPTIONS 목록을 map할 때 사용
 *
 * props
 * - label: 접근성·alt용 카드 이름 (예: "멀티플레이")
 * - frame: 카드 프레임 이미지 경로 (modeAssets.js)
 * - onSelect: 카드 클릭 시 호출 (부모에서 라우팅·분기 처리)
 */
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const CARD_BTN_CLASS = "interactive-scale min-w-0 flex-1"

const CARD_IMAGE_CLASS =
  "pointer-events-none mx-auto block h-auto w-full max-w-[clamp(13rem,24vw,20.5rem)] select-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"

/** 프레임 이미지 한 장을 클릭 가능한 모드 선택 카드로 렌더 */
export default function ModeOptionCard({ label, frame, onSelect }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onSelect}
      className={CARD_BTN_CLASS}
    >
      <PublicAsset src={frame} alt={label} className={CARD_IMAGE_CLASS} />
    </button>
  )
}
