import { useEffect, useMemo, useRef, useState } from "react"
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

// F-09 CODEX-1 재검토(AC-04): 미확정(pending/unknown) 일괄구매 상태는 원래 요청
// payload(itemId 목록)와 함께 계정별로 보존해야 한다 — StorePanel이 다른 화면으로
// 이동했다가 되돌아오는 등으로 리마운트돼도 같은 참조 사건 ID·같은 품목으로 재확인해야
// 서버가 새로 차감하지 않는다. useEconomyStore.pendingPurchases(F-08 개별 구매)와 같은
// 수준의 보존이다 — 모듈 스코프 Map에 두어 컴포넌트 인스턴스를 벗어나 살아남되, 전체
// 새로고침까지 버티지는 않는다(그건 이 코드베이스 기존 관례에도 없다).
const bulkPurchaseStateByUser = new Map()

const IDLE_BULK_PURCHASE_STATE = { referenceEventId: null, status: "idle", error: null, itemIds: [] }

const readStoredBulkPurchaseState = (userId) => {
  if (!userId) return IDLE_BULK_PURCHASE_STATE
  const stored = bulkPurchaseStateByUser.get(userId)
  if (!stored) return IDLE_BULK_PURCHASE_STATE
  // 리마운트 시점엔 전송 중이던 요청의 실제 결과를 알 수 없다 — "pending"은 전송 불확실
  // 상태("unknown")로 취급해, 재확인이 같은 참조 사건 ID를 재사용하게 한다.
  if (stored.status === "pending") return { ...stored, status: "unknown" }
  return stored
}

const writeStoredBulkPurchaseState = (userId, state) => {
  if (!userId) return
  if (state.status === "idle" || state.status === "confirmed") {
    bulkPurchaseStateByUser.delete(userId)
    return
  }
  bulkPurchaseStateByUser.set(userId, state)
}

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
  const [bulkPurchaseState, setBulkPurchaseStateRaw] = useState(IDLE_BULK_PURCHASE_STATE)
  const authUserId = useAuthStore((state) => state.user?.uuid ?? null)
  // visibleItems(현재 카테고리) 변경 효과가 마운트 시점에도 한 번 실행되는데, 그때
  // 아래 계정 복원 효과가 막 세팅한 bulkMode/bulkSelectedIds를 지워버리면 안 된다 —
  // 사용자가 실제로 카테고리를 바꿀 때만 초기화하도록 첫 실행은 건너뛴다.
  const skipNextVisibleItemsReset = useRef(true)

  // setBulkPurchaseState는 React 상태와 계정별 영속 저장소(bulkPurchaseStateByUser)를
  // 함께 갱신한다 — 이 컴포넌트가 언마운트돼도(다른 화면 이동 등) 미확정 상태가
  // 사라지지 않게 한다(F-09 AC-04).
  const setBulkPurchaseState = (next) => {
    setBulkPurchaseStateRaw(next)
    writeStoredBulkPurchaseState(authUserId, next)
  }

  useEffect(() => {
    useEconomyStore.getState().fetchSummary()
  }, [])

  // 계정이 바뀌거나(로그인/전환) 컴포넌트가 처음 마운트될 때, 그 계정의 미확정 일괄구매가
  // 남아 있으면 참조 사건 ID·원래 품목·확인 대화상자를 그대로 복원한다 — 재조회·재시도가
  // 새 참조 사건 ID를 만들지 않게 한다(F-09 AC-04).
  useEffect(() => {
    const stored = readStoredBulkPurchaseState(authUserId)
    setBulkPurchaseStateRaw(stored)
    skipNextVisibleItemsReset.current = true
    if (stored.status === "unknown" && stored.itemIds.length > 0) {
      setBulkMode(true)
      setBulkSelectedIds(new Set(stored.itemIds))
      setBulkPurchaseOpen(true)
    } else {
      setBulkMode(false)
      setBulkSelectedIds(new Set())
      setBulkPurchaseOpen(false)
    }
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
    // 이미 확정적으로 거부했다면(rejected) 다음 시도는 새 참조 사건 ID를 쓴다. 재사용할
    // 때는 지금 화면에 보이는 선택이 아니라, 그 시도가 실제로 서버에 보냈던 원래 품목
    // 목록(bulkPurchaseState.itemIds)을 그대로 다시 보낸다 — 그래야 서버의 payload 일치
    // 검사(정규화된 itemId 목록 비교)를 항상 통과한다(CODEX-1 AC-04 재검토: "미확정 요청은
    // 원래 payload·계정별로 보존되지 않고").
    const isUnknownRetry = bulkPurchaseState.status === "unknown"
      && Boolean(bulkPurchaseState.referenceEventId)
      && bulkPurchaseState.itemIds.length > 0
    const referenceEventId = isUnknownRetry
      ? bulkPurchaseState.referenceEventId
      : buildBulkPurchaseReferenceEventId(userId)
    const itemIds = isUnknownRetry
      ? bulkPurchaseState.itemIds
      : bulkSelectedItems.map((item) => item.id)

    setBulkPurchaseState({ referenceEventId, status: "pending", error: null, itemIds })

    try {
      await api.post("/economy/purchases/bulk", {
        items: itemIds.map((itemId) => ({ itemId })),
        referenceEventId,
      })
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
        itemIds,
      })
      return
    }

    // 구매 자체는 이미 서버에 커밋됐다 — 이후 지갑 갱신·UI 정리가 실패해도 그 실패를
    // 구매 실패로 되돌리면 안 된다(CODEX-1 AC-04 재검토: "성공 후 fetchSummary 실패까지
    // 구매 실패로 되돌린다"). 확정 상태를 먼저 확정하고, 부수 효과는 별도로 처리한다.
    setBulkPurchaseState({ referenceEventId, status: "confirmed", error: null, itemIds })
    setBulkPurchaseOpen(false)
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    useEconomyStore.getState().fetchSummary().catch(() => {})
  }

  useEffect(() => {
    setSelectedItem((prev) => {
      if (prev && visibleItems.some((item) => item.id === prev.id)) return prev
      return visibleItems[0] ?? null
    })
    setSkinZoomItem(null)
    if (skipNextVisibleItemsReset.current) {
      // 마운트 직후 계정 복원 효과가 이미 세팅한 bulkMode/bulkSelectedIds를 지우지
      // 않는다 — 실제 카테고리 전환에서만 초기화한다.
      skipNextVisibleItemsReset.current = false
    } else {
      setBulkMode(false)
      setBulkSelectedIds(new Set())
      setBulkPurchaseOpen(false)
    }
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
