// 일괄구매 확인 창 (닫기·제목·고른 상품 목록·합계)
// StoreSheets가 씀 (데스크톱 StoreBulkPurchaseOverlay·Panel 자리)
import { getItemDisplayIcon } from "@/domains/store/constants/storeItems.js"
import { calculateBulkPurchaseTotal } from "@/domains/store/utils/calculateBulkPurchaseTotal.js"
import { HEADER_CLASS, PURCHASE_TRANSITION, TITLE_CLASS } from "@/domains/store/constants/storeBulkPurchaseLayout.js"
import CenterModal from "../modal/CenterModal.jsx"
import { BULK_PANEL_CLASS } from "../modal/modalStyle.js"
import BulkItemRow from "./BulkItemRow.jsx"
import BulkSummary from "./BulkSummary.jsx"

// 몸통: 폰 세로는 목록 위·합계 아래, 가로·태블릿은 데스크톱처럼 왼쪽 목록 | 오른쪽 합계
const BODY_CLASS = "flex min-h-0 flex-1 flex-col md:max-h-[min(22rem,52vh)] md:flex-row land:flex-row"
const LIST_CLASS =
    "flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-2.5 md:border-r md:border-[#2a1810]/12 land:border-r land:border-[#2a1810]/12"

// 열렸고 고른 상품이 있을 때만 보임, 합계는 그릴 때마다 다시 셈 (데스크톱과 같음)
export default function BulkModal({ open, items, deadPreviewIds, onClose, onConfirm, purchaseState, onCheck, onRetry }) {
    const { total, hasPendingPrice } = calculateBulkPurchaseTotal(items)

    return (
        <CenterModal
            open={open && items.length > 0}
            ariaLabel="선택 상품 구매 확인"
            closeLabel="일괄구매 확인 닫기"
            closeSfx
            onClose={onClose}
            transition={PURCHASE_TRANSITION}
            panelClassName={BULK_PANEL_CLASS}
        >
            <header className={`${HEADER_CLASS} pr-14`}>
                <h2 className={TITLE_CLASS}>선택 상품 구매</h2>
            </header>
            <div className={BODY_CLASS}>
                <div className={LIST_CLASS} aria-label="선택한 상품 목록">
                    {items.map((item) => (
                        <BulkItemRow key={item.id} item={item} displayIcon={getItemDisplayIcon(item, deadPreviewIds.has(item.id))} />
                    ))}
                </div>
                <BulkSummary
                    total={total}
                    hasPendingPrice={hasPendingPrice}
                    onConfirm={onConfirm}
                    purchaseState={purchaseState}
                    onCheck={onCheck}
                    onRetry={onRetry}
                />
            </div>
        </CenterModal>
    )
}
