// 스킨 전신 보기 창 안쪽 (닫기 버튼·전신 그림)
// StoreSkinZoomOverlay가 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS,
  PANEL_CLASS,
} from "../../constants/storeSkinZoomLayout.js"
import { getSkinZoomIcon } from "../../constants/storeItems.js"
import StoreSkinZoomIllustration from "./StoreSkinZoomIllustration.jsx"

// 전신 그림이 없으면 칸 그림으로 대신함
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
