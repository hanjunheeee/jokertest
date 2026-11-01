import StorePurchaseFeedback from "../StorePurchaseFeedback.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
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

export default function StoreBulkPurchaseSummary({ total, hasPendingPrice, onConfirm, purchaseState = { status: "idle" }, onCheck, onRetry }) {
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
            <span className={STORE_BULK_PURCHASE_TOTAL_AMOUNT_CLASS}>{total.toLocaleString()} 골드</span>
          </div>
        )}
      </div>

      <StorePurchaseFeedback state={purchaseState} onCheck={onCheck} onRetry={onRetry} />
      <button
        type="button"
        className={STORE_BULK_PURCHASE_CONFIRM_BTN_CLASS}
        style={{ outline: "none" }}
        aria-label="구매하기"
        onClick={onConfirm}
        data-sfx-kind="ui-confirm"
        disabled={hasPendingPrice || ["pending", "unknown", "confirmed", "blocked"].includes(purchaseState.status)}
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
