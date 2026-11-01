// 재화 충전·골드 구매·묶음 구매·거래 내역 HTTP 요청과 충전 응답 검사
// 충전 흐름 스토어·가게 구매 스토어가 씀 (currencyPurchase.store.js가 같은 이름으로 다시 내보냄)
// 응답 검사는 원래 currencyPurchase.store.js 내용 그대로 옮김 (바꾸지 않음)
import { api } from "../../../shared/api/client.js"
import { MAX_OPEN_ORDERS, OPEN_ORDER_STATUSES, ORDER_ID, ORDER_STATUSES } from "../constants/currencyPurchase.js"
import { brokenResponse, isBalance, isPositiveInt, isText, parseGoldBalances, parseProduct } from "../utils/currencyParse.js"

export const currencyApi = {
  async listProducts() {
    const body = await api.get("/economy/currency-products")
    if (body?.ok !== true || !Array.isArray(body.products)) throw brokenResponse("상품 목록")
    return body.products.map(parseProduct).filter(Boolean)
  },
  async createOrder({ productId, version }) {
    const body = await api.post("/economy/topup/orders", { productId, version })
    if (body?.ok !== true || !ORDER_ID.test(body.orderId ?? "") || !isPositiveInt(body.amount) || !isText(body.orderName, 200)) {
      throw brokenResponse("주문 생성")
    }
    return { orderId: body.orderId, amount: body.amount, orderName: body.orderName, clientKey: body.clientKey }
  },
  async confirmOrder(orderId, { paymentKey, amount }) {
    const body = await api.post(`/economy/topup/orders/${encodeURIComponent(orderId)}/confirm`, { paymentKey, amount })
    if (body?.ok === true && body.status === "GRANTED" && isBalance(body.balanceDiamond)) return { status: "GRANTED" }
    if (body?.ok === true && body.status === "PENDING_GRANT") return { status: "PENDING_GRANT" }
    throw brokenResponse("결제 확인")
  },
  async getOrder(orderId) {
    const body = await api.get(`/economy/topup/orders/${encodeURIComponent(orderId)}`)
    if (body?.ok !== true || body.orderId !== orderId || !ORDER_STATUSES.includes(body.status)) throw brokenResponse("주문 조회")
    return { status: body.status }
  },
  async listOpenOrders() {
    const body = await api.get("/economy/topup/orders?state=open")
    if (body?.ok !== true || !Array.isArray(body.orders) || body.orders.length > MAX_OPEN_ORDERS) throw brokenResponse("진행 중 주문")
    const seen = new Set()
    return body.orders.map((raw) => {
      if (!raw || typeof raw.orderId !== "string" || !ORDER_ID.test(raw.orderId) || seen.has(raw.orderId)
        || !OPEN_ORDER_STATUSES.includes(raw.status) || !isPositiveInt(raw.amount) || !isText(raw.orderName, 200)
        || typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt))) throw brokenResponse("진행 중 주문")
      seen.add(raw.orderId)
      return { orderId: raw.orderId, status: raw.status, amount: raw.amount, orderName: raw.orderName, createdAt: raw.createdAt }
    })
  },
  async purchaseGold({ productId, version, referenceEventId }) {
    return parseGoldBalances(await api.post("/economy/gold-purchases", { productId, version, referenceEventId }), "골드 구매")
  },
  async lookupGoldPurchase(referenceEventId) {
    const body = await api.get(`/economy/purchases/${encodeURIComponent(referenceEventId)}`)
    if (body?.kind !== "GOLD") throw brokenResponse("골드 구매 결과")
    return parseGoldBalances(body, "골드 구매 결과")
  },
}

// 가게 묶음 구매·구매 결과 다시 묻기·재화 거래 내역
// 가게 구매 스토어·거래 내역 스토어가 씀
export const purchaseApi = {
  bulk: (payload) => api.post("/economy/purchases/bulk", payload),
  lookup: (id) => api.get(`/economy/purchases/${encodeURIComponent(id)}`),
  transactions: (account) => api.get(`/economy/accounts/${account}/transactions`),
}
