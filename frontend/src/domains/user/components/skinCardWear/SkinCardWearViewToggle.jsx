import { SKIN_CARD_WEAR_ASSETS } from "../../constants/skinCardWear/skinCardWearAssets.js"
import {
  SKIN_CARD_WEAR_PREVIEW_MODE_CARD,
  SKIN_CARD_WEAR_PREVIEW_MODE_SKIN,
  VIEW_TOGGLE_BTN_CLASS,
  VIEW_TOGGLE_IMG_CLASS,
  VIEW_TOGGLE_WRAP_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

export default function SkinCardWearViewToggle({ previewMode, onToggle }) {
  const isSkinMode = previewMode === SKIN_CARD_WEAR_PREVIEW_MODE_SKIN

  return (
    <div className={VIEW_TOGGLE_WRAP_CLASS}>
      <button
        type="button"
        aria-label={isSkinMode ? "플레이어 카드 미리보기로 전환" : "스킨 일러스트 미리보기로 전환"}
        aria-pressed={!isSkinMode}
        onClick={onToggle}
        className={VIEW_TOGGLE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={SKIN_CARD_WEAR_ASSETS.previewToggleButton}
          alt=""
          className={VIEW_TOGGLE_IMG_CLASS}
        />
      </button>
    </div>
  )
}
