// 결제 확인 결과 화면 시험: 지급 끝·지급 대기와 2초 간격 자동 조회 5번·확인 실패 까닭마다·조회로 끝난 실패·끊김·조회 실패·503 진행 중
// 목록 A12-상점-결제.md A12-F-084~100 (옛 설계 F-32 2-5a·2-6a), 시간은 가짜 시계로 경계만
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const CONFIRM = /^\/economy\/topup\/orders\/[^/]+\/confirm$/
const ORDER_ONE = /^\/economy\/topup\/orders\/[^/]+$/
const SUCCESS = "?topup=success&paymentKey=pk_ok_a12fakekey&orderId=order_a12_0001&amount=1100"
const DONE = "충전이 완료되었습니다."
const PENDING = "결제는 승인되었고 다이아 지급을 기다리고 있습니다."
const AUTO_DONE = "자동 확인을 마쳤습니다. 결과 확인을 눌러 다시 확인해 주세요."
const fail = (status, code, message) => kit.reply(status, { ok: false, code, message })
// 주문 하나 조회 답 (백엔드 serializeTopupOrder 모양)
const orderBody = (status) => kit.reply(200, {
  ok: true, orderId: "order_a12_0001", status, amount: 1100, orderName: "다이아 100", productId: "dia-100", version: 3,
  grantAmount: 100, bonusAmount: 10, ...(status === "GRANTED" ? { balanceDiamond: 110 } : {}), createdAt: "2026-11-16T00:00:00.000Z",
})

// 성공 주소로 돌아옴 (확인 답·조회 답을 정함)
async function back({ confirm, lookup }) {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT] })
  s.on("POST", CONFIRM, confirm)
  if (lookup) s.on("GET", ORDER_ONE, lookup)
  await kit.renderStore({ search: SUCCESS })
  return s
}
const screenText = () => kit.container().textContent
const lookups = (s) => s.callsOf("GET", ORDER_ONE).length

test("A12-F-084 확인 GRANTED → \"충전이 완료되었습니다.\" + 잔액 다시 받음", async () => {
  const s = await back({ confirm: kit.reply(200, { ok: true, status: "GRANTED", balanceDiamond: 110 }) })
  assert.ok(screenText().includes(DONE), screenText())
  const confirmAt = s.calls.findIndex((c) => c.method === "POST" && CONFIRM.test(c.path))
  const walletAfter = s.calls.slice(confirmAt + 1).filter((c) => /\/wallet$/.test(c.path)).length
  assert.ok(walletAfter >= 1)
})

// 지급 대기로 돌아온 뒤 가짜 시계로 자동 조회 경계를 봄
async function pendingWithClock(t, lookup) {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const s = await back({ confirm: kit.reply(200, { ok: true, status: "PENDING_GRANT" }), lookup })
  return s
}
const tick = async (t, ms) => {
  await kit.rtl.act(async () => { t.mock.timers.tick(ms) })
  await kit.flush()
}

test("A12-F-085 PENDING_GRANT → 지급 대기 글 + 2초 간격 조회 (1999ms엔 아직, 2000ms에 1번)", async (t) => {
  const s = await pendingWithClock(t, orderBody("PENDING_GRANT"))
  assert.ok(screenText().includes(PENDING), screenText())
  assert.equal(lookups(s), 0)
  await tick(t, 1999)
  assert.equal(lookups(s), 0)
  await tick(t, 1)
  assert.equal(lookups(s), 1)
  await tick(t, 1999)
  assert.equal(lookups(s), 1)
  await tick(t, 1)
  assert.equal(lookups(s), 2)
})

test("A12-F-086 자동 조회 5번째에 GRANTED → 완료", async (t) => {
  const s = await pendingWithClock(t, ({ n }) => orderBody(n >= 5 ? "GRANTED" : "PENDING_GRANT"))
  for (let i = 1; i <= 4; i += 1) await tick(t, 2000)
  assert.equal(lookups(s), 4)
  assert.ok(!screenText().includes(DONE))
  await tick(t, 2000)
  assert.equal(lookups(s), 5)
  assert.ok(screenText().includes(DONE), screenText())
})

test("A12-F-087 자동 조회 5번 다 지급 대기 → \"자동 확인을 마쳤습니다…\" + 결과 확인 단추", async (t) => {
  const s = await pendingWithClock(t, orderBody("PENDING_GRANT"))
  for (let i = 1; i <= 5; i += 1) await tick(t, 2000)
  assert.equal(lookups(s), 5)
  assert.ok(screenText().includes(AUTO_DONE), screenText())
  const feedback = document.querySelector('[data-testid="topup-feedback"]')
  assert.ok(feedback !== null && kit.buttonNamed("결과 확인", feedback) !== null)
})

test("A12-F-088 자동 조회 6번째는 없음 (5번 뒤 시간이 더 가도 그대로)", async (t) => {
  const s = await pendingWithClock(t, orderBody("PENDING_GRANT"))
  for (let i = 1; i <= 5; i += 1) await tick(t, 2000)
  assert.equal(lookups(s), 5)
  await tick(t, 2000)
  await tick(t, 2000)
  assert.equal(lookups(s), 5)
})

const CONFIRM_FAILS = [
  ["A12-F-089", fail(400, "AMOUNT_MISMATCH", "결제 금액이 주문과 다릅니다."), "결제 금액이 주문과 달라 충전하지 않았습니다."],
  ["A12-F-090", fail(403, "NOT_OWNER", "다른 계정의 주문에는 접근할 수 없습니다."), "다른 계정의 주문이라 충전하지 않았습니다."],
  ["A12-F-091", fail(402, "PAYMENT_FAILED", "결제가 완료되지 않았습니다."), "결제가 완료되지 않아 충전하지 않았습니다."],
  ["A12-F-092", fail(503, "CONFIG_MISSING", "결제 설정이 올바르지 않습니다."), "결제 설정이 아직 준비되지 않아 충전하지 않았습니다."],
  ["A12-F-093", fail(409, "PAYMENT_KEY_CONFLICT", "이 결제키는 다른 주문에서 사용 중입니다."), "결제 정보가 주문과 맞지 않아 충전하지 않았습니다."],
  ["A12-F-094", fail(409, "ORDER_REFUNDED", "환불된 주문입니다."), "환불된 주문입니다. 이 주문의 다이아는 지급되지 않거나 회수되었습니다."],
]
for (const [id, confirm, text] of CONFIRM_FAILS) {
  test(`${id} 확인 실패 ${confirm.body.code} → "${text}"`, async () => {
    await back({ confirm })
    assert.ok(screenText().includes(text), screenText())
    assert.ok(!screenText().includes(DONE))
  })
}

const LOOKUP_ENDS = [
  ["A12-F-095", "FAILED", "결제가 실패해 다이아가 지급되지 않았습니다."],
  ["A12-F-096", "CANCELED", "결제가 취소되어 다이아가 지급되지 않았습니다."],
  ["A12-F-097", "EXPIRED", "결제 시간이 만료되어 다이아가 지급되지 않았습니다."],
]
for (const [id, status, text] of LOOKUP_ENDS) {
  test(`${id} 지급 대기 뒤 조회 ${status} → "${text}"`, async () => {
    await back({ confirm: kit.reply(200, { ok: true, status: "PENDING_GRANT" }), lookup: orderBody(status) })
    const feedback = document.querySelector('[data-testid="topup-feedback"]')
    await kit.click(kit.buttonNamed("결과 확인", feedback))
    assert.ok(screenText().includes(text), screenText())
  })
}

test("A12-F-098 확인 중 끊김 → \"결제 결과 확인이 필요합니다. 확인 전까지 다이아는 지급된 것으로 보지 않습니다.\", 잔액 안 늘림", async () => {
  await back({ confirm: kit.offline("Failed to fetch") })
  assert.ok(screenText().includes("결제 결과 확인이 필요합니다. 확인 전까지 다이아는 지급된 것으로 보지 않습니다."), screenText())
  assert.equal(kit.useEconomyStore.getState().balanceDiamond, 0)
  assert.ok(!screenText().includes(DONE))
})

test("A12-F-099 지급 대기 중 조회 오류 → \"주문 조회에 실패했습니다.\" 덧붙음", async () => {
  await back({ confirm: kit.reply(200, { ok: true, status: "PENDING_GRANT" }), lookup: fail(500, "SERVER_ERROR", "서버 내부에서 에러가 발생했습니다.") })
  const feedback = document.querySelector('[data-testid="topup-feedback"]')
  await kit.click(kit.buttonNamed("결과 확인", feedback))
  const after = document.querySelector('[data-testid="topup-feedback"]').textContent
  assert.ok(after.includes(PENDING), after)
  assert.ok(after.includes("주문 조회에 실패했습니다."), after)
})

test("A12-F-100 [지금 동작] 확인 503 PAYMENT_PROCESSING → 실패 아님, 조회로 이어 감", async () => {
  const s = await back({ confirm: fail(503, "PAYMENT_PROCESSING", "결제 확인이 진행 중입니다. 잠시 후 다시 조회하세요."), lookup: orderBody("GRANTED") })
  assert.ok(!/충전하지 않았습니다|충전에 실패했습니다|지급되지 않았습니다/.test(screenText()), screenText())
  const feedback = document.querySelector('[data-testid="topup-feedback"]')
  assert.ok(feedback !== null)
  await kit.click(kit.buttonNamed("결과 확인", feedback))
  assert.ok(lookups(s) >= 1)
  assert.ok(screenText().includes(DONE), screenText())
})
