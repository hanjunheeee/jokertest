// 충전 응답·결제창 복귀 주소 검사(위변조 막기)와 충전 상품을 가게 칸으로 바꾸기
// 충전 API·충전 흐름 스토어가 씀
// 검사 코드는 원래 currencyPurchase.store.js 내용 그대로 옮김 (바꾸지 않음)
import { STORE_ASSETS } from "../constants/storeAssets.js"
import { KIND_CURRENCIES, ORDER_ID, PAYMENT_KEY } from "../constants/currencyPurchase.js"

export const isSafeInt = (value) => Number.isSafeInteger(value)
export const isPositiveInt = (value) => isSafeInt(value) && value > 0
export const isBalance = (value) => isSafeInt(value) && value >= 0
export const isText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max
export const brokenResponse = (name) => new Error(`${name} 응답이 올바르지 않습니다.`)

// 상품 종류와 결제·지급 재화 짝, 금액·버전이 맞는 상품만 남김
export const parseProduct = (raw) => {
  if (!raw || typeof raw !== "object") return null
  const pair = KIND_CURRENCIES[raw.kind]
  if (!pair || raw.payCurrency !== pair[0] || raw.grantCurrency !== pair[1]) return null
  if (!isText(raw.productId, 64) || !isText(raw.displayName, 100) || !isPositiveInt(raw.version)) return null
  if (!isPositiveInt(raw.payAmount) || !isPositiveInt(raw.grantAmount) || !isBalance(raw.bonusAmount)) return null
  const { productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount, version } = raw
  return { productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount, version }
}

// 골드 구매 응답의 잔액 검사
export const parseGoldBalances = (body, name) => {
  if (body?.ok !== true || !isBalance(body.balanceGold) || !isBalance(body.balanceDiamond)) throw brokenResponse(name)
  return { balanceGold: body.balanceGold, balanceDiamond: body.balanceDiamond }
}

// 결제창에서 돌아온 주소의 topup·orderId·paymentKey·amount 검사
export const parseReturn = (search) => {
  const params = new URLSearchParams(search)
  const mode = params.get("topup")
  if (mode !== "success" && mode !== "fail") return null
  if (mode === "fail") {
    const failedOrderId = params.get("orderId") ?? ""
    return { mode, orderId: ORDER_ID.test(failedOrderId) ? failedOrderId : null }
  }
  const paymentKey = params.get("paymentKey") ?? ""
  const orderId = params.get("orderId") ?? ""
  const rawAmount = params.get("amount") ?? ""
  const amount = /^[1-9][0-9]*$/.test(rawAmount) ? Number(rawAmount) : NaN
  return { mode, valid: PAYMENT_KEY.test(paymentKey) && ORDER_ID.test(orderId) && isSafeInt(amount), paymentKey, orderId, amount }
}

// 충전 상품을 가게 목록 칸 모양으로 바꿈
export const toCurrencyStoreItem = (product) => ({
  ...product,
  id: `currency:${product.productId}`,
  category: "인게임 재화",
  name: product.displayName,
  icon: product.kind === "DIAMOND_TOPUP" ? STORE_ASSETS.premiumCurrencyIcon : STORE_ASSETS.currencyIcon,
  priceAmount: String(product.payAmount),
  grade: product.kind === "DIAMOND_TOPUP" ? "다이아" : "골드",
  description: "",
  tag: null,
})
