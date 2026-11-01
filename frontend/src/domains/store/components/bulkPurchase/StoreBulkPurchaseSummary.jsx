// 일괄구매 합계 칸 (소비 골드·구매 결과 안내·구매하기 버튼)
// StoreBulkPurchasePanel이 씀
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

// 가격 미정 상품이 끼면 합계 대신 준비중
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
      {/* 가격 미정·결과 기다림·결과 모름·이미 완료·기록 막힘이면 잠금 (두 번 사기 막기) */}
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
