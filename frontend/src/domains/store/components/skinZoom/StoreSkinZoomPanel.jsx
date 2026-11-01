import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS,
  PANEL_CLASS,
} from "../../constants/storeSkinZoomLayout.js"
import { getSkinZoomIcon } from "../../constants/storeItems.js"
import StoreSkinZoomIllustration from "./StoreSkinZoomIllustration.jsx"

export default function StoreSkinZoomPanel({ item, onClose }) {
  return (
    <div className={PANEL_CLASS}>
      <button
        type="button"
        aria-label="스킨 확대 보기 닫기"
        onClick={onClose}
        className={CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={STORE_ASSETS.popupCloseButton}
          alt=""
          className={CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <StoreSkinZoomIllustration src={getSkinZoomIcon(item)} name={item.name} />
    </div>
  )
}
