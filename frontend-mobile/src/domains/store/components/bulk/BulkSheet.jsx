// 일괄구매 확인 시트 (화면 전체: 고른 상품 목록 + 바닥 합계·구매하기)
// pages/StorePage가 씀 (데스크톱 StoreBulkPurchaseOverlay 대신)
import { getItemDisplayIcon } from "@/domains/store/constants/storeItems.js"
import { calculateBulkPurchaseTotal } from "@/domains/store/utils/calculateBulkPurchaseTotal.js"
import FullSheet from "../sheet/FullSheet.jsx"
import BulkItemRow from "./BulkItemRow.jsx"
import BulkSummary from "./BulkSummary.jsx"

// 열렸고 고른 상품이 있을 때만 보임, 합계는 그릴 때마다 다시 셈 (데스크톱과 같음)
export default function BulkSheet({ open, items, deadPreviewIds, onClose, onConfirm, purchaseState, onCheck, onRetry }) {
    const { total, hasPendingPrice } = calculateBulkPurchaseTotal(items)

    return (
        <FullSheet
            open={open && items.length > 0}
            title="선택 상품 구매"
            closeLabel="일괄구매 확인 닫기"
            onClose={onClose}
            bodyClassName="px-4 py-3"
            footer={(
                <BulkSummary
                    count={items.length}
                    total={total}
                    hasPendingPrice={hasPendingPrice}
                    onConfirm={onConfirm}
                    purchaseState={purchaseState}
                    onCheck={onCheck}
                    onRetry={onRetry}
                />
            )}
        >
            <div className="flex flex-col gap-2 md:grid md:grid-cols-2 land:grid land:grid-cols-2" aria-label="선택한 상품 목록">
                {items.map((item) => (
                    <BulkItemRow key={item.id} item={item} displayIcon={getItemDisplayIcon(item, deadPreviewIds.has(item.id))} />
                ))}
            </div>
        </FullSheet>
    )
}
