// 충전 상품 목록 불러오기와 충전 시작 (주문 만들기 → 테스트 결제창 열기)
// currencyPurchase.store.js가 loadProducts·startTopup으로 내보냄
import { currencyApi } from "../../api/currency.api.js"
import { requestTossTestPayment } from "../../api/toss.api.js"
import { BUSY_STATUSES, CLIENT_KEY } from "../../constants/currencyPurchase.js"
import { isPositiveInt, isText } from "../../utils/currencyParse.js"
import { ctx, get, set } from "./state.js"
import { resumeQueue } from "./queue.js"

// 같은 때 여러 번 불러도 요청은 하나만 보냄
export const loadProducts = () => {
  if (!ctx.account) return Promise.resolve(false)
  if (ctx.productsRun) return ctx.productsRun
  const started = ctx.generation
  set({ productsStatus: "loading" })
  const run = currencyApi.listProducts().then(
    (products) => {
      if (started !== ctx.generation) return false
      set((state) => ({
        products, productsStatus: "ready", productsLoadCount: state.productsLoadCount + 1, productsStale: false, configPending: false,
        reason: state.reason === "CONFIG_MISSING" ? null : state.reason,
      }))
      return true
    },
    () => {
      if (started !== ctx.generation) return false
      set({ productsStatus: "error" })
      return false
    },
  ).finally(() => { if (ctx.productsRun === run) ctx.productsRun = null })
  ctx.productsRun = run
  return run
}

// 서버가 정한 코드·상태로 온 실패인지
const isKnownError = (error, code, status) => error?.code === code && error.ok === false && error.status === status

// 상품 목록이 준비됐고 다른 주문이 안 돌 때만 시작함
export const startTopup = async (product) => {
  const state = get()
  if (!ctx.account || ctx.creating || state.configPending || state.productsStale || state.productsStatus !== "ready"
    || BUSY_STATUSES.includes(state.status) || !isText(product?.productId, 64) || !isPositiveInt(product?.version)) return
  ctx.creating = true
  const started = ctx.generation
  set({ status: "creatingOrder", reason: null, order: null, autoChecks: 0, lookupFailed: false })
  try {
    let order
    try {
      order = await currencyApi.createOrder({ productId: product.productId, version: product.version })
    } catch (error) {
      if (started !== ctx.generation) return
      // 설정 없음은 대기, 상품 바뀜·없음·중지는 목록을 다시 받음
      if (isKnownError(error, "CONFIG_MISSING", 503)) {
        set({ status: "idle", configPending: true, reason: "CONFIG_MISSING" })
      } else if (isKnownError(error, "PRODUCT_VERSION_MISMATCH", 409) || isKnownError(error, "PRODUCT_NOT_FOUND", 404)
        || isKnownError(error, "PRODUCT_STOPPED", 409)) {
        set({ status: "failed", reason: error.code, productsStale: true })
        loadProducts()
      } else {
        set({ status: "failed", reason: "ORDER_CREATE_FAILED" })
      }
      return
    }
    if (started !== ctx.generation) return
    // 테스트 키가 아니면 결제창을 열지 않음
    if (!CLIENT_KEY.test(order.clientKey ?? "")) {
      set({ status: "idle", configPending: true, reason: "CONFIG_MISSING" })
      return
    }
    set({ status: "payment", order: { orderId: order.orderId, amount: order.amount } })
    try {
      await requestTossTestPayment(order, window.location.origin)
    } catch (error) {
      if (started !== ctx.generation) return
      if (error?.code === "USER_CANCEL") set({ status: "canceled", reason: "USER_CANCEL" })
      else if (error?.code === "SDK_LOAD_FAILED") set({ status: "failed", reason: "SDK_LOAD_FAILED" })
      else set({ status: "failed", reason: "PAYMENT_WINDOW_FAILED" })
    }
  } finally {
    // 끝나면 기다리던 주문을 이어서 보여 줌
    if (started === ctx.generation) {
      ctx.creating = false
      resumeQueue(started)
    }
  }
}
