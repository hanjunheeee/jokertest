import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import {
  STORE_BULK_PURCHASE_BODY_CLASS,
  STORE_BULK_PURCHASE_CLOSE_BTN_CLASS,
  STORE_BULK_PURCHASE_CLOSE_BTN_IMG_CLASS,
  STORE_BULK_PURCHASE_HEADER_CLASS,
  STORE_BULK_PURCHASE_PANEL_CLASS,
  STORE_BULK_PURCHASE_TITLE_CLASS,
} from "../../constants/storeBulkPurchaseLayout.js"
import { calculateBulkPurchaseTotal } from "../../utils/calculateBulkPurchaseTotal.js"
import StoreBulkPurchaseItemList from "./StoreBulkPurchaseItemList.jsx"
import StoreBulkPurchaseSummary from "./StoreBulkPurchaseSummary.jsx"

/** 일괄구매 확인 팝업 본문 */
export default function StoreBulkPurchasePanel({ items, deadPreviewIds, onClose, onConfirm, purchaseState, onCheck, onRetry }) {
  const { total, hasPendingPrice } = calculateBulkPurchaseTotal(items)

  return (
    <div className={STORE_BULK_PURCHASE_PANEL_CLASS}>
      <button
        type="button"
        aria-label="일괄구매 확인 닫기"
        onClick={onClose}
        // F-16(AC-01): 닫기 버튼의 의미는 취소다. backdrop·Escape와 같은 의미이고, 셋은 서로
        // 다른 물리 입력이라 각각 한 번씩 난다.
        data-sfx-kind="ui-cancel"
        className={STORE_BULK_PURCHASE_CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={STORE_ASSETS.popupCloseButton}
          alt=""
          className={STORE_BULK_PURCHASE_CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <header className={STORE_BULK_PURCHASE_HEADER_CLASS}>
        <h2 className={STORE_BULK_PURCHASE_TITLE_CLASS}>선택 상품 구매</h2>
      </header>

      <div className={STORE_BULK_PURCHASE_BODY_CLASS}>
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
