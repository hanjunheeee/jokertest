// 상점 위에 뜨는 시트 모음 (상품 설명·스킨 전신·프로필 테두리 확대·일괄구매 확인)
// pages/StorePage가 씀 (데스크톱 StorePanelOverlays 자리)
import { storePurchase } from "@/domains/store/store/storePurchase.store.js"
import DetailSheet from "./detail/DetailSheet.jsx"
import BulkSheet from "./bulk/BulkSheet.jsx"
import SkinZoomSheet from "./zoom/SkinZoomSheet.jsx"
import BorderZoomSheet from "./zoom/BorderZoomSheet.jsx"

// 열림 여부는 패널 훅(useStorePanel) 상태, 설명 시트만 페이지 상태 (일괄구매 중엔 안 엶)
export default function StoreSheets({ panel, detailOpen, onCloseDetail }) {
    return (
        <>
            <DetailSheet open={detailOpen && !panel.bulkMode} onClose={onCloseDetail} panel={panel} />
            <SkinZoomSheet item={panel.skinZoomItem} onClose={panel.closeSkinZoom} />
            <BorderZoomSheet item={panel.profileBorderZoomItem} onClose={panel.closeProfileBorderZoom} />
            <BulkSheet
                open={panel.bulkPurchaseOpen}
                items={panel.bulkSelectedItems}
                deadPreviewIds={panel.deadPreviewIds}
                onClose={panel.closeBulkPurchase}
                onConfirm={panel.handleBulkPurchaseConfirm}
                purchaseState={panel.purchaseState}
                onCheck={storePurchase.check}
                onRetry={storePurchase.retry}
            />
        </>
    )
}
