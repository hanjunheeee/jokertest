// 열린 충전 주문 찾기 시험: 다른 브라우저에서 마무리·복귀 주문은 건너뜀·찾기 실패는 조용히·계정 바뀌면 버림·최신부터 하나씩·확인 안 보냄
// 목록 A12-상점-결제.md A12-F-101~106 (옛 설계 F-32 2-6a), 자동 조회 2초는 가짜 시계로
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const CONFIRM = /^\/economy\/topup\/orders\/[^/]+\/confirm$/
const ORDER_ONE = /^\/economy\/topup\/orders\/[^/]+$/
const PENDING = "결제는 승인되었고 다이아 지급을 기다리고 있습니다."
const DONE = "충전이 완료되었습니다."

// 서버가 주는 열린 주문 하나 (최신순으로 줌)
const openOrder = (orderId, createdAt) => ({ orderId, status: "PENDING_GRANT", amount: 1100, orderName: "다이아 100", createdAt })
// 주문 하나 조회 답
const orderBody = (orderId, status) => kit.reply(200, {
  ok: true, orderId, status, amount: 1100, orderName: "다이아 100", productId: "dia-100", version: 3,
  grantAmount: 100, bonusAmount: 10, ...(status === "GRANTED" ? { balanceDiamond: 110 } : {}), createdAt: "2026-11-16T00:00:00.000Z",
})
// 조회한 주문 id 차례
const lookedUp = (s) => s.callsOf("GET", ORDER_ONE).map((c) => decodeURIComponent(c.path.split("/").pop()))
const discoveries = (s) => s.callsOf("GET", "/economy/topup/orders").filter((c) => c.query.includes("state=open")).length
const screenText = () => kit.container().textContent
const tick = async (t, ms) => {
  await kit.rtl.act(async () => { t.mock.timers.tick(ms) })
  await kit.flush()
}

test("A12-F-101 복귀 주소 없이 상점 그림 → 찾기 1번 → PENDING_GRANT 주문 조회 → GRANTED → 잔액 다시 받음", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const s = kit.start({ products: [kit.DIA_PRODUCT], openOrders: [openOrder("order_open_0001", "2026-11-16T01:00:00.000Z")] })
  s.on("GET", ORDER_ONE, ({ path }) => orderBody(decodeURIComponent(path.split("/").pop()), "GRANTED"))
  await kit.renderStore()
  assert.equal(discoveries(s), 1)
  assert.ok(screenText().includes(PENDING), screenText())
  const walletBefore = s.callsOf("GET", /\/wallet$/).length
  await tick(t, 2000)
  assert.deepEqual(lookedUp(s), ["order_open_0001"])
  assert.ok(screenText().includes(DONE), screenText())
  assert.ok(s.callsOf("GET", /\/wallet$/).length > walletBefore)
  assert.equal(discoveries(s), 1)
})

test("A12-F-102 복귀 주문 id = 찾은 주문 id → 그 주문은 조회 안 함", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const s = kit.start({ products: [kit.DIA_PRODUCT], openOrders: [openOrder("order_a12_0001", "2026-11-16T01:00:00.000Z")] })
  s.on("POST", CONFIRM, kit.reply(200, { ok: true, status: "GRANTED", balanceDiamond: 110 }))
  s.on("GET", ORDER_ONE, ({ path }) => orderBody(decodeURIComponent(path.split("/").pop()), "PENDING_GRANT"))
  await kit.renderStore({ search: "?topup=success&paymentKey=pk_ok_a12fakekey&orderId=order_a12_0001&amount=1100" })
  assert.equal(discoveries(s), 1)
  assert.equal(s.callsOf("POST", CONFIRM).length, 1)
  await tick(t, 2000)
  await tick(t, 2000)
  assert.deepEqual(lookedUp(s), [])
})

test("A12-F-103 찾기 500 → 상점 그대로 씀, 오류 글 없음", async () => {
  const s = kit.start({ gold: 1000 })
  s.on("GET", "/economy/topup/orders", kit.reply(500, { ok: false, code: "SERVER_ERROR", message: "서버 내부에서 에러가 발생했습니다." }))
  await kit.renderStore()
  assert.equal(discoveries(s), 1)
  assert.equal(document.querySelector('[data-testid="topup-feedback"]'), null)
  assert.doesNotMatch(screenText(), /서버 내부에서 에러|실패|오류/)
  assert.equal(kit.buyButton().disabled, false)
})

test("A12-F-104 A의 찾은 주문 → B 로그인 → B 화면에 A 주문 안 보임", async () => {
  const s = kit.start({ products: [kit.DIA_PRODUCT], openOrders: [openOrder("order_open_aaaa", "2026-11-16T01:00:00.000Z")] })
  s.on("GET", ORDER_ONE, () => kit.later().promise)
  await kit.renderStore()
  assert.ok(screenText().includes(PENDING))
  kit.rtl.cleanup()
  kit.signOut()
  s.openOrders = []
  kit.signIn(kit.nextUuid("a12-b"))
  await kit.renderStore()
  assert.equal(document.querySelector('[data-testid="topup-feedback"]'), null)
  assert.ok(!screenText().includes(PENDING))
})

test("A12-F-105 찾은 주문 둘 → 최신 주문 먼저 조회, 끝나면 다음 주문", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const s = kit.start({
    products: [kit.DIA_PRODUCT],
    openOrders: [openOrder("order_new_0002", "2026-11-16T02:00:00.000Z"), openOrder("order_old_0001", "2026-11-16T01:00:00.000Z")],
  })
  s.on("GET", ORDER_ONE, ({ path }) => orderBody(decodeURIComponent(path.split("/").pop()), "GRANTED"))
  await kit.renderStore()
  await tick(t, 2000)
  assert.deepEqual(lookedUp(s), ["order_new_0002"])
  await tick(t, 2000)
  assert.deepEqual(lookedUp(s), ["order_new_0002", "order_old_0001"])
})

test("A12-F-106 찾은 주문엔 결제 확인 안 보냄 (조회만)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const s = kit.start({ products: [kit.DIA_PRODUCT], openOrders: [openOrder("order_open_0001", "2026-11-16T01:00:00.000Z")] })
  s.on("GET", ORDER_ONE, ({ path }) => orderBody(decodeURIComponent(path.split("/").pop()), "PENDING_GRANT"))
  await kit.renderStore()
  await tick(t, 2000)
  await tick(t, 2000)
  assert.ok(lookedUp(s).length >= 1)
  assert.equal(s.callsOf("POST", CONFIRM).length, 0)
})
