// F-32c 다이아 충전(토스 테스트 결제창)과 골드 구매 API 경계.
//
// 충전 흐름: 상품표 조회 → 주문 생성 → 결제창(SDK) → /store?topup=… 복귀 → 서버 확인(confirm) →
// (응답 유실·지급 대기는 주문 조회로 복구) → GRANTED일 때만 잔액 조회. 결제창에서 돌아왔다는 사실만으로
// 잔액을 바꾸거나 충전 완료로 보지 않는다 — 완료는 서버가 GRANTED로 답한 뒤에만 표시한다.
// 계정이 바뀌면 진행 중이던 모든 요청·타이머의 늦은 결과는 버린다(generation).
//
// F-32 BQ(§2-6a): 복귀 URL이 없는 진입(다른 브라우저·재로그인)에서도 진행 중 주문을 이어 가도록 상점
// 진입마다 한 번 계정의 진행 중 주문을 발견한다. 확인 횟수·진행 중 조회는 주문별 기록(records)에 두고,
// 화면에는 활성 주문(active) 한 건만 표시한다. 복귀 주문이 먼저이고, 발견 주문은 대기열(queue)에서
// 최신 것부터 하나씩 기존 규칙(2초 간격·최대 5회·상한 뒤 수동 확인)으로 주문 조회만 한다(confirm 없음).
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
// 서버(backend/service/topup.service.js)와 같은 형식 — 최종 금액 대조는 서버가 맡는다.
const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/
const PAYMENT_KEY = /^[A-Za-z0-9_=+/.-]{1,200}$/
const CLIENT_KEY = /^test_ck_[A-Za-z0-9_=+/-]{8,200}$/
const ORDER_STATUSES = ["CREATED", "CONFIRMING", "PENDING_GRANT", "GRANTED", "FAILED", "CANCELED", "EXPIRED"]
const OPEN_ORDER_STATUSES = ["CONFIRMING", "PENDING_GRANT"]
const MAX_OPEN_ORDERS = 5
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
  // F-32 BQ(§2-6a): 인증 계정의 진행 중 주문 발견(최신순 최대 5건). 한 행이라도 계약 밖이면 목록 전체를 버린다.
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
let pollTimer = null
const returnRuns = new Map()
const inFlightOrders = new Map() // orderId → 진행 중인 복귀 처리(같은 주문 confirm 동시 1회)
// orderId → { orderId, amount, source, serverStatus, pollCount, getRun, heldResult, heldReason, closed }
// 자동 확인 횟수(pollCount)는 주문별이다 — 복귀 선점·재개·수동 확인이 초기화하지 않는다.
const records = new Map()
let queue = [] // 표시 대기 중인 주문(발견 최신순, 선점된 주문은 맨 앞으로 돌아온다)
const excluded = new Set() // 복귀 URL의 orderId — 발견 결과에서 건너뛴다
const discoveryRuns = new Map() // 상점 진입 식별자 → 발견 Promise(같은 진입은 한 번)
let active = null // 화면에 표시 중인 주문 { orderId, token }
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
// 결제창에서 뒤로 가기(bfcache)로 돌아오면 남은 '결제창 이동 중' 잠금을 푼다.
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && get().status === "payment") { creating = false; set({ status: "idle" }); resumeQueue(generation) }
  })
}

// 지갑과 거래 내역을 같은 동기 구간에서 함께 다시 읽는다. 각 실패는 해당 스토어의 재시도 상태에 남고
// 충전 완료 판정은 바꾸지 않는다.
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
    if (started === generation) {
      creating = false
      resumeQueue(started) // 결제창을 열지 못하고 끝났으면 대기 중인 발견 주문을 이어 간다
    }
  }
}

const parseReturn = (search) => {
  const params = new URLSearchParams(search)
  const mode = params.get("topup")
  if (mode !== "success" && mode !== "fail") return null
  if (mode === "fail") {
    // 실패 복귀의 orderId는 발견 중복 제외용으로만 보존한다 — 승인 입력이나 성공 근거로 쓰지 않는다.
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
    // PAYMENT_PROCESSING·통신 실패·계약 밖 응답은 결과를 알 수 없다 — 주문 조회로 복구한다.
    return { kind: "unknown" }
  }
}

const inProgress = () => get().status === "unknown" || get().status === "pendingGrant"

const isTerminal = (status) => status === "GRANTED" || Object.hasOwn(ORDER_FAILURE_REASONS, status)

// 활성 주문이 종결되면 표시를 비우고 대기열의 다음 주문으로 넘어간다.
const finishActive = (orderId, started) => {
  const record = records.get(orderId)
  if (record) record.closed = true
  if (!isActive(orderId)) return
  clearTimeout(pollTimer)
  pollTimer = null
  active = null
  resumeQueue(started)
}

// 선점·재개로 대기열에서 꺼낸 주문을 화면에 올린다. 선점 동안 도착한 결과가 있으면 먼저 소비하고,
// 없으면 true를 돌려 호출자가 남은 자동 확인 횟수로 조회를 이어 가게 한다(횟수는 초기화하지 않는다).
const showQueued = (orderId, started) => {
  const record = records.get(orderId)
  setActive(orderId)
  const confirming = inFlightOrders.has(orderId)
  set({
    status: confirming ? "confirming" : record.serverStatus === "PENDING_GRANT" ? "pendingGrant" : "unknown",
    reason: null, order: { orderId, amount: record.amount }, autoChecks: record.pollCount, lookupFailed: false,
  })
  if (confirming) return false // 복귀의 confirm이 끝나면 runReturn이 이 화면에 결과를 반영한다
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

/**
 * 표시 중인 주문이 없고 충전 흐름이 바쁘지 않으면 대기열의 다음 주문(최신순)을 표시한다. 이어서 주문
 * 조회가 필요하면 그 orderId를 돌려준다(호출자가 schedulePoll로 기존 2초·5회 규칙을 시작한다).
 */
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

// 새 복귀 주문에 표시 우선권을 준다 — 다른 활성 주문은 타이머를 멈추고 기록(횟수·진행 중 조회)을
// 그대로 둔 채 대기열 맨 앞으로 돌려보낸다.
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
    // 선점됐거나 confirm 중인 주문의 결과는 그 주문 기록에만 남긴다 — 표시 중인 다른 주문 화면을 덮지 않는다.
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
  // CREATED·CONFIRMING은 아직 확정되지 않았다 — 상태를 그대로 둔다.
}

/**
 * 주문 조회(GET)로 상태를 확인한다. 인자가 없으면 표시 중인 주문이다(수동 '결과 확인'). 같은 주문의
 * 조회는 하나를 공유하고, 같은 주문의 confirm이 진행 중이면 그 완료를 기다릴 뿐 조회를 겹치지 않는다.
 * 확인 횟수를 바꾸지 않으며 confirm을 보내지 않는다.
 */
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
  // 첫 확인이 끝나는 지점에서 한 번만: 미초기화 지갑을 서버 값으로 채우는 진입 조회(충전 완료 판정이 아니다).
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
  // 같은 주문의 조회가 이미 진행 중이면 먼저 끝낸다 — 조회와 confirm을 겹쳐 보내지 않는다. 그 조회가
  // GRANTED였으면 추가 confirm 없이 완료로 소비한다.
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
    run.entryPending = false // 충전 후 조회가 진입 조회를 겸한다
    record.serverStatus = "GRANTED"
    if (!shown) { record.heldResult = "GRANTED"; return } // 다른 복귀가 선점 — 재개 때 완료로 표시한다
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
    if (!shown) return // 재개되면 남은 자동 확인 횟수로 조회를 이어 간다
    set({ status: outcome.kind })
    schedulePoll(started, ret.orderId)
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
  // 복귀 주문은 발견 결과에서 건너뛴다(같은 주문에 조회·confirm을 겹쳐 보내지 않는다).
  if (ret.orderId && (ret.mode === "fail" || ret.valid)) excluded.add(ret.orderId)
  const key = ret.mode === "fail" ? `fail:${search}` : ret.valid ? `${ret.orderId}:${ret.paymentKey}:${ret.amount}` : `invalid:${search}`
  const existing = returnRuns.get(key)
  if (existing) return existing.promise
  // 같은 주문의 확인이 진행 중이면 paymentKey·amount가 달라진 복귀도 새 confirm을 만들지 않고 먼저 온 입력의 결과를 공유한다.
  const sharing = ret.mode === "success" && ret.valid ? inFlightOrders.get(ret.orderId) : null
  if (sharing) { returnRuns.set(key, sharing); return sharing.promise }
  const run = { entryPending: Boolean(entryNeeded && ret.mode === "success"), promise: null }
  returnRuns.set(key, run)
  // 실패·잘못된 복귀는 confirm이 없는 즉시 종결 안내다. 다른 주문을 확인하는 중이면 그 확인을 끊지 않는다.
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

/**
 * F-32 BQ(§2-6a): StorePanel이 상점 진입마다(같은 진입 식별자는 한 번) 부른다. 계정의 진행 중 주문을
 * 최신순으로 받아 복귀 주문·이미 아는 주문을 빼고 대기열에 넣은 뒤, 표시 중인 주문이 없으면 첫 주문을
 * 기존 주문 조회 경로로 이어 간다. 발견 실패는 조용히 끝내고(다음 진입에서 다시 시도), 계정이 바뀌면
 * 결과를 버린다.
 */
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
      // 표시 중인 주문(복귀 등)이 없으면 최신 주문 한 건을 올리고 기존 2초·최대 5회 조회를 시작한다.
      const next = advance(started)
      if (next) schedulePoll(started, next)
    },
    () => { /* 발견 실패는 상점 사용을 막지 않는다 — 다음 진입에서 다시 시도한다 */ },
  )
  discoveryRuns.set(entryId, run)
  return run
}

export const currencyPurchase = {
  store, activate, loadProducts, startTopup, handleReturn, checkOrder, discoverOpenOrders,
}
export const useCurrencyPurchase = () => useStore(store)
