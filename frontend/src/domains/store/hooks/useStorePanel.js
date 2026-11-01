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

export function useStorePanel() {
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
  // 구매 결과를 기다리거나 모를 때는 선택·구매를 모두 잠금
  const selectionLocked = ["pending", "unknown", "blocked"].includes(purchaseState.status)
  const purchaseLocked = selectionLocked
  const economyStatus = useEconomyStore((state) => state.status)
  const authUserId = useAuthStore((state) => state.user?.uuid ?? null)
  const entitlements = useEconomyStore((state) => state.entitlements)
  const ownedItemIds = useMemo(
    () => new Set(entitlements.map((entitlement) => entitlement.itemId)),
    [entitlements],
  )

  // 계정이 바뀌면 지갑을 다시 받고 구매 상태를 그 계정으로 맞춘 뒤 일괄구매를 끔
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
    setDeadPreviewIds((prev) => toggleId(prev, itemId))
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

  const handleBulkSelectionChange = (itemId) => {
    if (purchaseLocked || ownedItemIds.has(itemId) || isDefaultGrantStoreItem(STORE_ITEMS.find((item) => item.id === itemId))) return
    setBulkSelectedIds((prev) => toggleId(prev, itemId))
  }

  // 분류를 바꿔 목록에 없으면 원래 고른 상품을 그대로 보임
  const currentItem = selectedItem
    ? (visibleItems.find((item) => item.id === selectedItem.id) ?? selectedItem)
    : null

  const purchaseLabel = purchaseLabelOf(currentItem, ownedItemIds)

  // 일괄구매면 확인 창을 열고, 아니면 고른 상품 하나를 바로 삼
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
