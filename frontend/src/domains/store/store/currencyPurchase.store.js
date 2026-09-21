// F-32c 다이아 충전(토스 테스트 결제창)과 골드 구매 API 경계.
//
// 충전 흐름: 상품표 조회 → 주문 생성 → 결제창(SDK) → /store?topup=… 복귀 → 서버 확인(confirm) →
// (응답 유실·지급 대기는 주문 조회로 복구) → GRANTED일 때만 잔액 조회. 결제창에서 돌아왔다는 사실만으로
// 잔액을 바꾸거나 충전 완료로 보지 않는다 — 완료는 서버가 GRANTED로 답한 뒤에만 표시한다.
// 계정이 바뀌면 진행 중이던 모든 요청·타이머의 늦은 결과는 버린다(generation).
import { createStore } from "zustand/vanilla"
import { useStore } from "zustand"
import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { STORE_ASSETS } from "../constants/storeAssets.js"

const POLL_MS = 2000
const MAX_AUTO_CHECKS = 5
const SDK_URL = "https://js.tosspayments.com/v2/standard"
// 서버(backend/service/topup.service.js)와 같은 형식 — 최종 금액 대조는 서버가 맡는다.
const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/
const PAYMENT_KEY = /^[A-Za-z0-9_=+/.-]{1,200}$/
const CLIENT_KEY = /^test_ck_[A-Za-z0-9_=+/-]{8,200}$/
const ORDER_STATUSES = ["CREATED", "CONFIRMING", "PENDING_GRANT", "GRANTED", "FAILED", "CANCELED", "EXPIRED"]
const KIND_CURRENCIES = { DIAMOND_TOPUP: ["KRW", "DIAMOND"], GOLD_PURCHASE: ["DIAMOND", "GOLD"] }
// 알려진 확인 거부 — HTTP status·ok:false·code가 모두 맞을 때만 확정 실패로 본다.
const CONFIRM_FAILURES = {
  AMOUNT_MISMATCH: 400, NOT_OWNER: 403, ORDER_NOT_FOUND: 404, PAYMENT_FAILED: 402, CONFIG_MISSING: 503,
  PAYMENT_KEY_MISMATCH: 409, PAYMENT_KEY_CONFLICT: 409,
}
const ORDER_FAILURE_REASONS = { FAILED: "ORDER_FAILED", CANCELED: "ORDER_CANCELED", EXPIRED: "ORDER_EXPIRED" }
const BUSY_STATUSES = ["creatingOrder", "payment", "confirming", "pendingGrant", "unknown"]

const isSafeInt = (value) => Number.isSafeInteger(value)
const isPositiveInt = (value) => isSafeInt(value) && value > 0
const isBalance = (value) => isSafeInt(value) && value >= 0
const isText = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max
const brokenResponse = (name) => new Error(`${name} 응답이 올바르지 않습니다.`)

const parseProduct = (raw) => {
  if (!raw || typeof raw !== "object") return null
  const pair = KIND_CURRENCIES[raw.kind]
  if (!pair || raw.payCurrency !== pair[0] || raw.grantCurrency !== pair[1]) return null
  if (!isText(raw.productId, 64) || !isText(raw.displayName, 100) || !isPositiveInt(raw.version)) return null
  if (!isPositiveInt(raw.payAmount) || !isPositiveInt(raw.grantAmount) || !isBalance(raw.bonusAmount)) return null
  const { productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount, version } = raw
  return { productId, kind, displayName, payCurrency, payAmount, grantCurrency, grantAmount, bonusAmount, version }
}

const parseGoldBalances = (body, name) => {
  if (body?.ok !== true || !isBalance(body.balanceGold) || !isBalance(body.balanceDiamond)) throw brokenResponse(name)
  return { balanceGold: body.balanceGold, balanceDiamond: body.balanceDiamond }
}

// 서버 응답의 ok·필드·상태를 검사한다. 계약 밖 응답은 code 없는 Error로 던져 호출자가 확정 결과로
// 오해하지 않게 한다(실패 code는 공통 API 계층이 status·ok·code와 함께 실어 준다).
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
  async purchaseGold({ productId, version, referenceEventId }) {
    return parseGoldBalances(await api.post("/economy/gold-purchases", { productId, version, referenceEventId }), "골드 구매")
  },
  async lookupGoldPurchase(referenceEventId) {
    const body = await api.get(`/economy/purchases/${encodeURIComponent(referenceEventId)}`)
    if (body?.kind !== "GOLD") throw brokenResponse("골드 구매 결과")
    return parseGoldBalances(body, "골드 구매 결과")
  },
}

// 서버가 준 상품 필드는 그대로 두고 상점 그리드가 쓰는 화면용 필드만 덧붙인다.
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

let sdkLoading = null
const loadTossSdk = () => {
  if (typeof window.TossPayments === "function") return Promise.resolve(window.TossPayments)
  if (!sdkLoading) {
    sdkLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      const fail = () => {
        sdkLoading = null
        script.remove()
        reject(Object.assign(new Error("SDK_LOAD_FAILED"), { code: "SDK_LOAD_FAILED" }))
      }
      script.src = SDK_URL
      script.async = true
      script.onload = () => (typeof window.TossPayments === "function" ? resolve(window.TossPayments) : fail())
      script.onerror = fail
      document.head.appendChild(script)
    })
  }
  return sdkLoading
}

/** 주문 응답으로 토스 테스트 결제창을 연다. 결제 성공·실패는 successUrl·failUrl 리다이렉트로 돌아온다. */
export async function requestTossTestPayment({ clientKey, orderId, amount, orderName }, origin) {
  if (!CLIENT_KEY.test(clientKey ?? "")) throw Object.assign(new Error("CONFIG_MISSING"), { code: "CONFIG_MISSING" })
  const TossPayments = await loadTossSdk()
  const payment = TossPayments(clientKey).payment({ customerKey: crypto.randomUUID() })
  await payment.requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: amount },
    orderId,
    orderName,
    successUrl: `${origin}/store?topup=success`,
    failUrl: `${origin}/store?topup=fail`,
  })
}

const initialState = {
  products: [],
  productsStatus: "idle", // idle | loading | ready | error
  productsLoadCount: 0, // 목록 조회 성공 횟수 — 어느 경로(자동·수동)로든 성공하면 오른다
  productsStale: false, // 상품 조건이 바뀌어 목록을 다시 받기 전에는 구매하지 않는다
  configPending: false, // 서버가 주문 생성을 CONFIG_MISSING으로 거절함(목록 새로고침 성공 뒤 다시 시도)
  status: "idle", // idle | creatingOrder | payment | confirming | pendingGrant | unknown | done | failed | canceled
  reason: null,
  order: null,
  autoChecks: 0,
  lookupFailed: false,
}

const store = createStore(() => ({ ...initialState }))
const set = (patch) => store.setState(patch)
const get = () => store.getState()

let account = useAuthStore.getState().user?.uuid ?? null
let generation = 0
let creating = false
let productsRun = null
let checkRun = null
let pollTimer = null
let pollCount = 0
const returnRuns = new Map()
const inFlightOrders = new Map() // orderId → 진행 중인 복귀 처리(같은 주문 confirm 동시 1회)

const activate = (id) => {
  if (id === account) return
  account = id
  generation += 1
  clearTimeout(pollTimer)
  pollTimer = null
  pollCount = 0
  creating = false
  productsRun = null
  checkRun = null
  returnRuns.clear()
  inFlightOrders.clear()
  store.setState({ ...initialState }, true)
}
useAuthStore.subscribe((state) => activate(state.user?.uuid ?? null))
// 결제창에서 뒤로 가기(bfcache)로 돌아오면 남은 '결제창 이동 중' 잠금을 푼다.
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("pageshow", (event) => { if (event.persisted && get().status === "payment") { creating = false; set({ status: "idle" }) } })
}

const refreshSummary = async (started) => {
  if (started !== generation) return
  try { await useEconomyStore.getState().fetchSummary() } catch { /* 잔액 재시도 UI가 맡는다 */ }
}

const loadProducts = () => {
  if (!account) return Promise.resolve(false)
  if (productsRun) return productsRun
  const started = generation
  set({ productsStatus: "loading" })
  const run = currencyApi.listProducts().then(
    (products) => {
      if (started !== generation) return false
      // 목록을 다시 받는 것은 서버 키가 설정됐다는 판정이 아니다 — 다음 충전 클릭이 주문 생성으로 다시 판정한다.
      set((state) => ({
        products, productsStatus: "ready", productsLoadCount: state.productsLoadCount + 1, productsStale: false, configPending: false,
        reason: state.reason === "CONFIG_MISSING" ? null : state.reason,
      }))
      return true
    },
    () => {
      if (started !== generation) return false
      set({ productsStatus: "error" })
      return false
    },
  ).finally(() => { if (productsRun === run) productsRun = null })
  productsRun = run
  return run
}

const isKnownError = (error, code, status) => error?.code === code && error.ok === false && error.status === status

const startTopup = async (product) => {
  const state = get()
  if (!account || creating || state.configPending || state.productsStale || state.productsStatus !== "ready"
    || BUSY_STATUSES.includes(state.status) || !isText(product?.productId, 64) || !isPositiveInt(product?.version)) return
  creating = true
  const started = generation
  pollCount = 0
  set({ status: "creatingOrder", reason: null, order: null, autoChecks: 0, lookupFailed: false })
  try {
    let order
    try {
      order = await currencyApi.createOrder({ productId: product.productId, version: product.version })
    } catch (error) {
      if (started !== generation) return
      if (isKnownError(error, "CONFIG_MISSING", 503)) {
        set({ status: "idle", configPending: true, reason: "CONFIG_MISSING" })
      } else if (isKnownError(error, "PRODUCT_VERSION_MISMATCH", 409) || isKnownError(error, "PRODUCT_NOT_FOUND", 404)
        || isKnownError(error, "PRODUCT_STOPPED", 409)) {
        // 새 조건은 목록 재조회로 받는다. 자동으로 다시 주문하지 않는다.
        set({ status: "failed", reason: error.code, productsStale: true })
        loadProducts()
      } else {
        set({ status: "failed", reason: "ORDER_CREATE_FAILED" })
      }
      return
    }
    if (started !== generation) return
    if (!CLIENT_KEY.test(order.clientKey ?? "")) {
      set({ status: "idle", configPending: true, reason: "CONFIG_MISSING" })
      return
    }
    set({ status: "payment", order: { orderId: order.orderId, amount: order.amount } })
    try {
      await requestTossTestPayment(order, window.location.origin)
    } catch (error) {
      if (started !== generation) return
      if (error?.code === "USER_CANCEL") set({ status: "canceled", reason: "USER_CANCEL" })
      else if (error?.code === "SDK_LOAD_FAILED") set({ status: "failed", reason: "SDK_LOAD_FAILED" })
      else set({ status: "failed", reason: "PAYMENT_WINDOW_FAILED" })
    }
  } finally {
    if (started === generation) creating = false
  }
}

const parseReturn = (search) => {
  const params = new URLSearchParams(search)
  const mode = params.get("topup")
  if (mode !== "success" && mode !== "fail") return null
  if (mode === "fail") return { mode }
  const paymentKey = params.get("paymentKey") ?? ""
  const orderId = params.get("orderId") ?? ""
  const rawAmount = params.get("amount") ?? ""
  const amount = /^[1-9][0-9]*$/.test(rawAmount) ? Number(rawAmount) : NaN
  return { mode, valid: PAYMENT_KEY.test(paymentKey) && ORDER_ID.test(orderId) && isSafeInt(amount), paymentKey, orderId, amount }
}

const confirmOnce = async ({ orderId, paymentKey, amount }) => {
  try {
    const result = await currencyApi.confirmOrder(orderId, { paymentKey, amount })
    return { kind: result.status === "GRANTED" ? "granted" : "pendingGrant" }
  } catch (error) {
    const status = typeof error?.code === "string" && Object.hasOwn(CONFIRM_FAILURES, error.code) ? CONFIRM_FAILURES[error.code] : null
    if (status !== null && error.ok === false && error.status === status) return { kind: "failed", reason: error.code }
    // PAYMENT_PROCESSING·통신 실패·계약 밖 응답은 결과를 알 수 없다 — 주문 조회로 복구한다.
    return { kind: "unknown" }
  }
}

const inProgress = () => get().status === "unknown" || get().status === "pendingGrant"

const applyOrderStatus = async (status, started) => {
  if (started !== generation || !inProgress()) return
  if (status === "GRANTED") {
    set({ status: "done", reason: null })
    await refreshSummary(started)
  } else if (status === "PENDING_GRANT") {
    set({ status: "pendingGrant" })
  } else if (Object.hasOwn(ORDER_FAILURE_REASONS, status)) {
    set({ status: "failed", reason: ORDER_FAILURE_REASONS[status] })
  }
  // CREATED·CONFIRMING은 아직 확정되지 않았다 — 상태를 그대로 둔다.
}

const checkOrder = () => {
  const { order } = get()
  if (!account || !order || !inProgress()) return Promise.resolve()
  if (checkRun) return checkRun
  const started = generation
  const run = (async () => {
    try {
      const result = await currencyApi.getOrder(order.orderId)
      if (started !== generation) return
      set({ lookupFailed: false })
      await applyOrderStatus(result.status, started)
    } catch {
      if (started === generation) set({ lookupFailed: true })
    }
  })().finally(() => { if (checkRun === run) checkRun = null })
  checkRun = run
  return run
}

const schedulePoll = (started) => {
  clearTimeout(pollTimer)
  pollTimer = null
  if (started !== generation || !inProgress() || pollCount >= MAX_AUTO_CHECKS) return
  pollTimer = setTimeout(async () => {
    pollTimer = null
    if (started !== generation || !inProgress()) return
    pollCount += 1
    set({ autoChecks: pollCount })
    await checkOrder()
    schedulePoll(started)
  }, POLL_MS)
}

const runReturn = async (ret, run, started) => {
  // 첫 확인이 끝나는 지점에서 한 번만: 미초기화 지갑을 서버 값으로 채우는 진입 조회(충전 완료 판정이 아니다).
  const takeEntryFetch = () => {
    if (!run.entryPending || started !== generation) return
    run.entryPending = false
    refreshSummary(started)
  }
  set({ status: "confirming", reason: null, order: { orderId: ret.orderId, amount: ret.amount }, autoChecks: 0, lookupFailed: false })
  const outcome = await confirmOnce(ret)
  if (started !== generation) return
  if (outcome.kind === "granted") {
    run.entryPending = false // 충전 후 조회가 진입 조회를 겸한다
    set({ status: "done", reason: null })
    await refreshSummary(started)
  } else if (outcome.kind === "failed") {
    set({ status: "failed", reason: outcome.reason })
    takeEntryFetch()
  } else {
    set({ status: outcome.kind })
    takeEntryFetch()
    pollCount = 0
    schedulePoll(started)
  }
}

/**
 * StorePanel이 /store 진입·쿼리 변경 때 부른다. entryNeeded는 그 시점에 economy가 아직 ready가 아니어서
 * 성공 복귀의 첫 확인 종료 뒤 진입 조회가 필요한지 여부다. 같은 계정·같은 복귀는 한 번만 처리한다
 * (StrictMode·재마운트는 진행 중 Promise를 공유하고 필요 여부를 다시 판정하지 않는다).
 */
const handleReturn = (search, { entryNeeded = false } = {}) => {
  const ret = parseReturn(search)
  if (!ret || !account) return Promise.resolve()
  const started = generation
  const key = ret.mode === "fail" ? `fail:${search}` : ret.valid ? `${ret.orderId}:${ret.paymentKey}:${ret.amount}` : `invalid:${search}`
  const existing = returnRuns.get(key)
  if (existing) return existing.promise
  // 같은 주문의 확인이 진행 중이면 paymentKey·amount가 달라진 복귀도 새 confirm을 만들지 않고 먼저 온 입력의 결과를 공유한다.
  const sharing = ret.mode === "success" && ret.valid ? inFlightOrders.get(ret.orderId) : null
  if (sharing) { returnRuns.set(key, sharing); return sharing.promise }
  const run = { entryPending: Boolean(entryNeeded && ret.mode === "success"), promise: null }
  returnRuns.set(key, run)
  if (ret.mode === "fail") {
    set({ status: "canceled", reason: "PAYMENT_RETURN_FAILED", order: null })
    run.promise = Promise.resolve()
  } else if (!ret.valid) {
    set({ status: "failed", reason: "INVALID_RETURN", order: null })
    if (run.entryPending) { run.entryPending = false; run.promise = refreshSummary(started) } else run.promise = Promise.resolve()
  } else {
    inFlightOrders.set(ret.orderId, run)
    run.promise = runReturn(ret, run, started)
    const release = () => { if (inFlightOrders.get(ret.orderId) === run) inFlightOrders.delete(ret.orderId) }
    run.promise.then(release, release)
  }
  return run.promise
}

export const currencyPurchase = {
  store, activate, loadProducts, startTopup, handleReturn, checkOrder,
}
export const useCurrencyPurchase = () => useStore(store)
