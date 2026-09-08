import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import StoreItemGrid from "./StoreItemGrid.jsx"
import StoreSelectedItemDetail from "./StoreSelectedItemDetail.jsx"
import StoreSidebar from "./StoreSidebar.jsx"
import StoreSkinZoomOverlay from "../skinZoom/StoreSkinZoomOverlay.jsx"
import ProfileBorderZoomOverlay from "@/shared/ui/profileBorderZoom/ProfileBorderZoomOverlay.jsx"
import StoreBulkPurchaseOverlay from "../bulkPurchase/StoreBulkPurchaseOverlay.jsx"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import { getStoreItemsByCategory, getStoreItemDisplayIcon, STORE_ITEMS } from "../../constants/storeItems.js"
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
import { useStoreCategoryFilter } from "../../hooks/useStoreCategoryFilter.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 상점 메인 패널입니다. 상품 그리드, 선택 상품 상세, 사이드 필터를 조합합니다.
export default function StorePanel({ visible = true }) {
  const { categories, activeCategory, selectCategory } = useStoreCategoryFilter()
  const visibleItems = useMemo(
    () => getStoreItemsByCategory(activeCategory),
    [activeCategory],
  )

  const [selectedItem, setSelectedItem] = useState(STORE_ITEMS[0])
  const [deadPreviewIds, setDeadPreviewIds] = useState(() => new Set())
  const [skinZoomItem, setSkinZoomItem] = useState(null)
  const [profileBorderZoomItem, setProfileBorderZoomItem] = useState(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState(() => new Set())
  const [bulkPurchaseOpen, setBulkPurchaseOpen] = useState(false)

  const bulkSelectedItems = useMemo(
    () => visibleItems.filter((item) => bulkSelectedIds.has(item.id)),
    [visibleItems, bulkSelectedIds],
  )

  const toggleDeadPreview = (itemId) => {
    setDeadPreviewIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const isDeadPreview = (itemId) => deadPreviewIds.has(itemId)

  const openSkinZoom = (item) => {
    setSelectedItem(item)
    setSkinZoomItem(item)
  }

  const closeSkinZoom = () => {
    setSkinZoomItem(null)
  }

  const openProfileBorderZoom = (item) => {
    setProfileBorderZoomItem(item)
  }

  const closeProfileBorderZoom = () => {
    setProfileBorderZoomItem(null)
  }

  const handleBulkModeChange = (nextBulkMode) => {
    setBulkMode(nextBulkMode)
    if (nextBulkMode) {
      setBulkSelectedIds(new Set(selectedItem ? [selectedItem.id] : []))
    } else {
      setBulkSelectedIds(new Set())
      setBulkPurchaseOpen(false)
    }
  }

  const handleBulkSelectionChange = (itemId) => {
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const handlePurchaseClick = () => {
    if (bulkMode && bulkSelectedIds.size > 0) {
      setBulkPurchaseOpen(true)
    }
  }

  const closeBulkPurchase = () => {
    setBulkPurchaseOpen(false)
  }

  const handleBulkPurchaseConfirm = () => {
    // TODO: 실제 구매 API 연동
    setBulkPurchaseOpen(false)
  }

  useEffect(() => {
    setSelectedItem((prev) => {
      if (prev && visibleItems.some((item) => item.id === prev.id)) return prev
      return visibleItems[0] ?? null
    })
    setSkinZoomItem(null)
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkPurchaseOpen(false)
  }, [visibleItems])

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
            <div className={STORE_PANEL_MAIN_ROW_CLASS}>
              <div className={STORE_PANEL_GRID_COLUMN_CLASS}>
                <div
                  className={`${STORE_PANEL_SCROLL_AREA_CLASS} ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
                >
                  <StoreItemGrid
                    items={visibleItems}
                    selectedItemId={selectedItem?.id ?? null}
                    onSelectItem={setSelectedItem}
                    deadPreviewIds={deadPreviewIds}
                    onToggleDeadPreview={toggleDeadPreview}
                    onOpenSkinZoom={openSkinZoom}
                    onOpenProfileBorderZoom={openProfileBorderZoom}
                    showBulkPurchase={activeCategory !== "인게임 재화"}
                    showSkinNotice={activeCategory === "스킨"}
                    bulkMode={bulkMode}
                    bulkSelectedIds={bulkSelectedIds}
                    onBulkModeChange={handleBulkModeChange}
                    onBulkSelectionChange={handleBulkSelectionChange}
                  />
                </div>

                {selectedItem ? (
                  <StoreSelectedItemDetail
                    item={selectedItem}
                    displayIcon={getStoreItemDisplayIcon(
                      selectedItem,
                      isDeadPreview(selectedItem.id),
                    )}
                    onPurchaseClick={handlePurchaseClick}
                    purchaseDisabled={bulkMode && bulkSelectedIds.size === 0}
                  />
                ) : null}
              </div>

              <aside className={STORE_PANEL_SIDEBAR_CLASS}>
                <StoreSidebar
                  categories={categories}
                  activeCategory={activeCategory}
                  onSelectCategory={selectCategory}
                />
              </aside>
            </div>
          </div>
        </div>
      </motion.div>

      <StoreSkinZoomOverlay open={Boolean(skinZoomItem)} item={skinZoomItem} onClose={closeSkinZoom} />

      <ProfileBorderZoomOverlay
        open={Boolean(profileBorderZoomItem)}
        item={profileBorderZoomItem}
        onClose={closeProfileBorderZoom}
      />

      <StoreBulkPurchaseOverlay
        open={bulkPurchaseOpen}
        items={bulkSelectedItems}
        deadPreviewIds={deadPreviewIds}
        onClose={closeBulkPurchase}
        onConfirm={handleBulkPurchaseConfirm}
      />
    </>
  )
}
