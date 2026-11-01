// 가게 패널 상태와 동작 (분류·선택 상품·미리보기·확대 창·일괄구매·구매 버튼)
// StorePanel이 씀
// 선택·일괄구매·구매 버튼이 같은 선택 상태와 잠금을 함께 봐서 한 훅에 둠
import { useEffect, useMemo, useState } from "react"
import { getStoreItemsByCategory, isDefaultGrantStoreItem, STORE_ITEMS } from "../constants/storeItems.js"
import { storePurchase, useStorePurchase } from "../store/storePurchase.store.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import { useStoreCategoryFilter } from "./useStoreCategoryFilter.js"
import { isRealPurchaseCategory, purchaseLabelOf } from "../utils/storePanel.js"

// 고른 id 하나를 넣거나 뺀 새 Set
const toggleId = (prev, itemId) => {
  const next = new Set(prev)
  if (next.has(itemId)) next.delete(itemId)
  else next.add(itemId)
  return next
}

// 패널 상태를 한 곳에 모아 StorePanel·StorePanelOverlays에 넘김
export function useStorePanel() {
  const { categories, activeCategory, selectCategory } = useStoreCategoryFilter()
  // 고른 분류의 상품 (기본 지급 이모티콘은 뺌)
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
  // 결과 기다림·결과 모름·기록 막힘이면 선택·구매 모두 잠금
  const selectionLocked = ["pending", "unknown", "blocked"].includes(purchaseState.status)
  const purchaseLocked = selectionLocked
  const economyStatus = useEconomyStore((state) => state.status)
  const authUserId = useAuthStore((state) => state.user?.uuid ?? null)
  const entitlements = useEconomyStore((state) => state.entitlements)
  // 보유 상품 id 모음 (경제 스토어의 보유 목록)
  const ownedItemIds = useMemo(
    () => new Set(entitlements.map((entitlement) => entitlement.itemId)),
    [entitlements],
  )

  // 처음 열 때·계정 바뀔 때 지갑 다시 받고, 구매 상태를 그 계정으로 맞춰 남은 결과 확인, 일괄구매 끔
  useEffect(() => {
    useEconomyStore.getState().fetchSummary()
    storePurchase.activate(authUserId)
    storePurchase.check()
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkPurchaseOpen(false)
  }, [authUserId])

  // 일괄구매로 고른 상품 목록 (확인 창에 넘김)
  const bulkSelectedItems = useMemo(
    () => STORE_ITEMS.filter((item) => bulkSelectedIds.has(item.id)),
    [bulkSelectedIds],
  )

  // 카드 사망 모습 미리보기 켜고 끄기 (상품마다 따로)
  const toggleDeadPreview = (itemId) => {
    setDeadPreviewIds((prev) => toggleId(prev, itemId))
  }

  // 그 상품이 사망 미리보기 중인지
  const isDeadPreview = (itemId) => deadPreviewIds.has(itemId)

  // 스킨 전신 보기 열 때 그 상품도 고름
  const openSkinZoom = (item) => {
    setSelectedItem(item)
    setSkinZoomItem(item)
  }

  // 스킨 전신 보기 닫기
  const closeSkinZoom = () => {
    setSkinZoomItem(null)
  }

  // 프로필 테두리 크게 보기 열기 (고른 상품은 그대로)
  const openProfileBorderZoom = (item) => {
    setProfileBorderZoomItem(item)
  }

  // 프로필 테두리 크게 보기 닫기
  const closeProfileBorderZoom = () => {
    setProfileBorderZoomItem(null)
  }

  // 일괄구매를 켜면 지금 고른 상품(살 수 있을 때)으로 시작, 끄면 선택·확인 창을 비움
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

  // 잠김·보유·기본 지급 상품은 일괄구매에 못 넣음
  const handleBulkSelectionChange = (itemId) => {
    if (purchaseLocked || ownedItemIds.has(itemId) || isDefaultGrantStoreItem(STORE_ITEMS.find((item) => item.id === itemId))) return
    setBulkSelectedIds((prev) => toggleId(prev, itemId))
  }

  // 분류를 바꿔 목록에 없으면 원래 고른 상품을 그대로 보임
  const currentItem = selectedItem
    ? (visibleItems.find((item) => item.id === selectedItem.id) ?? selectedItem)
    : null

  const purchaseLabel = purchaseLabelOf(currentItem, ownedItemIds)

  // 잠김·지갑 미준비면 무시, 일괄구매면 확인 창을 열고, 아니면 고른 상품 하나를 바로 삼
  const handlePurchaseClick = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    if (bulkMode) {
      if (bulkSelectedIds.size) { storePurchase.prepare(); setBulkPurchaseOpen(true) }
    } else if (selectedItem && isRealPurchaseCategory(selectedItem.category) && !ownedItemIds.has(selectedItem.id)
      && !isDefaultGrantStoreItem(selectedItem)) {
      storePurchase.purchase([selectedItem.id])
    }
  }

  // 확인 창 닫으면 일괄구매도 끄고 선택 비움
  const closeBulkPurchase = () => { setBulkPurchaseOpen(false); setBulkMode(false); setBulkSelectedIds(new Set()) }
  // 확인 창의 구매하기, 잠김·지갑 미준비면 무시
  const handleBulkPurchaseConfirm = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    storePurchase.purchase(bulkSelectedItems.map((item) => item.id))
  }

  // 분류가 바뀌면 고른 상품을 새 목록에 맞추고 확대 창·일괄구매를 닫음
  useEffect(() => {
    setSelectedItem((prev) => visibleItems.find((item) => item.id === prev?.id) ?? visibleItems[0] ?? null)
    setSkinZoomItem(null)
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkPurchaseOpen(false)
  }, [visibleItems])

  return {
    categories, activeCategory, selectCategory, visibleItems,
    setSelectedItem, currentItem, purchaseLabel,
    deadPreviewIds, toggleDeadPreview, isDeadPreview,
    skinZoomItem, openSkinZoom, closeSkinZoom,
    profileBorderZoomItem, openProfileBorderZoom, closeProfileBorderZoom,
    bulkMode, bulkSelectedIds, bulkSelectedItems, bulkPurchaseOpen,
    handleBulkModeChange, handleBulkSelectionChange, closeBulkPurchase, handleBulkPurchaseConfirm,
    purchaseState, purchaseLocked, selectionLocked, economyStatus, ownedItemIds, handlePurchaseClick,
  }
}
