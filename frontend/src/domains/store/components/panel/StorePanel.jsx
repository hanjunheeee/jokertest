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
import { api } from "@/shared/api/client.js"
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

// 일괄구매 참조 사건 ID를 계정별로 세션 동안 재사용한다(F-09 AC-04) — 응답을 못 받은
// 채로(status "unknown") 다시 확인을 눌러도 같은 참조 사건 ID를 재사용해야 서버가 새로
// 차감하지 않고 이미 커밋된 결과를 그대로 돌려준다. 확정적으로 거부된(rejected) 시도
// 다음의 새 시도는 새 참조 사건 ID를 쓴다(economy.store.js purchase()와 같은 규칙).
const buildBulkPurchaseReferenceEventId = (userId) => `bulk-purchase:${userId}:${crypto.randomUUID()}`

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
  const [bulkPurchaseState, setBulkPurchaseState] = useState({
    referenceEventId: null,
    status: "idle", // idle | pending | confirmed | rejected | unknown
    error: null,
  })

  useEffect(() => {
    useEconomyStore.getState().fetchSummary()
  }, [])

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
    if (bulkMode) {
      if (bulkSelectedIds.size > 0) setBulkPurchaseOpen(true)
      return
    }
    // "인게임 재화"(현금 충전) · "이모티콘"(표시 전용)은 이 슬라이스에서 실제 구매를
    // 연결하지 않는다 — visibleItems가 애초에 "이모티콘" 카테고리에선 비어 있어
    // selectedItem이 없지만, "인게임 재화"는 항목이 있으므로 여기서 명시적으로 막는다.
    if (!selectedItem || !isRealPurchaseCategory(selectedItem.category)) return

    useEconomyStore.getState().purchase({ itemId: selectedItem.id }).catch(() => {
      // 실패/응답 유실 상태는 useEconomyStore.pendingPurchases에 이미 기록되어 있다
      // (idempotent 재시도 근거, F-08/F-09 AC-04) — 여기서는 unhandled rejection만 막는다.
    })
  }

  const closeBulkPurchase = () => {
    setBulkPurchaseOpen(false)
  }

  const handleBulkPurchaseConfirm = async () => {
    const userId = useAuthStore.getState().user?.uuid
    if (!userId || bulkSelectedItems.length === 0) return
    // 확인 버튼 연타로 같은 묶음을 두 번 제출하는 것을 막는다 — 이미 응답을 기다리는
    // 중이면 새 요청을 만들지 않는다(F-09 AC-04, 중복 제출 방지).
    if (bulkPurchaseState.status === "pending") return

    // 응답 유실(status "unknown")로 남은 시도만 같은 참조 사건 ID를 재사용한다 — 서버가
    // 이미 확정적으로 거부했다면(rejected) 다음 시도는 새 참조 사건 ID를 쓴다.
    const referenceEventId = bulkPurchaseState.status === "unknown" && bulkPurchaseState.referenceEventId
      ? bulkPurchaseState.referenceEventId
      : buildBulkPurchaseReferenceEventId(userId)

    setBulkPurchaseState({ referenceEventId, status: "pending", error: null })

    try {
      await api.post("/economy/purchases/bulk", {
        items: bulkSelectedItems.map((item) => ({ itemId: item.id })),
        referenceEventId,
      })
      setBulkPurchaseState({ referenceEventId, status: "confirmed", error: null })
      await useEconomyStore.getState().fetchSummary()
      setBulkPurchaseOpen(false)
      setBulkMode(false)
      setBulkSelectedIds(new Set())
    } catch (error) {
      // backend/utils/appError.js의 createError는 서버가 실제로 처리해 거부한 응답에
      // 항상 code를 싣는다 — code가 있으면 확정된 거부(rejected), 없으면 응답을 받지
      // 못한 전송 불확실 상태(unknown)다(economy.store.js purchase()와 같은 구분,
      // F-09 AC-04).
      const confirmedRejection = typeof error.code === "string" && error.code.length > 0
      setBulkPurchaseState({
        referenceEventId,
        status: confirmedRejection ? "rejected" : "unknown",
        error: error.message ?? "일괄 구매에 실패했습니다.",
      })
    }
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
                    showBulkPurchase={isRealPurchaseCategory(activeCategory)}
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
                    purchaseDisabled={
                      (bulkMode && bulkSelectedIds.size === 0)
                      || !isRealPurchaseCategory(selectedItem.category)
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
      />
    </>
  )
}
