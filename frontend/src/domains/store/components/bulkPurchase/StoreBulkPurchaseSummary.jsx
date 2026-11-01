import StorePurchaseFeedback from "../StorePurchaseFeedback.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  CONFIRM_BTN_CLASS,
  CONFIRM_BTN_IMG_CLASS,
  CONFIRM_BTN_LABEL_CLASS,
  SUMMARY_CLASS,
  TOTAL_AMOUNT_CLASS,
  TOTAL_AMOUNT_ROW_CLASS,
  TOTAL_ICON_CLASS,
  TOTAL_LABEL_CLASS,
  TOTAL_PENDING_CLASS,
  TOTAL_ROW_CLASS,
} from "../../constants/storeBulkPurchaseLayout.js"

export default function StoreBulkPurchaseSummary({ total, hasPendingPrice, onConfirm, purchaseState = { status: "idle" }, onCheck, onRetry }) {
  return (
    <aside className={SUMMARY_CLASS} aria-label="구매 합계">
      <div className={TOTAL_ROW_CLASS}>
        <p className={TOTAL_LABEL_CLASS}>소비 재화</p>
        {hasPendingPrice ? (
          <p className={TOTAL_PENDING_CLASS}>준비중</p>
        ) : (
          <div className={TOTAL_AMOUNT_ROW_CLASS}>
            <PublicAsset
              src={STORE_ASSETS.currencyIcon}
              alt=""
              className={TOTAL_ICON_CLASS}
            />
            <span className={TOTAL_AMOUNT_CLASS}>{total.toLocaleString()} 골드</span>
          </div>
        )}
      </div>

      <StorePurchaseFeedback state={purchaseState} onCheck={onCheck} onRetry={onRetry} />
      <button
        type="button"
        className={CONFIRM_BTN_CLASS}
        style={{ outline: "none" }}
        aria-label="구매하기"
        onClick={onConfirm}
        data-sfx-kind="ui-confirm"
        disabled={hasPendingPrice || ["pending", "unknown", "confirmed", "blocked"].includes(purchaseState.status)}
      >
        <PublicAsset
          src={STORE_ASSETS.purchaseButton}
          alt=""
          className={CONFIRM_BTN_IMG_CLASS}
        />
        <span className={CONFIRM_BTN_LABEL_CLASS}>구매하기</span>
      </button>
    </aside>
  )
}
