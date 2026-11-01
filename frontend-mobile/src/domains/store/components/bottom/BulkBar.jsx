// 일괄구매 중 바닥 줄 (고른 개수·합계·끄기·구매 버튼), 화면 틀 바닥 자리에 그림
// pages/StorePage가 일괄구매 중일 때 씀 (데스크톱은 설명 칸 구매 버튼이 이 일을 함)
import { calculateBulkPurchaseTotal } from "@/domains/store/utils/calculateBulkPurchaseTotal.js"
import { isPurchaseDisabled } from "@/domains/store/utils/storePanel.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import PurchaseButton from "../detail/PurchaseButton.jsx"

// 구매 버튼은 확인 시트를 엶, 잠금은 데스크톱 설명 칸 버튼과 같은 식(isPurchaseDisabled)
export default function BulkBar({ panel }) {
    const items = panel.bulkSelectedItems
    const { total, hasPendingPrice } = calculateBulkPurchaseTotal(items)
    const purchaseDisabled = !panel.currentItem || isPurchaseDisabled({
        currentItem: panel.currentItem,
        bulkMode: panel.bulkMode,
        bulkSelectedIds: panel.bulkSelectedIds,
        ownedItemIds: panel.ownedItemIds,
        purchaseLocked: panel.purchaseLocked,
        economyStatus: panel.economyStatus,
    })

    return (
        <ShellBottom>
            <div className="flex items-center gap-2 border-t border-[#8b7355]/50 bg-[#f5f0e6]/95 px-3 py-2 [box-shadow:0_-6px_18px_rgba(26,15,10,0.3)]">
                <div className="flex min-w-0 flex-1 flex-col font-subheading" role="status">
                    <p className="app-text-scaled [--app-text-size:0.88rem] font-bold text-[#3d1810]">{items.length}개 선택</p>
                    <p className="truncate app-text-scaled [--app-text-size:0.8rem] font-bold tabular-nums text-[#5c554d]">
                        {hasPendingPrice ? "준비중" : `${total.toLocaleString()} 골드`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => panel.handleBulkModeChange(false)}
                    data-sfx-kind="ui-cancel"
                    className="min-h-11 shrink-0 cursor-pointer rounded-md border border-[#8b7355]/55 bg-transparent px-3 font-subheading text-sm font-bold text-[#2a1810] active:bg-[#1a0f0a]/10"
                >
                    선택 취소
                </button>
                <PurchaseButton label="구매" className="w-28" onClick={panel.handlePurchaseClick} disabled={purchaseDisabled} />
            </div>
        </ShellBottom>
    )
}
