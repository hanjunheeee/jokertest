// 가게 패널 (구매 알림·상품 칸·고른 상품 설명·분류 사이드바, 상태는 useStorePanel)
// 가게 화면이 씀
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import StoreItemGrid from "./StoreItemGrid.jsx"
import StoreSelectedItemDetail from "./StoreSelectedItemDetail.jsx"
import StoreSidebar from "./StoreSidebar.jsx"
import StorePanelOverlays from "./StorePanelOverlays.jsx"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import { getStoreItemDisplayIcon } from "../../constants/storeItems.js"
import { storePurchase } from "../../store/storePurchase.store.js"
import {
  STORE_PANEL_CLASS,
  STORE_PANEL_CONTENT_CLASS,
  STORE_PANEL_FRAME_CLASS,
  STORE_PANEL_GRID_COLUMN_CLASS,
  STORE_PANEL_INNER_PAD,
  STORE_PANEL_MAIN_ROW_CLASS,
  STORE_PANEL_SCROLL_AREA_CLASS,
  STORE_PANEL_SIDEBAR_CLASS,
} from "../../constants/storeLayoutStyle.js"
import { useStorePanel } from "../../hooks/useStorePanel.js"
import { isPurchaseDisabled, isRealPurchaseCategory } from "../../utils/storePanel.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import StorePurchaseFeedback from "../StorePurchaseFeedback.jsx"

export default function StorePanel({ visible = true }) {
  const panel = useStorePanel()
  const { activeCategory, currentItem, bulkMode, ownedItemIds } = panel

  return (
    <>
      <motion.div
        className={STORE_PANEL_CLASS}
        initial={{ opacity: 0, y: 10 }}
        animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={UI_REVEAL_TRANSITION}
        style={{ pointerEvents: visible ? "auto" : "none" }}
      >
        <div className="relative w-full">
          <PublicAsset src={STORE_ASSETS.panelFrame} alt="" className={STORE_PANEL_FRAME_CLASS} />

          <div className={STORE_PANEL_CONTENT_CLASS} style={STORE_PANEL_INNER_PAD}>
            <StorePurchaseFeedback state={panel.purchaseState} onCheck={storePurchase.check} onRetry={storePurchase.retry} />
            <div className={STORE_PANEL_MAIN_ROW_CLASS}>
              <div className={STORE_PANEL_GRID_COLUMN_CLASS}>
                <div
                  className={`${STORE_PANEL_SCROLL_AREA_CLASS} ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
                >
                  <StoreItemGrid
                    items={panel.visibleItems}
                    selectedItemId={currentItem?.id ?? null}
                    onSelectItem={panel.setSelectedItem}
                    deadPreviewIds={panel.deadPreviewIds}
                    onToggleDeadPreview={panel.toggleDeadPreview}
                    onOpenSkinZoom={panel.openSkinZoom}
                    onOpenProfileBorderZoom={panel.openProfileBorderZoom}
                    showBulkPurchase={isRealPurchaseCategory(activeCategory)}
                    showSkinNotice={activeCategory === "스킨"}
                    bulkMode={bulkMode}
                    bulkSelectedIds={panel.bulkSelectedIds}
                    ownedItemIds={ownedItemIds}
                    selectionDisabled={panel.selectionLocked}
                    onBulkModeChange={panel.handleBulkModeChange}
                    onBulkSelectionChange={panel.handleBulkSelectionChange}
                  />
                </div>

                {currentItem ? (
                  <StoreSelectedItemDetail
                    item={currentItem}
                    displayIcon={getStoreItemDisplayIcon(
                      currentItem,
                      panel.isDeadPreview(currentItem.id),
                    )}
                    onPurchaseClick={panel.handlePurchaseClick}
                    owned={!bulkMode && ownedItemIds.has(currentItem.id)}
                    purchaseLabel={bulkMode ? null : panel.purchaseLabel}
                    purchaseDisabled={isPurchaseDisabled({
                      currentItem,
                      bulkMode,
                      bulkSelectedIds: panel.bulkSelectedIds,
                      ownedItemIds,
                      purchaseLocked: panel.purchaseLocked,
                      economyStatus: panel.economyStatus,
                    })}
                  />
                ) : null}
              </div>

              <aside className={STORE_PANEL_SIDEBAR_CLASS}>
                <StoreSidebar
                  categories={panel.categories}
                  activeCategory={activeCategory}
                  onSelectCategory={panel.selectCategory}
                />
              </aside>
            </div>
          </div>
        </div>
      </motion.div>

      <StorePanelOverlays panel={panel} />
    </>
  )
}
