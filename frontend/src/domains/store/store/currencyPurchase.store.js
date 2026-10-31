import { createStore } from "zustand/vanilla"
import { useStore } from "zustand"
import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { STORE_ASSETS } from "../constants/storeAssets.js"
import { currencyHistory } from "./currencyHistory.store.js"

const POLL_MS = 2000
const MAX_AUTO_CHECKS = 5
const SDK_URL = "https://js.tosspayments.com/v2/standard"
const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/
const PAYMENT_KEY = /^[A-Za-z0-9_=+/.-]{1,200}$/
const CLIENT_KEY = /^test_ck_[A-Za-z0-9_=+/-]{8,200}$/
const ORDER_STATUSES = ["CREATED", "CONFIRMING", "PENDING_GRANT", "GRANTED", "FAILED", "CANCELED", "EXPIRED"]
const OPEN_ORDER_STATUSES = ["CONFIRMING", "PENDING_GRANT"]
const MAX_OPEN_ORDERS = 5
const KIND_CURRENCIES = { DIAMOND_TOPUP: ["KRW", "DIAMOND"], GOLD_PURCHASE: ["DIAMOND", "GOLD"] }
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
  productsStatus: "idle",
  productsLoadCount: 0,
  productsStale: false,
  configPending: false,
  status: "idle",
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
let pollTimer = null
const returnRuns = new Map()
const inFlightOrders = new Map()
const records = new Map()
let queue = []
const excluded = new Set()
const discoveryRuns = new Map()
let active = null
let activeToken = 0

const activate = (id) => {
  if (id === account) return
  account = id
  generation += 1
  clearTimeout(pollTimer)
  pollTimer = null
  creating = false
  productsRun = null
  returnRuns.clear()
  inFlightOrders.clear()
  records.clear()
  queue = []
  excluded.clear()
  discoveryRuns.clear()
  active = null
  activeToken += 1
  store.setState({ ...initialState }, true)
}
useAuthStore.subscribe((state) => activate(state.user?.uuid ?? null))
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && get().status === "payment") { creating = false; set({ status: "idle" }); resumeQueue(generation) }
  })
}

const refreshSummary = async (started) => {
  if (started !== generation) return
  const summary = useEconomyStore.getState().fetchSummary()
  const history = currencyHistory.load()
  await Promise.allSettled([summary, history])
}

const recordOf = (orderId, amount, source, serverStatus = null) => {
  let record = records.get(orderId)
  if (!record) {
    record = { orderId, amount, source, serverStatus, pollCount: 0, getRun: null, heldResult: null, heldReason: null, closed: false }
    records.set(orderId, record)
  }
  return record
}
const isActive = (orderId) => active !== null && active.orderId === orderId
const setActive = (orderId) => {
  activeToken += 1
  active = { orderId, token: activeToken }
  return activeToken
}

const loadProducts = () => {
  if (!account) return Promise.resolve(false)
  if (productsRun) return productsRun
  const started = generation
  set({ productsStatus: "loading" })
  const run = currencyApi.listProducts().then(
    (products) => {
      if (started !== generation) return false
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
    if (started === generation) {
      creating = false
      resumeQueue(started)
    }
  }
}

const parseReturn = (search) => {
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

const confirmOnce = async ({ orderId, paymentKey, amount }) => {
  try {
    const result = await currencyApi.confirmOrder(orderId, { paymentKey, amount })
    return { kind: result.status === "GRANTED" ? "granted" : "pendingGrant" }
  } catch (error) {
    const status = typeof error?.code === "string" && Object.hasOwn(CONFIRM_FAILURES, error.code) ? CONFIRM_FAILURES[error.code] : null
    if (status !== null && error.ok === false && error.status === status) return { kind: "failed", reason: error.code }
    return { kind: "unknown" }
  }
}

const inProgress = () => get().status === "unknown" || get().status === "pendingGrant"

const isTerminal = (status) => status === "GRANTED" || Object.hasOwn(ORDER_FAILURE_REASONS, status)

const finishActive = (orderId, started) => {
  const record = records.get(orderId)
  if (record) record.closed = true
  if (!isActive(orderId)) return
  clearTimeout(pollTimer)
  pollTimer = null
  active = null
  resumeQueue(started)
}

const showQueued = (orderId, started) => {
  const record = records.get(orderId)
  setActive(orderId)
  const confirming = inFlightOrders.has(orderId)
  set({
    status: confirming ? "confirming" : record.serverStatus === "PENDING_GRANT" ? "pendingGrant" : "unknown",
    reason: null, order: { orderId, amount: record.amount }, autoChecks: record.pollCount, lookupFailed: false,
  })
  if (confirming) return false
  if (record.heldReason) {
    const reason = record.heldReason
    record.heldReason = null
    set({ status: "failed", reason })
    finishActive(orderId, started)
    return false
  }
  if (record.heldResult) {
    const held = record.heldResult
    record.heldResult = null
    applyOrderStatus(orderId, held, started)
    return false
  }
  return true
}

const advance = (started) => {
  if (started !== generation || active || BUSY_STATUSES.includes(get().status)) return null
  while (queue.length > 0) {
    const orderId = queue.shift()
    const record = records.get(orderId)
    if (!record || record.closed) continue
    return showQueued(orderId, started) ? orderId : null
  }
  return null
}
const resumeQueue = (started) => {
  const next = advance(started)
  if (next) schedulePoll(started, next)
}

const preemptActive = (orderId) => {
  clearTimeout(pollTimer)
  pollTimer = null
  if (active && active.orderId !== orderId && !records.get(active.orderId)?.closed) queue.unshift(active.orderId)
  active = null
}

const applyOrderStatus = async (orderId, status, started) => {
  if (started !== generation) return
  const record = records.get(orderId)
  if (!record) return
  record.serverStatus = status
  if (!isActive(orderId) || !inProgress()) {
    if (isTerminal(status)) record.heldResult = status
    return
  }
  if (status === "GRANTED") {
    set({ status: "done", reason: null })
    const refreshing = refreshSummary(started)
    finishActive(orderId, started)
    await refreshing
  } else if (status === "PENDING_GRANT") {
    set({ status: "pendingGrant" })
  } else if (Object.hasOwn(ORDER_FAILURE_REASONS, status)) {
    set({ status: "failed", reason: ORDER_FAILURE_REASONS[status] })
    finishActive(orderId, started)
  }
}

const checkOrder = (orderId = active?.orderId) => {
  const record = typeof orderId === "string" ? records.get(orderId) : null
  if (!account || !record || record.closed || !isActive(orderId) || !inProgress()) return Promise.resolve()
  if (record.getRun) return record.getRun
  const confirming = inFlightOrders.get(orderId)
  if (confirming) return confirming.promise.then(() => {}, () => {})
  const started = generation
  const run = (async () => {
    try {
      const result = await currencyApi.getOrder(orderId)
      if (started !== generation) return
      if (isActive(orderId)) set({ lookupFailed: false })
      await applyOrderStatus(orderId, result.status, started)
    } catch {
      if (started === generation && isActive(orderId) && inProgress()) set({ lookupFailed: true })
    }
  })().finally(() => { if (record.getRun === run) record.getRun = null })
  record.getRun = run
  return run
}

const schedulePoll = (started, orderId) => {
  clearTimeout(pollTimer)
  pollTimer = null
  const record = records.get(orderId)
  if (started !== generation || !record || !isActive(orderId) || !inProgress() || record.pollCount >= MAX_AUTO_CHECKS) return
  const { token } = active
  pollTimer = setTimeout(async () => {
    pollTimer = null
    if (started !== generation || active?.token !== token || !inProgress()) return
    record.pollCount += 1
    set({ autoChecks: record.pollCount })
    await checkOrder(orderId)
    if (active?.token === token) schedulePoll(started, orderId)
  }, POLL_MS)
}

const runReturn = async (ret, run, started) => {
  const takeEntryFetch = () => {
    if (!run.entryPending || started !== generation) return
    run.entryPending = false
    refreshSummary(started)
  }
  preemptActive(ret.orderId)
  queue = queue.filter((id) => id !== ret.orderId)
  const record = recordOf(ret.orderId, ret.amount, "return")
  record.closed = false
  setActive(ret.orderId)
  set({ status: "confirming", reason: null, order: { orderId: ret.orderId, amount: ret.amount }, autoChecks: record.pollCount, lookupFailed: false })
  if (record.getRun) await record.getRun
  if (started !== generation) return
  let outcome
  if (record.heldResult === "GRANTED") {
    record.heldResult = null
    outcome = { kind: "granted" }
  } else {
    record.heldResult = null
    outcome = await confirmOnce(ret)
  }
  if (started !== generation) return
  const shown = isActive(ret.orderId)
  if (outcome.kind === "granted") {
    run.entryPending = false
    record.serverStatus = "GRANTED"
    if (!shown) { record.heldResult = "GRANTED"; return }
    set({ status: "done", reason: null })
    const refreshing = refreshSummary(started)
    finishActive(ret.orderId, started)
    await refreshing
  } else if (outcome.kind === "failed") {
    takeEntryFetch()
    if (!shown) { record.heldReason = outcome.reason; return }
    set({ status: "failed", reason: outcome.reason })
    finishActive(ret.orderId, started)
  } else {
    record.serverStatus = outcome.kind === "pendingGrant" ? "PENDING_GRANT" : "CONFIRMING"
    takeEntryFetch()
    if (!shown) return
    set({ status: outcome.kind })
    schedulePoll(started, ret.orderId)
  }
}

const handleReturn = (search, { entryNeeded = false } = {}) => {
  const ret = parseReturn(search)
  if (!ret || !account) return Promise.resolve()
  const started = generation
  if (ret.orderId && (ret.mode === "fail" || ret.valid)) excluded.add(ret.orderId)
  const key = ret.mode === "fail" ? `fail:${search}` : ret.valid ? `${ret.orderId}:${ret.paymentKey}:${ret.amount}` : `invalid:${search}`
  const existing = returnRuns.get(key)
  if (existing) return existing.promise
  const sharing = ret.mode === "success" && ret.valid ? inFlightOrders.get(ret.orderId) : null
  if (sharing) { returnRuns.set(key, sharing); return sharing.promise }
  const run = { entryPending: Boolean(entryNeeded && ret.mode === "success"), promise: null }
  returnRuns.set(key, run)
  const showNotice = !active
  if (ret.mode === "fail") {
    if (showNotice) set({ status: "canceled", reason: "PAYMENT_RETURN_FAILED", order: null })
    run.promise = Promise.resolve()
  } else if (!ret.valid) {
    if (showNotice) set({ status: "failed", reason: "INVALID_RETURN", order: null })
    if (run.entryPending) { run.entryPending = false; run.promise = refreshSummary(started) } else run.promise = Promise.resolve()
  } else {
    inFlightOrders.set(ret.orderId, run)
    run.promise = runReturn(ret, run, started)
    const release = () => { if (inFlightOrders.get(ret.orderId) === run) inFlightOrders.delete(ret.orderId) }
    run.promise.then(release, release)
  }
  return run.promise
}

const discoverOpenOrders = (entryId) => {
  if (!account || entryId == null) return Promise.resolve()
  const existing = discoveryRuns.get(entryId)
  if (existing) return existing
  const started = generation
  const run = currencyApi.listOpenOrders().then(
    (orders) => {
      if (started !== generation) return
      for (const order of orders) {
        if (excluded.has(order.orderId) || records.has(order.orderId)) continue
        recordOf(order.orderId, order.amount, "discovery", order.status)
        queue.push(order.orderId)
      }
      const next = advance(started)
      if (next) schedulePoll(started, next)
    },
    () => {},
  )
  discoveryRuns.set(entryId, run)
  return run
}

export const currencyPurchase = {
  store, activate, loadProducts, startTopup, handleReturn, checkOrder, discoverOpenOrders,
}
export const useCurrencyPurchase = () => useStore(store)
