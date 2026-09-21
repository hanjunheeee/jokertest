import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// F-32c: 실제 router·ProtectedRoute·StorePage·StorePanel·그리드·상세·구매 컨트롤러·스토어·client.js·
// response.js를 jsdom에 마운트해 다이아 충전·골드 구매 흐름을 검증한다. 대체하는 것은 외부 경계뿐이다 —
// env.js(API_BASE_URL), 전역 fetch(서버 응답), 토스 SDK(window.TossPayments), 타이머.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("alert", () => {})
dom.window.alert = () => {}
dom.window.HTMLMediaElement.prototype.pause = () => {}
dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve()

globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "", DISCORD_SUPPORT_URL: undefined },
})

// ── 서버(fetch) 경계 ──────────────────────────────────────────────────────────────
let routes = []
let calls = []
let events = []
const json = (status, body) => {
  const response = { ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => null } }
  response.clone = () => response
  return response
}
const apiError = (status, code, extra = {}) => json(status, { ok: false, code, message: code, ...extra })
const route = (method, pattern, handler) => routes.unshift({ method, pattern, handler })
installDomGlobal("fetch", async (url, options = {}) => {
  const method = options.method ?? "GET"
  const body = options.body ? JSON.parse(options.body) : undefined
  calls.push({ method, path: url, body })
  events.push(`${method} ${url}`)
  const hit = routes.find((entry) => entry.method === method && entry.pattern.test(url))
  if (!hit) throw new Error(`unhandled ${method} ${url}`)
  return hit.handler({ body, url })
})
const count = (method, pattern) => calls.filter((call) => call.method === method && pattern.test(call.path)).length
const posts = (pattern) => calls.filter((call) => call.method === "POST" && pattern.test(call.path))

const WALLET = /\/economy\/accounts\/[^/]+\/wallet$/
const ENTITLEMENTS = /\/economy\/accounts\/[^/]+\/entitlements$/
const PRODUCTS_URL = /\/economy\/currency-products$/
const ORDERS = /\/economy\/topup\/orders$/
const CONFIRM = /\/economy\/topup\/orders\/[^/]+\/confirm$/
const ORDER_GET = /\/economy\/topup\/orders\/[^/]+$/
const GOLD_POST = /\/economy\/gold-purchases$/
const PURCHASE_GET = /\/economy\/purchases\/[^/]+$/
const BULK_POST = /\/economy\/purchases\/bulk$/

// 임시 가격·지급량은 시험 데이터에만 둔다.
const DIAMOND_PRODUCT = {
  productId: "dia-100", kind: "DIAMOND_TOPUP", displayName: "다이아 100", payCurrency: "KRW", payAmount: 1100,
  grantCurrency: "DIAMOND", grantAmount: 100, bonusAmount: 10, version: 1,
}
const GOLD_PRODUCT = {
  productId: "gold-a", kind: "GOLD_PURCHASE", displayName: "골드 묶음", payCurrency: "DIAMOND", payAmount: 7,
  grantCurrency: "GOLD", grantAmount: 123, bonusAmount: 4, version: 3,
}
const LOADOUT = {
  selectedProfilePhotoId: null, selectedProfileBorderId: null, selectedCardFrameId: null, selectedSkinsByJob: null, revision: "r1",
}
const ENTITLEMENTS_LIST = [{ itemId: "owned-item-1" }]
const CLIENT_KEY = "test_ck_abcdefgh12345678"
const RETURN = "/store?topup=success&paymentKey=pay_key_1&orderId=ORDER_0001&amount=1100"

let world
let sdkCalls = []
let sdkBehavior
const sdkFactory = (clientKey) => ({
  payment: ({ customerKey }) => ({
    requestPayment: async (args) => { events.push("SDK"); sdkCalls.push({ clientKey, customerKey, args }); return sdkBehavior(args) },
  }),
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const { render, act, cleanup, waitFor, fireEvent } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../../../../app/routes/index.jsx")
const { useAuthStore } = await import("../../../auth/store/auth.store.js")
const { useEconomyStore } = await import("../../../economy/store/economy.store.js")
const { currencyPurchase } = await import("../../store/currencyPurchase.store.js")
const { storePurchase } = await import("../../store/storePurchase.store.js")
const { createPurchaseController } = await import("../../store/purchaseController.js")

const setUser = async (user) => act(async () => {
  useAuthStore.setState({ isLoggedIn: Boolean(user), user, loggedOutIntentionally: false })
})

// 새 문서·새 세션을 모사한다: 계정을 비워 모든 스토어를 초기화하고 저장소를 준비한 뒤 로그인한다.
async function newWorld({ diamond = 100, gold = 1000, storage = {}, products = [DIAMOND_PRODUCT, GOLD_PRODUCT] } = {}) {
  routes = []; calls = []; events = []; sdkCalls = []
  world = { diamond, gold, products }
  sdkBehavior = async () => {}
  window.TossPayments = sdkFactory
  await setUser(null)
  dom.window.localStorage.clear()
  for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value)
  route("GET", WALLET, () => json(200, { balanceGold: world.gold, balanceDiamond: world.diamond }))
  route("GET", ENTITLEMENTS, () => json(200, { entitlements: ENTITLEMENTS_LIST, loadout: LOADOUT }))
  route("GET", PRODUCTS_URL, () => json(200, { ok: true, products: world.products }))
  route("POST", ORDERS, () => json(201, { ok: true, orderId: "ORDER_0001", amount: 1100, orderName: "다이아 100", clientKey: CLIENT_KEY }))
  await setUser({ uuid: "user-1", nickname: "테스터" })
}

async function mountStore({ path = "/store", strict = false } = {}) {
  await act(async () => { await router.navigate(path) })
  const tree = React.createElement(RouterProvider, { router })
  let view
  await act(async () => { view = render(strict ? React.createElement(React.StrictMode, null, tree) : tree) })
  const skip = view.queryByRole("button", { name: "인트로 건너뛰기" })
  if (skip) await act(async () => { fireEvent.click(skip) })
  return view
}
const flush = () => act(async () => { for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve)) })
const text = (view) => view.container.textContent
const balance = (view, prefix) => view.container.querySelector(`[aria-label^="${prefix}"]`)?.getAttribute("aria-label")
const GOLD_LABEL = "무료 재화"
const DIAMOND_LABEL = "유료 재화"
const waitText = (view, pattern) => waitFor(() => assert.match(text(view), pattern))
const waitBalance = (view, prefix, expected) => waitFor(() => assert.equal(balance(view, prefix), expected))
const button = (view, name) => view.getByRole("button", { name })
const click = (view, name) => act(async () => { fireEvent.click(button(view, name)) })
const selectItem = (view, name) => act(async () => {
  const slot = Array.from(view.container.querySelectorAll("button[aria-pressed]")).find((el) => el.textContent.includes(name))
  assert.ok(slot, `상품 슬롯 ${name}`)
  fireEvent.click(slot)
})
const goToReturn = (path = RETURN) => act(async () => { await router.navigate(path) })
const openCurrencyTab = async (view) => { await click(view, "인게임 재화"); await waitText(view, /다이아 100/) }

test.afterEach(async () => {
  cleanup()
  mock.timers.reset()
  await setUser(null) // 진행 중 타이머·요청의 늦은 결과를 계정 무효화로 정리한다
})

// ── AC-01 ────────────────────────────────────────────────────────────────────────
test("AC-01: 서버 상품표를 순서·가격·지급량 그대로 보여 주고 주문→SDK→복귀 후 confirm 순서로 호출한다", async () => {
  await newWorld()
  route("POST", CONFIRM, () => { world.diamond = 210; return json(200, { ok: true, status: "GRANTED", balanceDiamond: 210 }) })
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)

  const grid = view.container.textContent
  assert.ok(grid.indexOf("다이아 100") < grid.indexOf("골드 묶음"), "서버 목록 순서를 유지한다")
  assert.match(grid, /1,100원/)
  assert.equal(view.getByTestId("currency-pay").textContent, "1,100 원")
  assert.equal(view.getByTestId("currency-grant").textContent, "지급 100 다이아")
  assert.match(view.getByTestId("currency-bonus").textContent, /\+10 다이아/)

  await click(view, "충전")
  await waitFor(() => assert.equal(sdkCalls.length, 1))
  assert.deepEqual(posts(ORDERS).map((call) => call.body), [{ productId: "dia-100", version: 1 }])
  const { clientKey, customerKey, args } = sdkCalls[0]
  assert.equal(clientKey, CLIENT_KEY)
  assert.match(customerKey, /^[0-9a-f-]{36}$/)
  assert.deepEqual(args, {
    method: "CARD", amount: { currency: "KRW", value: 1100 }, orderId: "ORDER_0001", orderName: "다이아 100",
    successUrl: "http://localhost/store?topup=success", failUrl: "http://localhost/store?topup=fail",
  })
  assert.equal(posts(CONFIRM).length, 0, "결제창만 열린 상태에서는 confirm을 호출하지 않는다")

  await goToReturn()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 210")
  assert.deepEqual(posts(CONFIRM).map((call) => call.body), [{ paymentKey: "pay_key_1", amount: 1100 }])
  assert.match(text(view), /충전이 완료되었습니다/)
  const order = events.filter((event) => /topup\/orders$|^SDK$|confirm$/.test(event))
  assert.deepEqual(order, ["POST /economy/topup/orders", "SDK", "POST /economy/topup/orders/ORDER_0001/confirm"])
})

// ── AC-02 ────────────────────────────────────────────────────────────────────────
test("AC-02: ready 잔액은 서버 확인 전에 변하지 않고 GRANTED 응답 뒤에만 갱신된다", async () => {
  await newWorld()
  const confirm = deferred()
  route("POST", CONFIRM, () => confirm.promise)
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  const walletCalls = count("GET", WALLET)
  const entitlementCalls = count("GET", ENTITLEMENTS)

  await goToReturn()
  await waitFor(() => assert.equal(posts(CONFIRM).length, 1))
  await flush()
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 100")
  assert.equal(count("GET", WALLET), walletCalls)
  assert.equal(count("GET", ENTITLEMENTS), entitlementCalls)
  assert.match(text(view), /서버에서 확인하고 있습니다/)
  assert.equal(button(view, "확인 중").disabled, true, "확인 중에는 충전 버튼이 '확인 중'으로 표시되고 잠긴다")

  world.diamond = 150
  confirm.resolve(json(200, { ok: true, status: "GRANTED", balanceDiamond: 150 }))
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 150")
  assert.equal(count("GET", WALLET), walletCalls + 1)
  assert.equal(posts(CONFIRM).length, 1)
})

test("AC-02: ready 상태에서 PENDING_GRANT·확인 유실·실패가 나와도 충전이 추가 잔액 조회를 만들지 않는다", async () => {
  await newWorld()
  route("POST", CONFIRM, () => json(200, { ok: true, status: "PENDING_GRANT" }))
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  const walletCalls = count("GET", WALLET)
  await goToReturn()
  await waitText(view, /다이아 지급을 기다리고 있습니다/)
  await flush()
  assert.equal(count("GET", WALLET), walletCalls)
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 100")
})

const NEW_DOCUMENT_OUTCOMES = [
  ["AMOUNT_MISMATCH", () => apiError(400, "AMOUNT_MISMATCH"), /금액이 주문과 달라/],
  ["NOT_OWNER", () => apiError(403, "NOT_OWNER"), /다른 계정의 주문/],
  ["ORDER_NOT_FOUND", () => apiError(404, "ORDER_NOT_FOUND"), /주문을 찾을 수 없어/],
  ["PAYMENT_FAILED", () => apiError(402, "PAYMENT_FAILED"), /결제가 완료되지 않아/],
  ["CONFIG_MISSING", () => apiError(503, "CONFIG_MISSING"), /결제 설정이 아직 준비되지 않아/],
  ["network failure", () => { throw new TypeError("lost") }, /결제 결과 확인이 필요합니다/],
  ["out-of-contract 200", () => json(200, {}), /결제 결과 확인이 필요합니다/],
  ["PENDING_GRANT", () => json(200, { ok: true, status: "PENDING_GRANT" }), /지급을 기다리고 있습니다/],
]
test("AC-02: 새 문서 — 확인 중에는 잔액 조회·숫자 표시가 없고, 각 종료 결과가 첫 확인 종료 시 진입 조회를 정확히 한 번 시작한다", async () => {
  for (const [name, respond, message] of NEW_DOCUMENT_OUTCOMES) {
    await newWorld()
    const confirm = deferred()
    route("POST", CONFIRM, () => confirm.promise)
    const view = await mountStore({ path: RETURN })
    await waitFor(() => assert.equal(posts(CONFIRM).length, 1))
    await flush()
    assert.equal(count("GET", WALLET), 0, `${name}: 확인 중에는 잔액 조회 없음`)
    assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 불러오는 중", `${name}: 숫자를 꾸며 표시하지 않음`)

    try { confirm.resolve(respond()) } catch (error) { confirm.reject(error) }
    await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
    assert.match(text(view), message, name)
    assert.equal(count("GET", WALLET), 1, `${name}: 진입 조회 1회`)
    assert.equal(posts(CONFIRM).length, 1)
    assert.equal(useEconomyStore.getState().status, "ready")
    cleanup()
  }
})

test("AC-02: 새 문서 실패·취소 복귀는 confirm 없이 진입 조회로 잔액을 채운다", async () => {
  await newWorld()
  const view = await mountStore({ path: "/store?topup=fail&code=PAY_PROCESS_CANCELED&message=x&orderId=ORDER_0001" })
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  assert.equal(posts(CONFIRM).length, 0)
  assert.match(text(view), /결제가 취소되었거나 완료되지 않았습니다/)
  assert.equal(count("GET", WALLET), 1)
})

test("AC-02: 진입 조회가 실패하면 잔액 재시도 UI로 끝나고 충전 결과는 바뀌지 않는다", async () => {
  await newWorld()
  const walletFail = { on: true }
  route("GET", WALLET, () => (walletFail.on ? json(500, { ok: false }) : json(200, { balanceGold: 1000, balanceDiamond: 100 })))
  route("POST", CONFIRM, () => apiError(400, "AMOUNT_MISMATCH"))
  const view = await mountStore({ path: RETURN })
  await waitFor(() => assert.equal(useEconomyStore.getState().status, "error"))
  assert.match(text(view), /금액이 주문과 달라/)
  walletFail.on = false
  await act(async () => { fireEvent.click(view.getAllByRole("button", { name: "재시도" })[0]) })
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  assert.match(text(view), /금액이 주문과 달라/, "잔액 재시도가 충전 결과를 덮어쓰지 않는다")
  assert.equal(posts(CONFIRM).length, 1, "재결제·재확인 없음")
})

test("AC-03: StrictMode·재마운트에도 같은 복귀의 confirm과 진입 조회는 한 번만 실행한다", async () => {
  await newWorld()
  const confirm = deferred()
  route("POST", CONFIRM, () => confirm.promise)
  const view = await mountStore({ path: RETURN, strict: true })
  await waitFor(() => assert.equal(posts(CONFIRM).length, 1))
  await flush()
  assert.equal(count("GET", WALLET), 0)
  confirm.resolve(apiError(400, "AMOUNT_MISMATCH"))
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  assert.equal(posts(CONFIRM).length, 1)
  assert.equal(count("GET", WALLET), 1)
  // 같은 URL로 다시 마운트해도 같은 처리를 재사용한다.
  cleanup()
  await mountStore({ path: RETURN, strict: true })
  await flush()
  assert.equal(posts(CONFIRM).length, 1)
})

test("AC-03: 같은 주문의 confirm이 진행 중이면 paymentKey·amount만 바뀐 복귀도 새 confirm을 만들지 않고 먼저 온 입력의 결과를 공유한다", async () => {
  await newWorld()
  const confirm = deferred()
  route("POST", CONFIRM, () => { world.diamond = 210; return confirm.promise })
  const view = await mountStore({ path: RETURN })
  await waitFor(() => assert.equal(posts(CONFIRM).length, 1))
  // 같은 orderId, 다른 paymentKey·amount의 두 번째 복귀를 confirm 보류 중에 넣는다(search 변경 효과 경로).
  await goToReturn("/store?topup=success&paymentKey=pay_key_2&orderId=ORDER_0001&amount=1200")
  await flush()
  assert.equal(posts(CONFIRM).length, 1, "진행 중인 같은 주문에는 두 번째 confirm을 보내지 않는다")
  confirm.resolve(json(200, { ok: true, status: "GRANTED", balanceDiamond: 210 }))
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 210")
  await flush()
  assert.deepEqual(posts(CONFIRM).map((call) => call.body), [{ paymentKey: "pay_key_1", amount: 1100 }], "먼저 온 입력의 값으로 confirm한다")
  assert.match(text(view), /충전이 완료되었습니다/)
})

test("AC-02: 계정이 바뀐 뒤 이전 계정의 확인 종료는 새 계정의 잔액 조회를 시작하지 않는다", async () => {
  await newWorld()
  const confirm = deferred()
  route("POST", CONFIRM, () => confirm.promise)
  await mountStore({ path: RETURN })
  await waitFor(() => assert.equal(posts(CONFIRM).length, 1))
  await goToReturn("/store") // 새 계정은 복귀 URL이 아닌 일반 진입으로 시작한다
  await setUser({ uuid: "user-2", nickname: "둘째" })
  await flush()
  const afterSwitch = count("GET", WALLET)
  confirm.resolve(apiError(400, "AMOUNT_MISMATCH"))
  await flush()
  assert.equal(count("GET", WALLET), afterSwitch, "이전 계정의 확인 종료가 새 계정의 잔액 조회를 시작하지 않는다")
  assert.equal(currencyPurchase.store.getState().status, "idle")
})

// ── AC-03 ────────────────────────────────────────────────────────────────────────
test("AC-03: 충전 버튼 연속 클릭·동시 호출에도 주문 생성은 1회만 처리된다", async () => {
  await newWorld()
  const order = deferred()
  route("POST", ORDERS, () => order.promise)
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  const target = button(view, "충전")
  await act(async () => { fireEvent.click(target); fireEvent.click(target) })
  assert.equal(posts(ORDERS).length, 1)
  assert.equal(button(view, "주문 생성 중").disabled, true)
  await Promise.all([
    currencyPurchase.startTopup({ productId: "dia-100", version: 1 }),
    currencyPurchase.startTopup({ productId: "dia-100", version: 1 }),
  ])
  assert.equal(posts(ORDERS).length, 1)
  order.resolve(json(201, { ok: true, orderId: "ORDER_0001", amount: 1100, orderName: "다이아 100", clientKey: CLIENT_KEY }))
  await waitFor(() => assert.equal(sdkCalls.length, 1))
})

const startPolling = async (confirmResponse, { diamond = 100 } = {}) => {
  await newWorld({ diamond })
  route("POST", CONFIRM, confirmResponse)
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, `유료 재화 ${diamond}`)
  await openCurrencyTab(view)
  mock.timers.enable({ apis: ["setTimeout"] })
  await goToReturn()
  await flush()
  return view
}
const tick = async (ms) => { await act(async () => { mock.timers.tick(ms) }); await flush() }
// mock 타이머가 켜져 있으면 RTL waitFor는 종료 시 setTimeout(0)을 기다리며 멈춘다 — flush를 반복해 확인한다.
const until = async (check) => {
  let last
  for (let i = 0; i < 30; i += 1) {
    try { check(); return } catch (error) { last = error; await flush() }
  }
  throw last
}
const untilBalance = (view, prefix, expected) => until(() => assert.equal(balance(view, prefix), expected))
const untilText = (view, pattern) => until(() => assert.match(text(view), pattern))

test("AC-03: 확인 응답이 유실되면 2초 뒤 주문 조회로 복구해 GRANTED에서만 완료·잔액 갱신을 한다", async () => {
  const view = await startPolling(() => { throw new TypeError("lost") })
  assert.match(text(view), /결제 결과 확인이 필요합니다/)
  assert.equal(count("GET", ORDER_GET), 0)
  route("GET", ORDER_GET, () => json(200, { ok: true, orderId: "ORDER_0001", status: "GRANTED", balanceDiamond: 150 }))
  world.diamond = 150
  await tick(1999)
  assert.equal(count("GET", ORDER_GET), 0)
  await tick(1)
  await untilBalance(view, DIAMOND_LABEL, "유료 재화 150")
  assert.match(text(view), /충전이 완료되었습니다/)
})

test("AC-03: PENDING_GRANT는 지급 대기로 표시하고 주문 조회의 GRANTED로 완료한다", async () => {
  const view = await startPolling(() => json(200, { ok: true, status: "PENDING_GRANT" }))
  assert.match(text(view), /다이아 지급을 기다리고 있습니다/)
  assert.equal(button(view, "지급 대기").disabled, true)
  route("GET", ORDER_GET, () => json(200, { ok: true, orderId: "ORDER_0001", status: "GRANTED", balanceDiamond: 130 }))
  world.diamond = 130
  await tick(2000)
  await untilBalance(view, DIAMOND_LABEL, "유료 재화 130")
  assert.match(text(view), /충전이 완료되었습니다/)
})

test("AC-03: 자동 조회는 2초 간격 최대 5회에서 멈추고 수동 결과 확인을 남기며 잔액은 숫자로 남는다", async () => {
  await newWorld()
  route("POST", CONFIRM, () => json(200, { ok: true, status: "PENDING_GRANT" }))
  route("GET", ORDER_GET, () => json(200, { ok: true, orderId: "ORDER_0001", status: "CONFIRMING" }))
  mock.timers.enable({ apis: ["setTimeout"] })
  const view = await mountStore({ path: RETURN })
  await flush()
  await untilBalance(view, DIAMOND_LABEL, "유료 재화 100") // 새 문서: 첫 확인 종료 뒤 진입 조회
  for (let i = 1; i <= 5; i += 1) { await tick(2000); assert.equal(count("GET", ORDER_GET), i) }
  await tick(10000)
  assert.equal(count("GET", ORDER_GET), 5)
  assert.match(text(view), /자동 확인을 마쳤습니다/)
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 100")
  assert.equal(useEconomyStore.getState().status, "ready")
  assert.equal(count("GET", WALLET), 1, "상한 소진이 진입 조회를 재실행하지 않는다")
  route("GET", ORDER_GET, () => json(200, { ok: true, orderId: "ORDER_0001", status: "GRANTED", balanceDiamond: 160 }))
  world.diamond = 160
  await click(view, "결과 확인")
  await untilBalance(view, DIAMOND_LABEL, "유료 재화 160")
  assert.equal(count("GET", ORDER_GET), 6)
})

for (const [status, message] of [
  ["FAILED", /결제가 실패해 다이아가 지급되지 않았습니다/],
  ["CANCELED", /결제가 취소되어 다이아가 지급되지 않았습니다/],
  ["EXPIRED", /결제 시간이 만료되어 다이아가 지급되지 않았습니다/],
]) {
  test(`AC-03: 주문 조회 ${status}는 실패로 수렴하며 각각 다른 미지급 사유를 표시한다`, async () => {
    const view = await startPolling(() => { throw new TypeError("lost") })
    route("GET", ORDER_GET, () => json(200, { ok: true, orderId: "ORDER_0001", status }))
    await tick(2000)
    await untilText(view, message)
    assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 100")
  })
}

test("AC-03: 조회 실패는 상태를 확정하지 않고 수동 결과 확인을 남긴다", async () => {
  const view = await startPolling(() => { throw new TypeError("lost") })
  route("GET", ORDER_GET, () => { throw new TypeError("offline") })
  await tick(2000)
  assert.match(text(view), /주문 조회에 실패했습니다/)
  assert.match(text(view), /결제 결과 확인이 필요합니다/)
  assert.ok(button(view, "결과 확인"))
})

test("AC-03: 실패 복귀·SDK 취소는 취소로, SDK 로딩 실패는 재시도 가능한 실패로 표시하고 confirm은 호출하지 않는다", async () => {
  await newWorld()
  const failView = await mountStore({ path: "/store?topup=fail&code=PAY_PROCESS_CANCELED&message=x&orderId=ORDER_0001" })
  await waitText(failView, /결제가 취소되었거나 완료되지 않았습니다/)
  assert.equal(posts(CONFIRM).length, 0)
  cleanup()

  await newWorld()
  sdkBehavior = async () => { throw Object.assign(new Error("cancel"), { code: "USER_CANCEL" }) }
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  await click(view, "충전")
  await waitText(view, /결제가 취소되었거나 완료되지 않았습니다/)
  assert.equal(posts(CONFIRM).length, 0)
  cleanup()

  await newWorld()
  delete window.TossPayments
  const loadView = await mountStore()
  await waitBalance(loadView, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(loadView)
  await click(loadView, "충전")
  await waitFor(() => assert.ok(document.head.querySelector('script[src="https://js.tosspayments.com/v2/standard"]')))
  await act(async () => { document.head.querySelector("script").dispatchEvent(new window.Event("error")) })
  await waitText(loadView, /결제창을 불러오지 못했습니다/)
  assert.equal(posts(CONFIRM).length, 0)
  window.TossPayments = sdkFactory
  await click(loadView, "충전")
  await waitFor(() => assert.equal(sdkCalls.length, 1))
  assert.equal(posts(ORDERS).length, 2)
})

// ── AC-04 ────────────────────────────────────────────────────────────────────────
test("AC-04: 주문 생성이 CONFIG_MISSING이면 설정 대기로 잠기고, 목록 새로고침 성공 뒤 다음 명시적 클릭에서만 다시 주문한다", async () => {
  await newWorld()
  route("POST", ORDERS, () => apiError(503, "CONFIG_MISSING"))
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  await click(view, "충전")
  await waitFor(() => assert.equal(button(view, "설정 대기").disabled, true))
  assert.equal(posts(ORDERS).length, 1)
  assert.equal(sdkCalls.length, 0)
  assert.equal(posts(CONFIRM).length, 0)
  assert.match(text(view), /설정 대기/)
  await act(async () => { fireEvent.click(button(view, "설정 대기")) })
  assert.equal(posts(ORDERS).length, 1)

  const list = deferred()
  route("GET", PRODUCTS_URL, () => list.promise)
  await click(view, "상품 목록 새로고침")
  assert.equal(button(view, "상품 목록 새로고침").disabled, true, "요청 중 중복 호출을 막는다")
  assert.equal(button(view, "설정 대기").disabled, true)
  list.resolve(json(200, { ok: true, products: [{ ...DIAMOND_PRODUCT, version: 2, payAmount: 1200 }, GOLD_PRODUCT] }))
  await waitFor(() => assert.equal(button(view, "충전").disabled, false))
  assert.equal(posts(ORDERS).length, 1, "목록 새로고침 자체는 주문을 만들지 않는다")
  assert.equal(sdkCalls.length, 0)
  assert.equal(view.getByTestId("currency-pay").textContent, "1,200 원", "새 version 객체로 선택이 갱신된다")

  route("POST", ORDERS, () => json(201, { ok: true, orderId: "ORDER_0002", amount: 1200, orderName: "다이아 100", clientKey: CLIENT_KEY }))
  await click(view, "충전")
  await waitFor(() => assert.equal(sdkCalls.length, 1))
  assert.deepEqual(posts(ORDERS).map((call) => call.body), [{ productId: "dia-100", version: 1 }, { productId: "dia-100", version: 2 }])
})

test("AC-04: 목록 조회 실패는 오류·다시 시도를 남기고 충전을 잠그며, 빈 목록은 안내한다", async () => {
  await newWorld()
  route("GET", PRODUCTS_URL, () => { throw new TypeError("offline") })
  const view = await mountStore()
  await click(view, "인게임 재화")
  await waitText(view, /상품 목록을 불러오지 못했습니다/)
  route("GET", PRODUCTS_URL, () => json(200, { ok: true, products: [] }))
  await click(view, "다시 시도")
  await waitText(view, /판매 중인 재화 상품이 없습니다/)
  assert.equal(posts(ORDERS).length, 0)
})

test("AC-04: 주문 응답의 clientKey가 누락·live·잘못된 형식이면 설정 대기이고 SDK·confirm은 호출하지 않는다", async () => {
  for (const clientKey of [undefined, "live_ck_abcdefgh12345678", "test_ck_"]) {
    await newWorld()
    route("POST", ORDERS, () => json(201, { ok: true, orderId: "ORDER_0001", amount: 1100, orderName: "다이아 100", clientKey }))
    const view = await mountStore()
    await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
    await openCurrencyTab(view)
    await click(view, "충전")
    await waitFor(() => assert.ok(button(view, "설정 대기")))
    assert.equal(sdkCalls.length, 0)
    assert.equal(posts(CONFIRM).length, 0)
    cleanup()
  }
})

test("AC-04: 깨진 주문 응답은 재시도 가능한 실패이다", async () => {
  await newWorld()
  route("POST", ORDERS, () => json(201, { ok: true }))
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  await click(view, "충전")
  await waitText(view, /주문을 만들지 못했습니다/)
  assert.equal(button(view, "충전").disabled, false)
  assert.equal(sdkCalls.length, 0)
})

test("AC-01: 충전 상품 버전이 바뀌면 자동 주문 없이 목록을 다시 받고 새 조건을 확인한 뒤에만 주문한다", async () => {
  await newWorld()
  route("POST", ORDERS, () => apiError(409, "PRODUCT_VERSION_MISMATCH"))
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  world.products = [{ ...DIAMOND_PRODUCT, version: 2, payAmount: 1300 }, GOLD_PRODUCT]
  await click(view, "충전")
  await waitText(view, /상품 정보가 변경되었습니다/)
  await waitFor(() => assert.equal(view.getByTestId("currency-pay").textContent, "1,300 원"))
  assert.equal(posts(ORDERS).length, 1, "재확인 전 추가 주문 없음")
  assert.equal(sdkCalls.length, 0)
})

// ── AC-05 ────────────────────────────────────────────────────────────────────────
async function mountGold() {
  await newWorld()
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  await selectItem(view, "골드 묶음")
  return view
}

test("AC-05: 서버 가격·지급량을 그대로 표시하고 골드 POST는 productId·version·referenceEventId만 보낸다", async () => {
  const view = await mountGold()
  assert.equal(view.getByTestId("currency-pay").textContent, "7 다이아")
  assert.equal(view.getByTestId("currency-grant").textContent, "지급 123 골드")
  assert.match(view.getByTestId("currency-bonus").textContent, /\+4 골드/)
  const goldPost = deferred()
  route("POST", GOLD_POST, () => goldPost.promise)
  await click(view, "골드 구매")
  await waitFor(() => assert.ok(button(view, "처리 중")))
  assert.equal(button(view, "처리 중").disabled, true)
  assert.equal(posts(GOLD_POST).length, 1)
  assert.deepEqual(Object.keys(posts(GOLD_POST)[0].body).sort(), ["productId", "referenceEventId", "version"])
  assert.equal(posts(GOLD_POST)[0].body.productId, "gold-a")
  assert.equal(posts(GOLD_POST)[0].body.version, 3)
  assert.match(text(view), /골드 구매를 처리하고 있습니다/)

  const entitlementsBefore = useEconomyStore.getState().entitlements
  goldPost.resolve(json(200, { ok: true, balanceGold: 1123, balanceDiamond: 93 }))
  await waitText(view, /골드 구매가 완료되었습니다/)
  assert.equal(balance(view, GOLD_LABEL), "무료 재화 1123")
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 93")
  assert.deepEqual(useEconomyStore.getState().entitlements, entitlementsBefore)
  assert.equal(useEconomyStore.getState().loadout.revision, "r1")
})

test("AC-05: 골드 구매 전에 시작한 늦은 지갑 조회가 구매 성공 뒤 잔액을 되돌리지 못한다", async () => {
  const view = await mountGold()
  const lateWallet = deferred()
  route("GET", WALLET, () => lateWallet.promise)
  const summary = useEconomyStore.getState().fetchSummary()
  route("POST", GOLD_POST, () => json(200, { ok: true, balanceGold: 1123, balanceDiamond: 93 }))
  await click(view, "골드 구매")
  await waitBalance(view, GOLD_LABEL, "무료 재화 1123")
  lateWallet.resolve(json(200, { balanceGold: 1000, balanceDiamond: 100 }))
  await summary
  await flush()
  assert.equal(balance(view, GOLD_LABEL), "무료 재화 1123")
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 93")
})

test("AC-05: 다이아 부족은 안내와 충전 이동 링크를 보이고 잔액을 바꾸지 않으며, 재화 탭에서는 전체 목록으로 토글하지 않는다", async () => {
  const view = await mountGold()
  route("POST", GOLD_POST, () => apiError(400, "INSUFFICIENT_DIAMOND"))
  await click(view, "골드 구매")
  await waitText(view, /다이아가 부족합니다/)
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 100")
  await click(view, "다이아 충전하러 가기")
  const heading = () => view.container.querySelector('section[aria-label="선택한 아이템 정보"] h2')?.textContent
  await waitFor(() => assert.equal(heading(), "다이아 100"))
  assert.equal(button(view, "인게임 재화").getAttribute("aria-pressed"), "true", "재화 탭이 유지된다")
})

test("AC-05: 다른 탭에서의 부족 링크는 재화 탭으로 이동해 충전 상품을 선택한다", async () => {
  await newWorld()
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await openCurrencyTab(view)
  await selectItem(view, "골드 묶음")
  route("POST", GOLD_POST, () => apiError(400, "INSUFFICIENT_DIAMOND"))
  await click(view, "골드 구매")
  await waitText(view, /다이아가 부족합니다/)
  await click(view, "스킨")
  await click(view, "다이아 충전하러 가기")
  assert.equal(button(view, "인게임 재화").getAttribute("aria-pressed"), "true")
  await waitFor(() => assert.equal(view.container.querySelector('section[aria-label="선택한 아이템 정보"] h2')?.textContent, "다이아 100"))
})

test("AC-05: 응답 유실은 확인 필요이고 결과 확인이 저장된 원래 요청으로 조회해 복구한다(재전송 없음)", async () => {
  const view = await mountGold()
  route("POST", GOLD_POST, () => { throw new TypeError("lost") })
  await click(view, "골드 구매")
  await waitText(view, /골드 구매 결과 확인이 필요합니다/)
  const original = posts(GOLD_POST)[0].body
  route("GET", PURCHASE_GET, () => json(200, { ok: true, kind: "GOLD", results: [], balanceGold: 1123, balanceDiamond: 93 }))
  await click(view, "결과 확인")
  await waitText(view, /골드 구매가 완료되었습니다/)
  assert.equal(calls.find((call) => PURCHASE_GET.test(call.path)).path, `/economy/purchases/${encodeURIComponent(original.referenceEventId)}`)
  assert.equal(posts(GOLD_POST).length, 1)
  assert.equal(balance(view, GOLD_LABEL), "무료 재화 1123")
})

test("AC-05: 결과 404는 unknown이며 상품 선택·단순 클릭은 재전송하지 못하고, 명시적 다시 시도만 원래 본문으로 재전송한다", async () => {
  const view = await mountGold()
  route("POST", GOLD_POST, () => { throw new TypeError("lost") })
  await click(view, "골드 구매")
  await waitText(view, /골드 구매 결과 확인이 필요합니다/)
  const original = posts(GOLD_POST)[0].body
  route("GET", PURCHASE_GET, () => json(404, { success: false, code: "PURCHASE_RESULT_NOT_FOUND", message: "none" }))
  await click(view, "결과 확인")
  await flush()
  assert.match(text(view), /아직 구매 결과를 확인하지 못했습니다/)
  assert.equal(posts(GOLD_POST).length, 1)
  assert.equal(button(view, "골드 구매").disabled, true, "미확정 요청이 있으면 새 구매를 막는다")
  await selectItem(view, "다이아 100")
  await flush()
  assert.equal(posts(GOLD_POST).length, 1)

  // 미지의 404(코드 없음)는 재전송 허가가 아니다.
  route("GET", PURCHASE_GET, () => json(404, { ok: false, code: "NOT_FOUND", message: "?" }))
  await click(view, "다시 시도")
  await flush()
  assert.equal(posts(GOLD_POST).length, 1)

  route("GET", PURCHASE_GET, () => json(404, { success: false, code: "PURCHASE_RESULT_NOT_FOUND", message: "none" }))
  route("POST", GOLD_POST, () => json(200, { ok: true, balanceGold: 1123, balanceDiamond: 93 }))
  await click(view, "다시 시도")
  await waitText(view, /골드 구매가 완료되었습니다/)
  assert.equal(posts(GOLD_POST).length, 2)
  assert.deepEqual(posts(GOLD_POST)[1].body, original)
})

test("AC-05: 가격 변경은 목록을 다시 받아 새 조건을 보이고, 재확인 전에는 추가 POST 없이 재확인 뒤 새 참조 ID로만 구매한다", async () => {
  const view = await mountGold()
  route("POST", GOLD_POST, () => apiError(409, "PRODUCT_VERSION_MISMATCH"))
  world.products = [DIAMOND_PRODUCT, { ...GOLD_PRODUCT, version: 4, payAmount: 9, grantAmount: 150 }]
  await click(view, "골드 구매")
  await waitText(view, /새 조건: 9 다이아 → 골드 150/)
  assert.equal(posts(GOLD_POST).length, 1)
  assert.equal(button(view, "가격 재확인 필요").disabled, true)
  await act(async () => { fireEvent.click(button(view, "가격 재확인 필요")) })
  assert.equal(posts(GOLD_POST).length, 1)
  const firstReference = posts(GOLD_POST)[0].body.referenceEventId
  await waitFor(() => assert.equal(button(view, "새 조건 확인").disabled, false))
  await click(view, "새 조건 확인")
  route("POST", GOLD_POST, () => json(200, { ok: true, balanceGold: 1150, balanceDiamond: 91 }))
  await click(view, "골드 구매")
  await waitText(view, /골드 구매가 완료되었습니다/)
  assert.equal(posts(GOLD_POST).length, 2)
  assert.equal(posts(GOLD_POST)[1].body.version, 4)
  assert.notEqual(posts(GOLD_POST)[1].body.referenceEventId, firstReference)
  assert.equal(balance(view, GOLD_LABEL), "무료 재화 1150")
})

test("AC-05: 저장 실패 시 전송을 막고, 계정이 바뀌면 이전 계정의 늦은 결과를 무시한다", async () => {
  const view = await mountGold()
  const setItem = mock.method(dom.window.Storage.prototype, "setItem", () => { throw new Error("quota") })
  try {
    await click(view, "골드 구매")
    await flush()
    assert.equal(posts(GOLD_POST).length, 0)
    assert.match(text(view), /전송하지 못했습니다|전송하지/)
  } finally { setItem.mock.restore() }

  cleanup()
  const view2 = await mountGold()
  const late = deferred()
  route("POST", GOLD_POST, () => late.promise)
  await click(view2, "골드 구매")
  await waitFor(() => assert.equal(posts(GOLD_POST).length, 1))
  await setUser({ uuid: "user-2", nickname: "둘째" })
  late.resolve(json(200, { ok: true, balanceGold: 5000, balanceDiamond: 1 }))
  await flush()
  assert.notEqual(useEconomyStore.getState().balanceGold, 5000)
  assert.equal(storePurchase.store.getState().status, "idle")
})

test("AC-05: 저장된 priceChanged 기록으로 상점을 열면 목록을 다시 받아 새 조건 확인 전에는 구매하지 못한다", async () => {
  const record = { kind: "GOLD", status: "priceChanged", referenceEventId: "shop:old", itemIds: [], productId: "gold-a", version: 3, error: null, code: null }
  await newWorld({ storage: { "joker:store-purchase:v1:user-1": JSON.stringify(record) } })
  world.products = [DIAMOND_PRODUCT, { ...GOLD_PRODUCT, version: 5, payAmount: 8 }]
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await waitText(view, /새 조건: 8 다이아/)
  await openCurrencyTab(view)
  await selectItem(view, "골드 묶음")
  assert.equal(button(view, "가격 재확인 필요").disabled, true)
  assert.equal(posts(GOLD_POST).length, 0)
  await waitFor(() => assert.equal(button(view, "새 조건 확인").disabled, false))
  await click(view, "새 조건 확인")
  route("POST", GOLD_POST, () => json(200, { ok: true, balanceGold: 1200, balanceDiamond: 92 }))
  await click(view, "골드 구매")
  await waitText(view, /골드 구매가 완료되었습니다/)
  assert.equal(posts(GOLD_POST)[0].body.version, 5)
  assert.notEqual(posts(GOLD_POST)[0].body.referenceEventId, "shop:old")
})

test("AC-05: 최초 목록 조회가 실패해도 수동 재조회가 성공하면 새 조건 확인이 활성화된다", async () => {
  const record = { kind: "GOLD", status: "priceChanged", referenceEventId: "shop:old", itemIds: [], productId: "gold-a", version: 3, error: null, code: null }
  await newWorld({ storage: { "joker:store-purchase:v1:user-1": JSON.stringify(record) } })
  route("GET", PRODUCTS_URL, () => apiError(500, "SERVER_ERROR"))
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await click(view, "인게임 재화")
  await waitText(view, /상품 목록을 불러오지 못했습니다/)
  assert.equal(button(view, "새 조건 확인").disabled, true, "목록을 받지 못한 동안은 재확인할 수 없다")
  route("GET", PRODUCTS_URL, () => json(200, { ok: true, products: [DIAMOND_PRODUCT, { ...GOLD_PRODUCT, version: 5, payAmount: 8 }] }))
  await click(view, "상품 목록 새로고침")
  await waitText(view, /새 조건: 8 다이아/)
  await waitFor(() => assert.equal(button(view, "새 조건 확인").disabled, false))
  assert.equal(posts(GOLD_POST).length, 0)
})

test("AC-05: 골드 구매 서버 거부·통신 실패는 각각 실패·확인 필요로 표시하고 잔액은 그대로이다", async () => {
  const view = await mountGold()
  route("POST", GOLD_POST, () => apiError(409, "PRODUCT_STOPPED"))
  await click(view, "골드 구매")
  await waitText(view, /골드 구매에 실패했습니다\. 재화는 차감되지 않았습니다/)
  assert.doesNotMatch(text(view), /다이아가 부족합니다/)
  assert.equal(posts(GOLD_POST).length, 1)
  assert.equal(balance(view, GOLD_LABEL), "무료 재화 1000")
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 100")
  assert.equal(button(view, "골드 구매").disabled, false, "거부 뒤에는 다시 구매할 수 있다")

  route("POST", GOLD_POST, () => { throw new TypeError("offline") })
  await click(view, "골드 구매")
  await waitText(view, /골드 구매 결과 확인이 필요합니다/)
  assert.doesNotMatch(text(view), /골드 구매에 실패했습니다/)
  assert.equal(balance(view, GOLD_LABEL), "무료 재화 1000")
  assert.equal(balance(view, DIAMOND_LABEL), "유료 재화 100")
})

test("회귀: 기존 스킨 상품은 기존 일괄구매 POST로 구매한다", async () => {
  await newWorld()
  route("POST", BULK_POST, () => json(200, { results: [] }))
  const view = await mountStore()
  await waitBalance(view, DIAMOND_LABEL, "유료 재화 100")
  await click(view, "구매")
  await waitFor(() => assert.equal(posts(BULK_POST).length, 1))
  assert.equal(posts(GOLD_POST).length, 0)
  assert.equal(posts(ORDERS).length, 0)
})

// ── AC-05: 저장 왕복(실제 createPurchaseController + localStorage) ─────────────────
function makeController(idPrefix = "r") {
  const goldPosts = [], lookups = [], refreshes = [], legacyPosts = []
  const behavior = {
    postGold: async () => ({ balanceGold: 1, balanceDiamond: 2 }),
    lookup: async () => ({ balanceGold: 5, balanceDiamond: 6 }),
  }
  let serial = 0
  const controller = createPurchaseController({
    storage: () => dom.window.localStorage,
    post: async (payload) => { legacyPosts.push(payload); return {} },
    postGold: (payload) => { goldPosts.push(payload); return behavior.postGold(payload) },
    lookup: (id, kind) => { lookups.push([id, kind]); return behavior.lookup(id, kind) },
    refresh: (result) => { refreshes.push(result) },
    randomId: () => `${idPrefix}${++serial}`, // 실제 randomUUID는 컨트롤러마다 겹치지 않는다
  })
  controller.activate("A")
  return { controller, goldPosts, lookups, refreshes, legacyPosts, behavior }
}
const STORAGE_KEY = "joker:store-purchase:v1:A"

test("저장 왕복: pending·unknown GOLD 기록은 blocked 없이 unknown으로 복원되어 같은 referenceEventId로 조회한다", async () => {
  dom.window.localStorage.clear()
  const first = makeController()
  const inFlight = deferred()
  first.behavior.postGold = () => inFlight.promise
  const running = first.controller.purchaseGold({ productId: "gold-a", version: 3 })
  const saved = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY))
  assert.equal(saved.status, "pending")
  assert.equal(saved.kind, "GOLD")
  assert.deepEqual(saved.itemIds, [])

  const second = makeController()
  assert.equal(second.controller.store.getState().status, "unknown")
  assert.equal(second.controller.store.getState().kind, "GOLD")
  await second.controller.check()
  assert.deepEqual(second.lookups, [[saved.referenceEventId, "GOLD"]])
  assert.equal(second.goldPosts.length, 0)
  assert.equal(second.controller.store.getState().status, "confirmed")
  assert.deepEqual(second.refreshes, [{ balanceGold: 5, balanceDiamond: 6 }])
  inFlight.resolve({ balanceGold: 1, balanceDiamond: 2 })
  await running

  // 응답 유실로 unknown이 저장된 경우
  dom.window.localStorage.clear()
  const lost = makeController()
  lost.behavior.postGold = async () => { throw new Error("lost") }
  await lost.controller.purchaseGold({ productId: "gold-a", version: 3 })
  const reloaded = makeController()
  assert.equal(reloaded.controller.store.getState().status, "unknown")
  reloaded.behavior.lookup = async () => { throw Object.assign(new Error("none"), { status: 404, success: false, code: "PURCHASE_RESULT_NOT_FOUND" }) }
  await reloaded.controller.check()
  assert.equal(reloaded.goldPosts.length, 0, "check는 재전송하지 않는다")
  await reloaded.controller.purchaseGold({ productId: "other", version: 9 })
  assert.equal(reloaded.goldPosts.length, 0, "단순 호출은 원래 요청을 바꾸거나 재전송하지 않는다")
  await reloaded.controller.retry()
  assert.deepEqual(reloaded.goldPosts, [{ productId: "gold-a", version: 3, referenceEventId: JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)).referenceEventId }])
})

test("저장 왕복: priceChanged는 그대로 복원되어 재확인 전 어떤 호출도 POST를 만들지 않고, 수락 뒤 새 참조 ID를 발급한다", async () => {
  dom.window.localStorage.clear()
  const first = makeController()
  first.behavior.postGold = async () => { throw Object.assign(new Error("changed"), { ok: false, status: 409, code: "PRODUCT_VERSION_MISMATCH" }) }
  await first.controller.purchaseGold({ productId: "gold-a", version: 3 })
  assert.equal(first.controller.store.getState().status, "priceChanged")
  const oldReference = JSON.parse(dom.window.localStorage.getItem(STORAGE_KEY)).referenceEventId

  const next = makeController("n")
  assert.equal(next.controller.store.getState().status, "priceChanged")
  await next.controller.purchaseGold({ productId: "gold-a", version: 4 })
  await next.controller.retry()
  await next.controller.check()
  await next.controller.purchase(["skin"])
  next.controller.prepare()
  assert.equal(next.goldPosts.length, 0)
  assert.equal(next.legacyPosts.length, 0)
  assert.equal(next.controller.store.getState().status, "priceChanged")

  next.controller.acceptPriceChange()
  assert.equal(next.controller.store.getState().status, "idle")
  await next.controller.purchaseGold({ productId: "gold-a", version: 4 })
  assert.equal(next.goldPosts.length, 1)
  assert.equal(next.goldPosts[0].version, 4)
  assert.notEqual(next.goldPosts[0].referenceEventId, oldReference)
})

test("저장 왕복: kind 없는 기존 기록은 복구되고 잘못된 kind·상품·버전·참조 ID·status·JSON은 blocked이며 POST 0회이다", async () => {
  dom.window.localStorage.clear()
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ status: "unknown", referenceEventId: "shop:1", itemIds: ["a", "b"], error: null }))
  const legacy = makeController()
  assert.equal(legacy.controller.store.getState().status, "unknown")
  assert.deepEqual(legacy.controller.store.getState().itemIds, ["a", "b"])

  const good = { kind: "GOLD", status: "unknown", referenceEventId: "shop:1", itemIds: [], productId: "gold-a", version: 3 }
  const broken = [
    "not json",
    JSON.stringify({ ...good, kind: "SILVER" }),
    JSON.stringify({ ...good, productId: "" }),
    JSON.stringify({ ...good, productId: "x".repeat(65) }),
    JSON.stringify({ ...good, version: 0 }),
    JSON.stringify({ ...good, version: "3" }),
    JSON.stringify({ ...good, referenceEventId: "" }),
    JSON.stringify({ ...good, referenceEventId: "r".repeat(151) }),
    JSON.stringify({ ...good, status: "idle" }),
    JSON.stringify({ ...good, status: "weird" }),
    JSON.stringify({ ...good, itemIds: ["a"] }),
    JSON.stringify({ status: "priceChanged", referenceEventId: "shop:1", itemIds: ["a"] }),
    "null",
  ]
  for (const raw of broken) {
    dom.window.localStorage.setItem(STORAGE_KEY, raw)
    const c = makeController()
    assert.equal(c.controller.store.getState().status, "blocked", raw)
    await c.controller.purchaseGold({ productId: "gold-a", version: 3 })
    assert.equal(c.goldPosts.length, 0, raw)
  }
  dom.window.localStorage.setItem(STORAGE_KEY, JSON.stringify(good))
  assert.equal(makeController().controller.store.getState().status, "unknown")
})
