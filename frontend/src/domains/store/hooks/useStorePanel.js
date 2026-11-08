// 가게 패널 상태와 동작 (분류·선택 상품·미리보기·확대 창·일괄구매·구매 버튼, 재화 상품은 useCurrencyStore)
// 데스크톱 StorePanel·모바일 StorePage가 씀
// 선택·일괄구매·구매 버튼이 같은 선택 상태와 잠금을 함께 봐서 한 훅에 둠
import { useEffect, useMemo, useState } from "react"
import { getStoreItemsByCategory, isDefaultGrantStoreItem, STORE_ITEMS } from "../constants/storeItems.js"
import { storePurchase, useStorePurchase } from "../store/storePurchase.store.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import { useStoreCategoryFilter } from "./useStoreCategoryFilter.js"
import { isSuccessReturn, useCurrencyStore } from "./useCurrencyStore.js"
import { isRealPurchaseCategory, purchaseLabelOf } from "../utils/storePanel.js"
import { CURRENCY_CATEGORY, mergeCurrencyItems } from "../utils/currencyView.js"

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
  const purchaseState = useStorePurchase()
  const authUserId = useAuthStore((state) => state.user?.uuid ?? null)
  const currencyPanel = useCurrencyStore({ authUserId, purchaseState })
  const { currencyItems } = currencyPanel
  // 고른 분류의 상품 (기본 지급 이모티콘은 뺌, 인게임 재화는 서버 상품으로 바꿈)
  const visibleItems = useMemo(
    () => mergeCurrencyItems(activeCategory, getStoreItemsByCategory(activeCategory), currencyItems),
    [activeCategory, currencyItems],
  )

  const [selectedItem, setSelectedItem] = useState(STORE_ITEMS[0])
  const [deadPreviewIds, setDeadPreviewIds] = useState(() => new Set())
  const [skinZoomItem, setSkinZoomItem] = useState(null)
  const [profileBorderZoomItem, setProfileBorderZoomItem] = useState(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState(() => new Set())
  const [bulkPurchaseOpen, setBulkPurchaseOpen] = useState(false)
  // 결과 기다림·결과 모름·기록 막힘이면 선택·구매 모두 잠금, 골드 가격 바뀜은 고르기만 되고 구매는 잠금
  const selectionLocked = ["pending", "unknown", "blocked"].includes(purchaseState.status)
  const purchaseLocked = selectionLocked || currencyPanel.goldPriceChanged
  const economyStatus = useEconomyStore((state) => state.status)
  const entitlements = useEconomyStore((state) => state.entitlements)
  // 보유 상품 id 모음 (경제 스토어의 보유 목록)
  const ownedItemIds = useMemo(
    () => new Set(entitlements.map((entitlement) => entitlement.itemId)),
    [entitlements],
  )

  // 처음 열 때·계정 바뀔 때 지갑 다시 받고, 구매 상태를 그 계정으로 맞춰 남은 결과 확인, 일괄구매 끔
  // 결제 성공 복귀면 지갑은 서버 확인 뒤에 받음 (확인 전 잔액을 완료로 오해하지 않게)
  useEffect(() => {
    if (!isSuccessReturn(window.location.search)) {
      useEconomyStore.getState().fetchSummary()
    }
    storePurchase.activate(authUserId)
    storePurchase.check()
  }, [authUserId])

  // 계정이 바뀌면 일괄구매 끔 (그리는 자리에서 바로, 옛 계정 선택이 한 번도 안 보이게)
  const [bulkAccountId, setBulkAccountId] = useState(authUserId)
  if (bulkAccountId !== authUserId) {
    setBulkAccountId(authUserId)
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkPurchaseOpen(false)
  }

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
      const canSeedSelection = selectedItem && !selectedItem.kind && !ownedItemIds.has(selectedItem.id)
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

  // 재화 상품이면 충전·골드 구매 글자, 아니면 기본 지급 글자
  const purchaseLabel = currentItem?.kind ? currencyPanel.labelOf(currentItem) : purchaseLabelOf(currentItem, ownedItemIds)
  // 재화 상품 버튼 잠금 (목록 준비 안 됨·설정 대기·충전 진행 중)
  const currencyBlocked = currencyPanel.blockedOf(currentItem)

  // 잠김·지갑 미준비면 무시, 일괄구매면 확인 창, 재화 상품이면 충전·골드 구매, 아니면 고른 상품 하나를 바로 삼
  const handlePurchaseClick = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    if (bulkMode) {
      if (bulkSelectedIds.size) { storePurchase.prepare(); setBulkPurchaseOpen(true) }
    } else if (currentItem?.kind) {
      currencyPanel.buy(currentItem)
    } else if (selectedItem && isRealPurchaseCategory(selectedItem.category) && !ownedItemIds.has(selectedItem.id)
      && !isDefaultGrantStoreItem(selectedItem)) {
      storePurchase.purchase([selectedItem.id])
    }
  }

  // 다이아 부족 안내에서 재화 분류의 충전 상품으로 이동 (이미 재화 분류면 다시 눌러 풀지 않음)
  const goToDiamondTopup = () => {
    if (activeCategory !== CURRENCY_CATEGORY) selectCategory(CURRENCY_CATEGORY)
    const target = currencyPanel.findTopupItem()
    if (target) setSelectedItem(target)
  }

  // 확인 창 닫으면 일괄구매도 끄고 선택 비움
  const closeBulkPurchase = () => { setBulkPurchaseOpen(false); setBulkMode(false); setBulkSelectedIds(new Set()) }
  // 확인 창의 구매하기, 잠김·지갑 미준비면 무시
  const handleBulkPurchaseConfirm = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    storePurchase.purchase(bulkSelectedItems.map((item) => item.id))
  }

  // 분류가 바뀌면 고른 상품을 새 목록에 맞추고 확대 창·일괄구매를 닫음 (처음 그릴 때도 한 번, 그리는 자리에서 바로)
  const [syncedItems, setSyncedItems] = useState(null)
  if (syncedItems !== visibleItems) {
    setSyncedItems(visibleItems)
    setSelectedItem((prev) => visibleItems.find((item) => item.id === prev?.id) ?? visibleItems[0] ?? null)
    setSkinZoomItem(null)
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkPurchaseOpen(false)
  }

  return {
    categories, activeCategory, selectCategory, visibleItems,
    setSelectedItem, currentItem, purchaseLabel,
    deadPreviewIds, toggleDeadPreview, isDeadPreview,
    skinZoomItem, openSkinZoom, closeSkinZoom,
    profileBorderZoomItem, openProfileBorderZoom, closeProfileBorderZoom,
    bulkMode, bulkSelectedIds, bulkSelectedItems, bulkPurchaseOpen,
    handleBulkModeChange, handleBulkSelectionChange, closeBulkPurchase, handleBulkPurchaseConfirm,
    purchaseState, purchaseLocked, selectionLocked, economyStatus, ownedItemIds, handlePurchaseClick,
    currencyPanel, currencyBlocked, goToDiamondTopup,
  }
}
