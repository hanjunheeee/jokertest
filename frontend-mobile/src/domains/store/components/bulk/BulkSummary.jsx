// 일괄구매 합계 칸 (소비 골드·구매 결과 안내·구매하기 버튼)
// bulk/BulkModal이 씀 (데스크톱 StoreBulkPurchaseSummary와 같은 차례·글)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import {
    CONFIRM_BTN_LABEL_CLASS,
    TOTAL_AMOUNT_CLASS,
    TOTAL_AMOUNT_ROW_CLASS,
    TOTAL_ICON_CLASS,
    TOTAL_LABEL_CLASS,
    TOTAL_PENDING_CLASS,
    TOTAL_ROW_CLASS,
} from "@/domains/store/constants/storeBulkPurchaseLayout.js"
import PurchaseFeedback from "../feedback/PurchaseFeedback.jsx"
import PurchaseButton from "../detail/PurchaseButton.jsx"

// 가격 미정·결과 기다림·결과 모름·이미 완료·기록 막힘이면 잠금 (두 번 사기 막기, 데스크톱과 같은 목록)
const LOCKED_STATUSES = ["pending", "unknown", "confirmed", "blocked"]

// 칸 모양: 폰 세로는 목록 아래 한 줄로 길게, 가로·태블릿은 데스크톱처럼 오른쪽 칸
const SUMMARY_CLASS =
    "flex shrink-0 flex-col gap-3 border-t border-[#2a1810]/12 px-3 py-3 md:w-[13rem] md:justify-between md:border-t-0 land:w-[12rem] land:justify-between land:border-t-0"

// 가격 미정 상품이 끼면 합계 대신 준비중
export default function BulkSummary({ total, hasPendingPrice, onConfirm, purchaseState, onCheck, onRetry }) {
    return (
        <aside className={SUMMARY_CLASS} aria-label="구매 합계">
            <div className={TOTAL_ROW_CLASS}>
                <p className={TOTAL_LABEL_CLASS}>소비 재화</p>
                {hasPendingPrice ? (
                    <p className={TOTAL_PENDING_CLASS}>준비중</p>
                ) : (
                    <div className={TOTAL_AMOUNT_ROW_CLASS}>
                        <PublicAsset src={STORE_ASSETS.currencyIcon} alt="" className={TOTAL_ICON_CLASS} />
                        <span className={TOTAL_AMOUNT_CLASS}>{total.toLocaleString()} 골드</span>
                    </div>
                )}
            </div>

            <PurchaseFeedback state={purchaseState} onCheck={onCheck} onRetry={onRetry} />
            <PurchaseButton
                label="구매하기"
                className="h-12! w-full max-w-[13rem] self-center"
                dimDisabled={false}
                labelClassName={CONFIRM_BTN_LABEL_CLASS}
                sfx="ui-confirm"
                onClick={onConfirm}
                disabled={hasPendingPrice || LOCKED_STATUSES.includes(purchaseState.status)}
            />
        </aside>
    )
}
