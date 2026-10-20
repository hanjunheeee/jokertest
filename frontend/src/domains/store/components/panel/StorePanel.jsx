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
import {
  getStoreItemsByCategory,
  getStoreItemDisplayIcon,
  isDefaultGrantStoreItem,
  STORE_ITEMS,
} from "../../constants/storeItems.js"
import { storePurchase, useStorePurchase } from "../../store/storePurchase.store.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
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
import StorePurchaseFeedback from "../StorePurchaseFeedback.jsx"

// F-09: 일반 구매 경로와 연결하지 않는 카테고리 — "인게임 재화"는 정적 카탈로그(준비중)만 보여준다.
// F-33 E-1: "이모티콘"은 상점 15종을 일반 구매·일괄구매로 판다(기본 지급 8종은 그리드에서 제외).
const NON_PURCHASABLE_CATEGORIES = new Set(["인게임 재화"])
const isRealPurchaseCategory = (category) => !NON_PURCHASABLE_CATEGORIES.has(category)

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
  const purchaseState = useStorePurchase()
  const selectionLocked = ["pending", "unknown", "blocked"].includes(purchaseState.status)
  const purchaseLocked = selectionLocked
  const economyStatus = useEconomyStore((state) => state.status)
  const authUserId = useAuthStore((state) => state.user?.uuid ?? null)
  const entitlements = useEconomyStore((state) => state.entitlements)
  const ownedItemIds = useMemo(
    () => new Set(entitlements.map((entitlement) => entitlement.itemId)),
    [entitlements],
  )

  useEffect(() => {
    useEconomyStore.getState().fetchSummary()
    storePurchase.activate(authUserId)
    storePurchase.check()
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkPurchaseOpen(false)
  }, [authUserId])

  const bulkSelectedItems = useMemo(
    () => STORE_ITEMS.filter((item) => bulkSelectedIds.has(item.id)),
    [bulkSelectedIds],
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
    if (purchaseLocked) return
    setBulkMode(nextBulkMode)
    if (nextBulkMode) {
      const canSeedSelection = selectedItem && !ownedItemIds.has(selectedItem.id)
        && !isDefaultGrantStoreItem(selectedItem)
      setBulkSelectedIds(new Set(canSeedSelection ? [selectedItem.id] : []))
    } else {
      setBulkSelectedIds(new Set())
      setBulkPurchaseOpen(false)
    }
  }

  const handleBulkSelectionChange = (itemId) => {
    if (purchaseLocked || ownedItemIds.has(itemId) || isDefaultGrantStoreItem(STORE_ITEMS.find((item) => item.id === itemId))) return
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const currentItem = selectedItem
    ? (visibleItems.find((item) => item.id === selectedItem.id) ?? selectedItem)
    : null

  let purchaseLabel = null
  if (isDefaultGrantStoreItem(currentItem) && !ownedItemIds.has(currentItem?.id)) {
    purchaseLabel = "기본 지급"
  }

  const handlePurchaseClick = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    if (bulkMode) {
      if (bulkSelectedIds.size) { storePurchase.prepare(); setBulkPurchaseOpen(true) }
    } else if (selectedItem && isRealPurchaseCategory(selectedItem.category) && !ownedItemIds.has(selectedItem.id)
      && !isDefaultGrantStoreItem(selectedItem)) {
      storePurchase.purchase([selectedItem.id])
    }
  }

  const closeBulkPurchase = () => { setBulkPurchaseOpen(false); setBulkMode(false); setBulkSelectedIds(new Set()) }
  const handleBulkPurchaseConfirm = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    storePurchase.purchase(bulkSelectedItems.map((item) => item.id))
  }

  useEffect(() => {
    setSelectedItem((prev) => visibleItems.find((item) => item.id === prev?.id) ?? visibleItems[0] ?? null)
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
            <StorePurchaseFeedback state={purchaseState} onCheck={storePurchase.check} onRetry={storePurchase.retry} />
            <div className={STORE_PANEL_MAIN_ROW_CLASS}>
              <div className={STORE_PANEL_GRID_COLUMN_CLASS}>
                <div
                  className={`${STORE_PANEL_SCROLL_AREA_CLASS} ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`}
                >
                  <StoreItemGrid
                    items={visibleItems}
                    selectedItemId={currentItem?.id ?? null}
                    onSelectItem={setSelectedItem}
                    deadPreviewIds={deadPreviewIds}
                    onToggleDeadPreview={toggleDeadPreview}
                    onOpenSkinZoom={openSkinZoom}
                    onOpenProfileBorderZoom={openProfileBorderZoom}
                    showBulkPurchase={isRealPurchaseCategory(activeCategory)}
                    showSkinNotice={activeCategory === "스킨"}
                    bulkMode={bulkMode}
                    bulkSelectedIds={bulkSelectedIds}
                    ownedItemIds={ownedItemIds}
                    selectionDisabled={selectionLocked}
                    onBulkModeChange={handleBulkModeChange}
                    onBulkSelectionChange={handleBulkSelectionChange}
                  />
                </div>

                {currentItem ? (
                  <StoreSelectedItemDetail
                    item={currentItem}
                    displayIcon={getStoreItemDisplayIcon(
                      currentItem,
                      isDeadPreview(currentItem.id),
                    )}
                    onPurchaseClick={handlePurchaseClick}
                    owned={!bulkMode && ownedItemIds.has(currentItem.id)}
                    purchaseLabel={bulkMode ? null : purchaseLabel}
                    purchaseDisabled={
                      purchaseLocked || economyStatus !== "ready"
                      || (bulkMode && bulkSelectedIds.size === 0)
                      || (!isRealPurchaseCategory(currentItem.category))
                      || (!bulkMode && ownedItemIds.has(currentItem.id))
                      || (!bulkMode && isDefaultGrantStoreItem(currentItem))
                    }
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
        purchaseState={purchaseState}
        onCheck={storePurchase.check}
        onRetry={storePurchase.retry}
      />
    </>
  )
}
