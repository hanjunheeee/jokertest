// 가게 패널 위에 뜨는 창 (스킨 전신·프로필 테두리 확대·일괄구매 확인)
// StorePanel이 패널 뒤에 붙여 씀
import StoreSkinZoomOverlay from "../skinZoom/StoreSkinZoomOverlay.jsx"
import ProfileBorderZoomOverlay from "@/shared/ui/profileBorderZoom/ProfileBorderZoomOverlay.jsx"
import StoreBulkPurchaseOverlay from "../bulkPurchase/StoreBulkPurchaseOverlay.jsx"
import { storePurchase } from "../../store/storePurchase.store.js"

// 창마다 열림 여부는 패널 훅(useStorePanel) 상태로 정함
export default function StorePanelOverlays({ panel }) {
  return (
    <>
      <StoreSkinZoomOverlay open={Boolean(panel.skinZoomItem)} item={panel.skinZoomItem} onClose={panel.closeSkinZoom} />

      <ProfileBorderZoomOverlay
        open={Boolean(panel.profileBorderZoomItem)}
        item={panel.profileBorderZoomItem}
        onClose={panel.closeProfileBorderZoom}
      />

      <StoreBulkPurchaseOverlay
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
