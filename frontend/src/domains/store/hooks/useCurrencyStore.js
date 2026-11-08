// 가게의 재화 상품 연결 (서버 상품 목록·결제창 복귀 확인·진행 중 주문 찾기·충전/골드 구매 버튼)
// useStorePanel이 씀 (데스크톱·모바일 가게가 같이 씀), 흐름은 currencyPurchase·storePurchase 스토어
import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import { useEconomyStore } from "@/domains/economy/store/economy.store.js"
import { currencyPurchase, useCurrencyPurchase } from "../store/currencyPurchase.store.js"
import { storePurchase } from "../store/storePurchase.store.js"
import { currencyHistory } from "../store/currencyHistory.store.js"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { toCurrencyStoreItem } from "../utils/currencyParse.js"
import { CURRENCY_CATEGORY, currencyPurchaseLabel, isCurrencyBlocked } from "../utils/currencyView.js"

// 결제 성공 복귀 주소인지 (/store?topup=success&…)
export const isSuccessReturn = (search) => new URLSearchParams(search).get("topup") === "success"

// 들어올 때·계정 바뀔 때 상품 목록·복귀 확인·진행 중 주문 찾기를 걸고, 재화 상품 버튼 판단을 돌려줌
export function useCurrencyStore({ authUserId, purchaseState }) {
  const currency = useCurrencyPurchase()
  const currencyItems = useMemo(() => currency.products.map(toCurrencyStoreItem), [currency.products])
  // 결제창 복귀는 같은 /store 경로의 쿼리로 옴, 복귀 확인은 늘 지금 주소창 쿼리를 읽음
  const search = useLocation().search
  // 지갑을 아직 안 받았으면(새로 연 문서) 확인이 끝난 뒤 한 번 받게 넘김
  const processReturn = () => currencyPurchase.handleReturn(window.location.search, {
    entryNeeded: useEconomyStore.getState().status !== "ready",
  })

  // 가게 들어올 때마다 입장 표 하나 (StrictMode 두 번 실행은 같은 표 → 찾기 한 번)
  const entryRef = useRef(null)
  useEffect(() => {
    if (entryRef.current?.userId !== authUserId) entryRef.current = { userId: authUserId, id: Symbol("store-entry") }
    currencyPurchase.loadProducts()
    // 거래 내역: 성공 복귀면 확인 끝난 뒤 한 번 (그사이 계정·입장이 바뀌었으면 안 받음), 아니면 바로
    const successReturn = isSuccessReturn(window.location.search)
    if (!successReturn) currencyHistory.load()
    // 복귀 주문을 먼저 올리고 찾기를 부름 (찾기는 복귀 주문을 건너뜀)
    const returning = processReturn()
    if (successReturn) {
      const entryId = entryRef.current.id
      returning.then(() => {
        const sameEntry = entryRef.current?.id === entryId
        const sameUser = (useAuthStore.getState().user?.uuid ?? null) === authUserId
        if (sameEntry && sameUser) currencyHistory.loadIfIdle()
      })
    }
    if (authUserId) currencyPurchase.discoverOpenOrders(entryRef.current.id)
  }, [authUserId])
  // 같은 화면에서 쿼리만 바뀌어도 복귀 확인 (같은 주소는 스토어가 한 번만 확인)
  useEffect(() => { processReturn() }, [search])

  // 골드 가격 바뀜이면 목록을 다시 받고, 새 목록을 받은 뒤에만 새 조건 확인 버튼을 풂
  const goldPriceChanged = purchaseState.kind === "GOLD" && purchaseState.status === "priceChanged"
  const goldRecordId = goldPriceChanged ? purchaseState.referenceEventId : null
  // 가격 바뀜 기록이 바뀐 그 순간의 목록 받은 횟수를 기준으로 둠 (그리는 중에 맞춤)
  const [recheck, setRecheck] = useState({ id: null, base: null })
  if (recheck.id !== goldRecordId) setRecheck({ id: goldRecordId, base: goldRecordId ? currency.productsLoadCount : null })
  useEffect(() => {
    if (goldRecordId) currencyPurchase.loadProducts()
  }, [goldRecordId])
  const priceRechecked = goldRecordId !== null && recheck.id === goldRecordId && recheck.base !== null
    && currency.productsLoadCount > recheck.base
  const goldProduct = goldPriceChanged ? currencyItems.find((item) => item.productId === purchaseState.productId) ?? null : null

  // 재화 상품 버튼 글자·잠금
  const labelOf = (item) => currencyPurchaseLabel({ kind: item?.kind ?? null, currency, purchaseState })
  const blockedOf = (item) => Boolean(item?.kind) && isCurrencyBlocked(currency, item.kind)

  // 재화 상품 사기: 충전은 주문→결제창, 골드는 다이아로 바로 구매 (잠겨 있으면 무시)
  const buy = (item) => {
    if (!item?.kind || blockedOf(item)) return
    const product = { productId: item.productId, version: item.version }
    if (item.kind === "DIAMOND_TOPUP") currencyPurchase.startTopup(product)
    else storePurchase.purchaseGold(product)
  }

  return {
    currency, currencyItems, goldPriceChanged, priceRechecked, goldProduct,
    labelOf, blockedOf, buy,
    reloadProducts: currencyPurchase.loadProducts,
    checkTopup: () => currencyPurchase.checkOrder(),
    acceptGoldPrice: storePurchase.acceptPriceChange,
    findTopupItem: () => currencyItems.find((item) => item.kind === "DIAMOND_TOPUP") ?? null,
    categoryName: CURRENCY_CATEGORY,
  }
}
