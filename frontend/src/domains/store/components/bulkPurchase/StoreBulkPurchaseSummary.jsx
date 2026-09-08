import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import {
  STORE_BULK_PURCHASE_CONFIRM_BTN_CLASS,
  STORE_BULK_PURCHASE_CONFIRM_BTN_IMAGE_CLASS,
  STORE_BULK_PURCHASE_CONFIRM_BTN_LABEL_CLASS,
  STORE_BULK_PURCHASE_SUMMARY_CLASS,
  STORE_BULK_PURCHASE_TOTAL_AMOUNT_CLASS,
  STORE_BULK_PURCHASE_TOTAL_AMOUNT_ROW_CLASS,
  STORE_BULK_PURCHASE_TOTAL_ICON_CLASS,
  STORE_BULK_PURCHASE_TOTAL_LABEL_CLASS,
  STORE_BULK_PURCHASE_TOTAL_PENDING_CLASS,
  STORE_BULK_PURCHASE_TOTAL_ROW_CLASS,
} from "../../constants/storeBulkPurchaseLayout.js"

/** 일괄구매 확인 — 합계·구매 버튼 */
export default function StoreBulkPurchaseSummary({ total, hasPendingPrice, onConfirm }) {
  return (
    <aside className={STORE_BULK_PURCHASE_SUMMARY_CLASS} aria-label="구매 합계">
      <div className={STORE_BULK_PURCHASE_TOTAL_ROW_CLASS}>
        <p className={STORE_BULK_PURCHASE_TOTAL_LABEL_CLASS}>소비 재화</p>
        {hasPendingPrice ? (
          <p className={STORE_BULK_PURCHASE_TOTAL_PENDING_CLASS}>준비중</p>
        ) : (
          <div className={STORE_BULK_PURCHASE_TOTAL_AMOUNT_ROW_CLASS}>
            <PublicAsset
              src={STORE_ASSETS.currencyIcon}
              alt=""
              className={STORE_BULK_PURCHASE_TOTAL_ICON_CLASS}
            />
            <span className={STORE_BULK_PURCHASE_TOTAL_AMOUNT_CLASS}>{total.toLocaleString()}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className={STORE_BULK_PURCHASE_CONFIRM_BTN_CLASS}
        style={{ outline: "none" }}
        aria-label="구매하기"
        onClick={onConfirm}
      >
        <PublicAsset
          src={STORE_ASSETS.purchaseButton}
          alt=""
          className={STORE_BULK_PURCHASE_CONFIRM_BTN_IMAGE_CLASS}
        />
        <span className={STORE_BULK_PURCHASE_CONFIRM_BTN_LABEL_CLASS}>구매하기</span>
      </button>
    </aside>
  )
}
