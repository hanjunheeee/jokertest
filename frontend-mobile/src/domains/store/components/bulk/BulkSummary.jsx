// 일괄구매 시트 바닥 줄 (소비 골드·구매 결과 안내·구매하기 버튼)
// bulk/BulkSheet가 시트 footer로 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import PurchaseFeedback from "../feedback/PurchaseFeedback.jsx"
import PurchaseButton from "../detail/PurchaseButton.jsx"

// 가격 미정·결과 기다림·결과 모름·이미 완료·기록 막힘이면 잠금 (두 번 사기 막기, 데스크톱과 같은 목록)
const LOCKED_STATUSES = ["pending", "unknown", "confirmed", "blocked"]

// 가격 미정 상품이 끼면 합계 대신 준비중
export default function BulkSummary({ count, total, hasPendingPrice, onConfirm, purchaseState, onCheck, onRetry }) {
    return (
        <aside className="flex flex-col gap-2" aria-label="구매 합계">
            <PurchaseFeedback state={purchaseState} onCheck={onCheck} onRetry={onRetry} />
            <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col font-subheading">
                    <p className="app-text-scaled [--app-text-size:0.85rem] font-bold text-[#3d1810]">소비 재화 · {count}개</p>
                    {hasPendingPrice ? (
                        <p className="app-text-scaled [--app-text-size:1rem] font-bold text-[#5c554d]">준비중</p>
                    ) : (
                        <div className="flex items-center gap-1">
                            <PublicAsset src={STORE_ASSETS.currencyIcon} alt="" className="block h-5 w-auto shrink-0 select-none object-contain" />
                            <span className="app-text-scaled [--app-text-size:1.12rem] font-extrabold tabular-nums text-[#140c08]">
                                {total.toLocaleString()} 골드
                            </span>
                        </div>
                    )}
                </div>
                <PurchaseButton
                    label="구매하기"
                    className="w-36"
                    sfx="ui-confirm"
                    onClick={onConfirm}
                    disabled={hasPendingPrice || LOCKED_STATUSES.includes(purchaseState.status)}
                />
            </div>
        </aside>
    )
}
