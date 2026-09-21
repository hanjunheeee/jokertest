import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
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
import { currencyPurchase, toCurrencyStoreItem, useCurrencyPurchase } from "../../store/currencyPurchase.store.js"
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

// F-32c: "인게임 재화"는 서버 상품표(다이아 충전·골드 구매)로 채운다 — 정적 준비중 항목은 쓰지 않는다.
const CURRENCY_CATEGORY = "인게임 재화"
const BUSY_TOPUP_STATUSES = ["creatingOrder", "payment", "confirming", "pendingGrant", "unknown"]

const TOPUP_MESSAGES = {
  creatingOrder: "주문을 만들고 있습니다…",
  payment: "결제창으로 이동하고 있습니다…",
  confirming: "결제 결과를 서버에서 확인하고 있습니다…",
  pendingGrant: "결제는 승인되었고 다이아 지급을 기다리고 있습니다.",
  unknown: "결제 결과 확인이 필요합니다. 다이아는 확인 전까지 지급된 것으로 보지 않습니다.",
  done: "충전이 완료되었습니다.",
  canceled: "결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다.",
}
const TOPUP_FAILURE_MESSAGES = {
  AMOUNT_MISMATCH: "결제 금액이 주문과 달라 충전하지 않았습니다.",
  NOT_OWNER: "다른 계정의 주문이라 충전하지 않았습니다.",
  ORDER_NOT_FOUND: "주문을 찾을 수 없어 충전하지 않았습니다.",
  PAYMENT_FAILED: "결제가 완료되지 않아 충전하지 않았습니다.",
  CONFIG_MISSING: "결제 설정이 아직 준비되지 않아 충전하지 않았습니다.",
  PAYMENT_KEY_MISMATCH: "결제 정보가 주문과 맞지 않아 충전하지 않았습니다.",
  PAYMENT_KEY_CONFLICT: "결제 정보가 주문과 맞지 않아 충전하지 않았습니다.",
  ORDER_FAILED: "결제가 실패해 다이아가 지급되지 않았습니다.",
  ORDER_CANCELED: "결제가 취소되어 다이아가 지급되지 않았습니다.",
  ORDER_EXPIRED: "결제 시간이 만료되어 다이아가 지급되지 않았습니다.",
  ORDER_CREATE_FAILED: "주문을 만들지 못했습니다. 다시 시도해 주세요.",
  SDK_LOAD_FAILED: "결제창을 불러오지 못했습니다. 다시 시도해 주세요.",
  PAYMENT_WINDOW_FAILED: "결제창을 열지 못했습니다. 다시 시도해 주세요.",
  INVALID_RETURN: "결제 복귀 정보가 올바르지 않아 확인하지 않았습니다.",
  PRODUCT_VERSION_MISMATCH: "상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 시도해 주세요.",
  PRODUCT_NOT_FOUND: "상품을 찾을 수 없습니다. 목록을 확인해 주세요.",
  PRODUCT_STOPPED: "판매가 중지된 상품입니다. 목록을 확인해 주세요.",
}
const feedbackClass = "rounded border border-[#9c793d] bg-[#241a10] p-2 text-sm text-[#f3dfb4]"

// 다이아 충전 진행 상태·실패 사유·결과 확인 버튼. 일반 구매 피드백(StorePurchaseFeedback)과는 별도 영역이다.
function CurrencyTopupFeedback({ currency, onCheck }) {
  const { status, reason, configPending, autoChecks, lookupFailed } = currency
  if (status === "idle" && !configPending) return null
  const message = configPending
    ? "결제 설정이 아직 준비되지 않았습니다(설정 대기). 상품 목록을 새로고침한 뒤 다시 시도해 주세요."
    : status === "failed" ? (TOPUP_FAILURE_MESSAGES[reason] ?? "충전에 실패했습니다. 다이아는 지급되지 않았습니다.") : TOPUP_MESSAGES[status]
  const resolvable = status === "unknown" || status === "pendingGrant"
  return (
    <div role="status" data-testid="topup-feedback" className={feedbackClass}>
      <p>{message}</p>
      {resolvable && lookupFailed ? <p>주문 조회에 실패했습니다.</p> : null}
      {resolvable && autoChecks >= 5 ? <p>자동 확인을 마쳤습니다. 결과 확인을 눌러 다시 확인해 주세요.</p> : null}
      {resolvable ? <button type="button" className="underline" onClick={onCheck}>결과 확인</button> : null}
    </div>
  )
}

// 골드 구매 상태(처리 중·완료·다이아 부족·실패·확인 필요·가격 변경). check·retry·가격 재확인은 명시적 클릭이다.
function GoldPurchaseFeedback({ state, product, priceRechecked, onCheck, onRetry, onAcceptPrice, onGoTopup }) {
  const { status, code, error } = state
  if (status === "idle" && !error) return null
  const messages = {
    pending: "골드 구매를 처리하고 있습니다…",
    confirmed: "골드 구매가 완료되었습니다.",
    unknown: "골드 구매 결과 확인이 필요합니다.",
    priceChanged: "상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 구매해 주세요.",
    rejected: code === "INSUFFICIENT_DIAMOND" ? "다이아가 부족합니다. 잔액은 변하지 않았습니다." : "골드 구매에 실패했습니다. 재화는 차감되지 않았습니다.",
  }
  return (
    <div role="status" data-testid="gold-feedback" className={feedbackClass}>
      <p>{messages[status]}</p>
      {status === "priceChanged" ? (
        product
          ? <p>새 조건: {product.payAmount} 다이아 → 골드 {product.grantAmount}{product.bonusAmount > 0 ? ` + 보너스 ${product.bonusAmount}` : ""}</p>
          : <p>이 상품은 더 이상 판매 중이 아니거나 목록을 확인하지 못했습니다.</p>
      ) : null}
      {error && status !== "rejected" ? <p>{error}</p> : null}
      {status === "rejected" && code !== "INSUFFICIENT_DIAMOND" && error ? <p>{error}</p> : null}
      {status === "unknown" ? <button type="button" className="mr-4 underline" onClick={onCheck}>결과 확인</button> : null}
      {status === "unknown" ? <button type="button" className="underline" onClick={onRetry}>다시 시도</button> : null}
      {status === "priceChanged" ? (
        <button type="button" className="underline" disabled={!priceRechecked || !product} onClick={onAcceptPrice}>새 조건 확인</button>
      ) : null}
      {status === "rejected" && code === "INSUFFICIENT_DIAMOND" ? (
        <button type="button" className="underline" onClick={onGoTopup}>다이아 충전하러 가기</button>
      ) : null}
    </div>
  )
}

// 상품 목록 새로고침·조회 실패 재시도·빈 목록 안내. 요청 중에는 중복 호출하지 않는다.
function CurrencyListControls({ currency, onReload }) {
  const loading = currency.productsStatus === "loading"
  return (
    <div className={feedbackClass} data-testid="currency-list-controls">
      <button type="button" className="underline" disabled={loading} onClick={onReload}>상품 목록 새로고침</button>
      {currency.productsStatus === "error" ? (
        <span role="alert" className="ml-3">
          상품 목록을 불러오지 못했습니다.{" "}
          <button type="button" className="underline" disabled={loading} onClick={onReload}>다시 시도</button>
        </span>
      ) : null}
      {currency.productsStatus === "ready" && currency.products.length === 0 ? (
        <span role="status" className="ml-3">판매 중인 재화 상품이 없습니다.</span>
      ) : null}
    </div>
  )
}

// 상점 메인 패널입니다. 상품 그리드, 선택 상품 상세, 사이드 필터를 조합합니다.
export default function StorePanel({ visible = true }) {
  const { categories, activeCategory, selectCategory } = useStoreCategoryFilter()
  const currency = useCurrencyPurchase()
  const currencyItems = useMemo(() => currency.products.map(toCurrencyStoreItem), [currency.products])
  const visibleItems = useMemo(() => {
    const staticItems = getStoreItemsByCategory(activeCategory).filter((item) => item.category !== CURRENCY_CATEGORY)
    if (activeCategory === CURRENCY_CATEGORY) return currencyItems
    return activeCategory === null ? [...staticItems, ...currencyItems] : staticItems
  }, [activeCategory, currencyItems])

  const [selectedItem, setSelectedItem] = useState(STORE_ITEMS[0])
  const [priceRechecked, setPriceRechecked] = useState(false)
  const [deadPreviewIds, setDeadPreviewIds] = useState(() => new Set())
  const [skinZoomItem, setSkinZoomItem] = useState(null)
  const [profileBorderZoomItem, setProfileBorderZoomItem] = useState(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelectedIds, setBulkSelectedIds] = useState(() => new Set())
  const [bulkPurchaseOpen, setBulkPurchaseOpen] = useState(false)
  const purchaseState = useStorePurchase()
  const selectionLocked = ["pending", "unknown", "blocked"].includes(purchaseState.status)
  const goldPriceChanged = purchaseState.kind === "GOLD" && purchaseState.status === "priceChanged"
  // 가격 변경은 상품 선택(새 조건 확인)은 허용하되 재확인 전에는 어떤 구매도 막는다.
  const purchaseLocked = selectionLocked || goldPriceChanged
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
  // F-32c: 결제창 복귀(/store?topup=…)는 같은 경로의 쿼리로 들어온다. 복귀 처리는 이 최신 값을 읽는다.
  const search = useLocation().search
  const searchRef = useRef(search)
  searchRef.current = search
  // 그 시점에 economy가 아직 ready가 아니면(새 문서 등) 첫 확인이 끝난 뒤 진입 조회가 필요하다 —
  // 이 정보를 넘겨 성공 복귀의 진입 조회 책임을 currencyPurchase.handleReturn에 인계한다.
  const processReturn = () => currencyPurchase.handleReturn(searchRef.current, {
    entryNeeded: useEconomyStore.getState().status !== "ready",
  })
  useEffect(() => {
    // 성공 복귀는 서버 확인 전에 잔액을 조회하지 않는다 — 진입 조회는 handleReturn이 확인 종료 뒤 한 번 맡는다.
    if (new URLSearchParams(searchRef.current).get("topup") !== "success") useEconomyStore.getState().fetchSummary()
    storePurchase.activate(authUserId)
    storePurchase.check()
    currencyPurchase.loadProducts()
    processReturn()
    setBulkMode(false)
    setBulkSelectedIds(new Set())
    setBulkPurchaseOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId])
  useEffect(() => { processReturn() }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  // 복원된 가격 변경 상태는 목록을 다시 받아 새 조건을 확인받기 전까지 구매를 막는다.
  const goldRecordId = goldPriceChanged ? purchaseState.referenceEventId : null
  useEffect(() => {
    setPriceRechecked(false)
    if (!goldRecordId) return undefined
    let alive = true
    currencyPurchase.loadProducts().then((ok) => { if (alive && ok) setPriceRechecked(true) })
    return () => { alive = false }
  }, [goldRecordId])

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
      const canSeedSelection = selectedItem && !selectedItem.kind && !ownedItemIds.has(selectedItem.id)
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

  // 상품 목록이 바뀌면 같은 ID라도 새 version 객체를 선택에 반영한다 — 이전 조건으로 구매하지 않는다.
  const currentItem = selectedItem ? (visibleItems.find((item) => item.id === selectedItem.id) ?? selectedItem) : null
  const currencyKind = currentItem?.kind ?? null
  // 재화 구매는 상품 목록이 정상이고(요청 중·실패·조건 변경·설정 대기가 아님) 다른 충전이 진행 중이 아닐 때만 가능하다.
  const currencyBlocked = currency.productsStatus !== "ready" || currency.productsStale || currency.configPending
    || (currencyKind === "DIAMOND_TOPUP" && BUSY_TOPUP_STATUSES.includes(currency.status))
  let purchaseLabel = null
  if (currencyKind === "DIAMOND_TOPUP") {
    if (currency.configPending) purchaseLabel = "설정 대기"
    else if (currency.productsStatus === "loading") purchaseLabel = "목록 확인 중"
    else if (currency.status === "creatingOrder") purchaseLabel = "주문 생성 중"
    else if (currency.status === "payment") purchaseLabel = "결제창 이동 중"
    else if (currency.status === "confirming") purchaseLabel = "확인 중"
    else if (currency.status === "pendingGrant") purchaseLabel = "지급 대기"
    else if (currency.status === "unknown") purchaseLabel = "결과 확인 필요"
    else purchaseLabel = "충전"
  } else if (currencyKind === "GOLD_PURCHASE") {
    if (purchaseState.status === "pending") purchaseLabel = "처리 중"
    else if (goldPriceChanged) purchaseLabel = "가격 재확인 필요"
    else if (currency.productsStatus === "loading") purchaseLabel = "목록 확인 중"
    else purchaseLabel = "골드 구매"
  }

  const handlePurchaseClick = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    if (bulkMode) {
      if (bulkSelectedIds.size) { storePurchase.prepare(); setBulkPurchaseOpen(true) }
    } else if (currencyKind) {
      if (currencyBlocked) return
      const product = { productId: currentItem.productId, version: currentItem.version }
      if (currencyKind === "DIAMOND_TOPUP") currencyPurchase.startTopup(product)
      else storePurchase.purchaseGold(product)
    } else if (selectedItem && isRealPurchaseCategory(selectedItem.category) && !ownedItemIds.has(selectedItem.id)) {
      storePurchase.purchase([selectedItem.id])
    }
  }
  // 다이아 부족 안내에서 같은 재화 탭의 다이아 충전 상품으로 이동한다. 이미 재화 탭이면 다시 눌러
  // 전체 목록으로 토글하지 않는다.
  const goToDiamondTopup = () => {
    if (activeCategory !== CURRENCY_CATEGORY) selectCategory(CURRENCY_CATEGORY)
    const target = currencyItems.find((item) => item.kind === "DIAMOND_TOPUP")
    if (target) setSelectedItem(target)
  }
  const goldProduct = goldPriceChanged ? currencyItems.find((item) => item.productId === purchaseState.productId) : null
  const closeBulkPurchase = () => { setBulkPurchaseOpen(false); setBulkMode(false); setBulkSelectedIds(new Set()) }
  const handleBulkPurchaseConfirm = () => {
    if (purchaseLocked || economyStatus !== "ready") return
    storePurchase.purchase(bulkSelectedItems.map(item => item.id))
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
            {purchaseState.kind === "GOLD" ? (
              <GoldPurchaseFeedback
                state={purchaseState}
                product={goldProduct}
                priceRechecked={priceRechecked}
                onCheck={storePurchase.check}
                onRetry={storePurchase.retry}
                onAcceptPrice={storePurchase.acceptPriceChange}
                onGoTopup={goToDiamondTopup}
              />
            ) : (
              <StorePurchaseFeedback state={purchaseState} onCheck={storePurchase.check} onRetry={storePurchase.retry} />
            )}
            <CurrencyTopupFeedback currency={currency} onCheck={currencyPurchase.checkOrder} />
            {activeCategory === CURRENCY_CATEGORY ? (
              <CurrencyListControls currency={currency} onReload={currencyPurchase.loadProducts} />
            ) : null}
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
                      || (!currencyKind && !isRealPurchaseCategory(currentItem.category))
                      || (!bulkMode && currencyKind !== null && currencyBlocked)
                      || (!bulkMode && ownedItemIds.has(currentItem.id))
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
