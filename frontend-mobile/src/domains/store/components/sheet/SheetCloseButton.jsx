// 시트 닫기 그림 버튼 (데스크톱 겹창 닫기 그림 그대로)
// sheet/ 아래 BottomSheet·FullSheet가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { CLOSE_BTN_CLASS, CLOSE_IMG_CLASS } from "./sheetStyle.js"

// 누르면 취소 소리(data-sfx-kind)
export default function SheetCloseButton({ label, onClose }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClose}
            data-sfx-kind="ui-cancel"
            className={CLOSE_BTN_CLASS}
            style={{ outline: "none" }}
        >
            <PublicAsset src={STORE_ASSETS.popupCloseButton} alt="" className={CLOSE_IMG_CLASS} />
        </button>
    )
}
