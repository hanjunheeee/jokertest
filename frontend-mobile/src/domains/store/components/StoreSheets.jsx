// 상점 판 위에 뜨는 창 모음 (스킨 전신·프로필 테두리 확대·일괄구매 확인)
// pages/StorePage가 씀 (데스크톱 StorePanelOverlays 자리, 같은 차례)
import { storePurchase } from "@/domains/store/store/storePurchase.store.js"
import SkinZoomModal from "./zoom/SkinZoomModal.jsx"
import BorderZoomModal from "./zoom/BorderZoomModal.jsx"
import BulkModal from "./bulk/BulkModal.jsx"

// 창마다 열림 여부는 패널 훅(useStorePanel) 상태로 정함
export default function StoreSheets({ panel }) {
    return (
        <>
            <SkinZoomModal item={panel.skinZoomItem} onClose={panel.closeSkinZoom} />
            <BorderZoomModal item={panel.profileBorderZoomItem} onClose={panel.closeProfileBorderZoom} />
            <BulkModal
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
