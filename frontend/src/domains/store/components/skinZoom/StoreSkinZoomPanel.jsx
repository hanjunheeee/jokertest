import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import {
  STORE_SKIN_ZOOM_CLOSE_BTN_CLASS,
  STORE_SKIN_ZOOM_CLOSE_BTN_IMG_CLASS,
  STORE_SKIN_ZOOM_PANEL_CLASS,
} from "../../constants/storeSkinZoomLayout.js"
import { getStoreSkinZoomIcon } from "../../constants/storeItems.js"
import StoreSkinZoomIllustration from "./StoreSkinZoomIllustration.jsx"

/** 스킨 확대 팝업 — 프레임·전신 일러스트·닫기 버튼 */
export default function StoreSkinZoomPanel({ item, onClose }) {
  return (
    <div className={STORE_SKIN_ZOOM_PANEL_CLASS}>
      <button
        type="button"
        aria-label="스킨 확대 보기 닫기"
        onClick={onClose}
        className={STORE_SKIN_ZOOM_CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={STORE_ASSETS.popupCloseButton}
          alt=""
          className={STORE_SKIN_ZOOM_CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <StoreSkinZoomIllustration src={getStoreSkinZoomIcon(item)} name={item.name} />
    </div>
  )
}
