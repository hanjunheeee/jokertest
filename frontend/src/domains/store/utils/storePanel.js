// 가게 패널 구매 버튼 판정 (살 수 있는 분류인지·버튼 잠금과 꺼진 까닭·잔액 미리 검사·기본 지급 문구·재화 안내 자리 나누기)
// 데스크톱·모바일 StorePanel·useStorePanel이 씀
import { isDefaultGrantStoreItem, isStorePricePending } from "../constants/storeItems.js"
import {
  PURCHASE_BLOCK_MESSAGES, TOPUP_FAILED_DEFAULT, TOPUP_FAILURE_MESSAGES, TOPUP_MESSAGES, TOSS_CODE_NOTE,
} from "../constants/currencyMessages.js"

// 인게임 재화는 충전 흐름으로 사서 일반 구매·일괄구매에서 뺌
const NON_PURCHASABLE_CATEGORIES = new Set(["인게임 재화"])

// 일반 구매·일괄구매가 되는 분류인지
export const isRealPurchaseCategory = (category) => !NON_PURCHASABLE_CATEGORIES.has(category)

// 기본 지급 아이템은 아직 안 받았을 때만 '기본 지급' 문구를 보임
export function purchaseLabelOf(currentItem, ownedItemIds) {
  if (isDefaultGrantStoreItem(currentItem) && !ownedItemIds.has(currentItem?.id)) return "기본 지급"
  return null
}

// 골드 값 (재화 상품·가격 미정·값이 숫자가 아니면 null)
// 예) { priceAmount: "300" } → 300 / { priceAmount: "가격 미정" } → null
const goldPriceOf = (item) => {
  if (!item || item.kind || isStorePricePending(item)) return null
  const price = Number(item.priceAmount)
  return Number.isSafeInteger(price) && price >= 0 ? price : null
}

// 일괄구매로 고른 상품들 골드 합
// 예) [{ priceAmount: "300" }, { priceAmount: "200" }] → 500
const goldTotalOf = (items) => items.reduce((sum, item) => sum + (goldPriceOf(item) ?? 0), 0)

// 재화 상품 단추가 꺼진 까닭 (목록 실패·바뀐 상품만, 나머지는 단추 글자나 충전 안내가 까닭을 보임)
const currencyBlockReasonOf = (currency) => {
  if (currency?.productsStatus === "error") return PURCHASE_BLOCK_MESSAGES.currencyListError
  if (currency?.productsStale) return PURCHASE_BLOCK_MESSAGES.currencyListStale
  return null
}

// 구매 단추 잠금과 꺼진 까닭 글 { disabled, reason } (까닭이 단추 글자·결과 안내로 이미 보이면 reason은 null)
// 잔액 검사는 지갑을 받은 뒤(ready)에만 함 (못 받은 0을 잔액으로 보면 단추가 늘 꺼짐)
// 재화 상품(kind 있음)은 충전·골드 구매 흐름이라 분류 대신 currencyBlocked로 보고, 다이아 부족은 서버 거절 뒤 충전하러 가기로 안내
// 예) 골드 0·300골드 스킨 → { disabled: true, reason: "잔액이 부족합니다." }
export function purchaseBlockOf({
  currentItem, bulkMode, bulkSelectedIds, bulkSelectedItems = [], ownedItemIds, purchaseLocked, economyStatus,
  currencyBlocked = false, currency = null, balanceGold = null,
}) {
  const currencyItem = Boolean(currentItem.kind)
  const block = (reason) => ({ disabled: true, reason })
  const short = (price) => typeof balanceGold === "number" && price !== null && price > balanceGold
  // 결과 기다림·결과 모름·기록 막힘·가격 바뀜은 단추 아래 구매 결과 안내가 까닭을 보임
  if (purchaseLocked) return block(null)
  if (economyStatus === "error") return block(PURCHASE_BLOCK_MESSAGES.walletError)
  if (economyStatus !== "ready") return block(PURCHASE_BLOCK_MESSAGES.walletLoading)
  if (!currencyItem && !isRealPurchaseCategory(currentItem.category)) return block(PURCHASE_BLOCK_MESSAGES.notForSale)
  if (bulkMode) {
    if (bulkSelectedIds.size === 0) return block(PURCHASE_BLOCK_MESSAGES.bulkEmpty)
    return short(goldTotalOf(bulkSelectedItems)) ? block(PURCHASE_BLOCK_MESSAGES.insufficientGold) : { disabled: false, reason: null }
  }
  if (currencyItem && currencyBlocked) return block(currencyBlockReasonOf(currency))
  // 보유·기본 지급은 단추 글자("보유중"·"기본 지급")가 까닭
  if (ownedItemIds.has(currentItem.id) || isDefaultGrantStoreItem(currentItem)) return block(null)
  if (short(goldPriceOf(currentItem))) return block(PURCHASE_BLOCK_MESSAGES.insufficientGold)
  return { disabled: false, reason: null }
}

// useStorePanel 값 묶음으로 바로 셈 (데스크톱·모바일 StorePanel이 같은 값을 넘기게)
export const panelPurchaseBlockOf = (panel, balanceGold) => purchaseBlockOf({
  currentItem: panel.currentItem, bulkMode: panel.bulkMode, bulkSelectedIds: panel.bulkSelectedIds,
  bulkSelectedItems: panel.bulkSelectedItems, ownedItemIds: panel.ownedItemIds, purchaseLocked: panel.purchaseLocked,
  economyStatus: panel.economyStatus, currencyBlocked: panel.currencyBlocked, currency: panel.currencyPanel.currency, balanceGold,
})

// 결제 실패 복귀 덧붙임 글 (재화 안내 칸이 못 보이는 것만)
// - 표에 없는 결제사 코드는 코드 줄, 다른 주문이 보이는 중에 온 실패 복귀는 그 실패 글 + 코드 줄
// 예) { status: "failed", reason: "TOSS_OTHER", failCode: "XYZ" } → ["결제사 실패 코드: XYZ"]
export function topupReturnNotesOf(currency) {
  const notes = []
  if (!currency) return notes
  if (currency.status === "failed" && currency.reason === "TOSS_OTHER" && currency.failCode) notes.push(TOSS_CODE_NOTE(currency.failCode))
  const held = currency.returnNotice
  if (held) {
    notes.push(held.status === "canceled" ? TOPUP_MESSAGES.canceled : TOPUP_FAILURE_MESSAGES[held.reason] ?? TOPUP_FAILED_DEFAULT)
    if (held.failCode) notes.push(TOSS_CODE_NOTE(held.failCode))
  }
  return notes
}

// 재화 안내 칸(데스크톱 StoreCurrencyFeedback·모바일 CurrencyFeedback)을 두 자리로 나눠 넘길 panel 두 개
// 판 위(listOnly): 상품 목록 상태·거래 내역만 / 구매 단추 아래(resultOnly): 골드 구매·충전 결과만
// 안내 칸 안 묶음을 안 건드리고 받는 값만 비워서 나눔
export function splitCurrencyFeedbackPanel(panel) {
  const { currencyPanel, purchaseState } = panel
  const quietCurrency = { ...currencyPanel.currency, status: "idle", configPending: false }
  return {
    listOnly: { ...panel, purchaseState: { ...purchaseState, kind: null }, currencyPanel: { ...currencyPanel, currency: quietCurrency } },
    resultOnly: { ...panel, activeCategory: null },
  }
}
