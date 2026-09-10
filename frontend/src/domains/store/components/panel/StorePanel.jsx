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
import { storePurchase, useStorePurchase } from "../../store/storePurchase.store.js"
import StorePurchaseFeedback from "../StorePurchaseFeedback.jsx"
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

// F-09: 실제 서버 구매와 연결하지 않는 카테고리 — "인게임 재화"는 현금 충전 패키지고,
// "이모티콘"은 표시 전용 준비 중 탭이다(작업 지시서 계획 메모, 둘 다 이 슬라이스 범위 밖).
const NON_PURCHASABLE_CATEGORIES = new Set(["인게임 재화", "이모티콘"])
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
  const purchaseLocked = ["pending", "unknown", "blocked"].includes(purchaseState.status)
  const economyStatus = useEconomyStore((state) => state.status)
  const authUserId = useAuthStore((state) => state.user?.uuid ?? null)
  // F-09 R-IMPL(AC-06 재검토): useEconomyStore.entitlements는 fetchSummary가 이미
  // 채워왔지만 지금까지 어떤 화면도 이 값을 읽지 않았다 — 재로그인 후 서버가 실제로
  // 돌려준 소유권이 있어도 화면 어디에도 드러나지 않았다는 뜻이다. 여기서 읽어
  // StoreItemGrid(일괄선택 차단)·StoreSelectedItemDetail(구매 버튼 비활성화·"보유중"
  // 표시)에 전달해, 소유권 복원이 실제로 눈에 보이는 화면 상태로 이어지게 한다.
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

  // 일괄구매 확인 대화상자는 카테고리와 무관하게 원래 선택된 품목을 그대로 보여줘야
  // 한다(리마운트 복원 포함) — 현재 카테고리로 걸러진 visibleItems 대신 전체 카탈로그
  // (STORE_ITEMS)에서 조회한다.
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
      // 이미 보유한 상품을 선택한 채로 일괄구매 모드에 들어가면 그 상품이 자동으로
      // 선택돼 버린다 — 보유중인 상품은 일괄구매 대상이 될 수 없다(AC-06 재검토).
      const canSeedSelection = selectedItem && !ownedItemIds.has(selectedItem.id)
      setBulkSelectedIds(new Set(canSeedSelection ? [selectedItem.id] : []))
    } else {
      setBulkSelectedIds(new Set())
      setBulkPurchaseOpen(false)
    }
  }

  const handleBulkSelectionChange = (itemId) => {
    if (purchaseLocked || ownedItemIds.has(itemId)) return
    setBulkSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const handlePurchaseClick = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    if (bulkMode) {
      if (bulkSelectedIds.size) { storePurchase.prepare(); setBulkPurchaseOpen(true) }
    } else if (selectedItem && isRealPurchaseCategory(selectedItem.category) && !ownedItemIds.has(selectedItem.id)) {
      storePurchase.purchase([selectedItem.id])
    }
  }
  const closeBulkPurchase = () => { setBulkPurchaseOpen(false); setBulkMode(false); setBulkSelectedIds(new Set()) }
  const handleBulkPurchaseConfirm = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    storePurchase.purchase(bulkSelectedItems.map(item => item.id))
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
            <StorePurchaseFeedback state={purchaseState} onCheck={storePurchase.check} onRetry={storePurchase.retry} />
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
                    showBulkPurchase={isRealPurchaseCategory(activeCategory)}
                    showSkinNotice={activeCategory === "스킨"}
                    bulkMode={bulkMode}
                    bulkSelectedIds={bulkSelectedIds}
                    ownedItemIds={ownedItemIds}
                    selectionDisabled={purchaseLocked}
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
                    owned={!bulkMode && ownedItemIds.has(selectedItem.id)}
                    purchaseDisabled={
                      purchaseLocked || economyStatus !== "ready"
                      || (bulkMode && bulkSelectedIds.size === 0)
                      || !isRealPurchaseCategory(selectedItem.category)
                      || (!bulkMode && ownedItemIds.has(selectedItem.id))
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
