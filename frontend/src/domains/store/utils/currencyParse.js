// 충전 응답·결제창 복귀 주소 검사(위변조 막기)와 충전 상품을 가게 칸으로 바꾸기
// 충전 API(currency.api.js)·currency/ 아래 결제 복귀·충전 시작이 씀
import { STORE_ASSETS } from "../../../shared/constants/storeAssets.js"
import { KIND_CURRENCIES, ORDER_ID, PAYMENT_KEY } from "../constants/currencyPurchase.js"

// 소수·너무 큰 수 막기
export const isSafeInt = (value) => Number.isSafeInteger(value)
// 0보다 큰 정수 (금액·버전)
export const isPositiveInt = (value) => isSafeInt(value) && value > 0
// 0 이상 정수 (잔액·보너스)
export const isBalance = (value) => isSafeInt(value) && value >= 0
// 비지 않고 max 글자 이하
export const isText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max
// 응답 모양이 틀렸을 때 던지는 오류
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
  // topup 값이 없거나 다르면 결제 복귀 아님
  if (mode !== "success" && mode !== "fail") return null
  // 실패 복귀는 주문 id만 챙김 (모양 틀리면 null)
  if (mode === "fail") {
    const failedOrderId = params.get("orderId") ?? ""
    return { mode, orderId: ORDER_ID.test(failedOrderId) ? failedOrderId : null }
  }
  // 성공 복귀는 결제 키·주문 id·금액 모양이 다 맞아야 valid
  const paymentKey = params.get("paymentKey") ?? ""
  const orderId = params.get("orderId") ?? ""
  const rawAmount = params.get("amount") ?? ""
  const amount = /^[1-9][0-9]*$/.test(rawAmount) ? Number(rawAmount) : NaN
  return { mode, valid: PAYMENT_KEY.test(paymentKey) && ORDER_ID.test(orderId) && isSafeInt(amount), paymentKey, orderId, amount }
}

// 충전 상품을 가게 목록 칸 모양으로 바꿈 (지금 부르는 곳 없음)
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
