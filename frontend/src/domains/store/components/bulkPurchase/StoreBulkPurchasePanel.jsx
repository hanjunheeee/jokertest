import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  BODY_CLASS,
  CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS,
  HEADER_CLASS,
  PANEL_CLASS,
  TITLE_CLASS,
} from "../../constants/storeBulkPurchaseLayout.js"
import { calculateBulkPurchaseTotal } from "../../utils/calculateBulkPurchaseTotal.js"
import StoreBulkPurchaseItemList from "./StoreBulkPurchaseItemList.jsx"
import StoreBulkPurchaseSummary from "./StoreBulkPurchaseSummary.jsx"

export default function StoreBulkPurchasePanel({ items, deadPreviewIds, onClose, onConfirm, purchaseState, onCheck, onRetry }) {
  const { total, hasPendingPrice } = calculateBulkPurchaseTotal(items)

  return (
    <div className={PANEL_CLASS}>
      <button
        type="button"
        aria-label="일괄구매 확인 닫기"
        onClick={onClose}
        data-sfx-kind="ui-cancel"
        className={CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={STORE_ASSETS.popupCloseButton}
          alt=""
          className={CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <header className={HEADER_CLASS}>
        <h2 className={TITLE_CLASS}>선택 상품 구매</h2>
      </header>

      <div className={BODY_CLASS}>
        <StoreBulkPurchaseItemList items={items} deadPreviewIds={deadPreviewIds} />
        <StoreBulkPurchaseSummary
          total={total}
          hasPendingPrice={hasPendingPrice}
          onConfirm={onConfirm}
          purchaseState={purchaseState}
          onCheck={onCheck}
          onRetry={onRetry}
        />
      </div>
    </div>
  )
}
