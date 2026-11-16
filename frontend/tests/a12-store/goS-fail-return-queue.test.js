// [버그 2] 지급 대기 주문이 있는 사람이 실패 주소로 상점을 열거나 결제창을 취소해도 실패·취소 안내가 진행 중 주문 안내에 안 덮이는지 보는 시험
// 목록 A12-상점-결제.md A12-F-170~176 (고치기 고S, 2026-11-16), 결제사는 가짜
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const ORDERS = "/economy/topup/orders"
const ORDER_ONE = /^\/economy\/topup\/orders\/[^/]+$/
const PENDING = "결제는 승인되었고 다이아 지급을 기다리고 있습니다."
const DONE = "충전이 완료되었습니다."
const CANCELED = "결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다."
const CARD = "카드사에서 결제를 거절했습니다. 카드 정보·한도를 확인해 주세요. 다이아는 충전되지 않았습니다."
const OTHER = "결제사에서 결제를 끝내지 못했습니다. 다이아는 충전되지 않았습니다."
const OPEN_ORDER = Object.freeze({ orderId: "order_open_0001", status: "PENDING_GRANT", amount: 1100, orderName: "다이아 100", createdAt: "2026-11-16T00:00:00.000Z" })
const FAIL_CARD = "?topup=fail&code=REJECT_CARD_COMPANY&orderId=order_a12_0002"
const screenText = () => kit.container().textContent

// 지급 대기 주문 하나가 서버에 있는 계정 (주문 조회 답은 시험마다 정함, 기본은 안 끝남)
function startWithOpenOrder() {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT], openOrders: [OPEN_ORDER] })
  s.on("GET", ORDER_ONE, () => kit.later().promise)
  return s
}
// "결과 확인" 단추 누름 (지급 대기 안내 칸 안 단추)
async function pressCheck() {
  const button = kit.buttonNamed("결과 확인")
  assert.ok(button, `결과 확인 단추 없음: ${screenText()}`)
  await kit.click(button)
}

// ── 실패 주소로 상점이 새로 열림 (복귀 확인이 찾기보다 먼저 돎) ──

test("A12-F-170 [버그 2] 지급 대기 주문 + 실패 주소(REJECT_CARD_COMPANY)로 새로 엶 → 카드 거절 안내와 지급 대기 안내가 둘 다 보임", async () => {
  startWithOpenOrder()
  await kit.renderStore({ search: FAIL_CARD })
  const all = screenText()
  assert.ok(all.includes(PENDING), all)
  assert.ok(all.includes(CARD), all)
})

test("A12-F-171 [버그 2] F-170 뒤 그 주문이 지급됨 → 완료 안내가 떠도 카드 거절 안내는 그대로 남음", async () => {
  const s = startWithOpenOrder()
  await kit.renderStore({ search: FAIL_CARD })
  s.on("GET", ORDER_ONE, kit.reply(200, { ok: true, orderId: OPEN_ORDER.orderId, status: "GRANTED", amount: 1100 }))
  await pressCheck()
  const all = screenText()
  assert.ok(all.includes(DONE), all)
  assert.ok(all.includes(CARD), all)
})

test("A12-F-172 [버그 2] 지급 대기 주문 + 표에 없는 코드(INVALID_CARD_NUMBER) 실패 주소 → 결제사 실패 글·코드 줄이 한 번씩, 지급 대기 안내도 보임", async () => {
  startWithOpenOrder()
  await kit.renderStore({ search: "?topup=fail&code=INVALID_CARD_NUMBER&orderId=order_a12_0002" })
  const all = screenText()
  assert.ok(all.includes(PENDING), all)
  assert.equal(kit.countText(OTHER), 1, all)
  assert.equal(kit.countText("결제사 실패 코드: INVALID_CARD_NUMBER"), 1, all)
})

test("A12-F-173 [버그 2] 지급 대기 주문 + 코드 없는 실패 주소(취소) → 취소 안내와 지급 대기 안내가 둘 다 보임", async () => {
  startWithOpenOrder()
  await kit.renderStore({ search: "?topup=fail&orderId=order_a12_0002" })
  const all = screenText()
  assert.ok(all.includes(PENDING), all)
  assert.ok(all.includes(CANCELED), all)
})

// ── 반대 순서: 지급 대기 주문이 보이는 중에 실패 주소로 돌아옴 (F-075 이어서) ──

test("A12-F-174 [버그 2] 지급 대기 주문이 보이는 중 실패 주소로 돌아옴 → 둘 다 보이고, 그 주문이 지급된 뒤에도 카드 거절 안내 남음", async () => {
  const s = startWithOpenOrder()
  await kit.renderStore()
  assert.ok(screenText().includes(PENDING), screenText())
  await kit.navigateStore(FAIL_CARD)
  assert.ok(screenText().includes(PENDING), screenText())
  assert.ok(screenText().includes(CARD), screenText())
  s.on("GET", ORDER_ONE, kit.reply(200, { ok: true, orderId: OPEN_ORDER.orderId, status: "GRANTED", amount: 1100 }))
  await pressCheck()
  assert.ok(screenText().includes(DONE), screenText())
  assert.ok(screenText().includes(CARD), screenText())
})

// ── 결제창을 닫는 사이 진행 중 주문 찾기가 끝남 (줄에서 꺼낼 때 같은 덮어쓰기) ──

test("A12-F-175 [버그 2] 결제창이 열린 사이 지급 대기 주문을 찾음 → 결제창 취소 뒤 취소 안내와 지급 대기 안내가 둘 다 보임", async () => {
  const found = kit.later()
  const paying = kit.later()
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT] })
  s.on("GET", ORDER_ONE, () => kit.later().promise)
  s.on("GET", ORDERS, () => found.promise)
  s.on("POST", ORDERS, kit.reply(201, { ok: true, orderId: "order_a12_0003", amount: 1100, orderName: "다이아 100", clientKey: kit.FAKE_CLIENT_KEY }))
  kit.installToss(() => paying.promise.then((error) => { throw error }))
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("다이아 100")
  await kit.pressBuy()
  // 결제창이 열린 사이 찾기 답이 옴 (바쁜 중이라 줄에만 들어감)
  found.give(kit.reply(200, { ok: true, orders: [OPEN_ORDER] }))
  await kit.flush()
  assert.ok(!screenText().includes(PENDING), screenText())
  paying.give(Object.assign(new Error("취소"), { code: "PAY_PROCESS_CANCELED" }))
  await kit.flush()
  const all = screenText()
  assert.ok(all.includes(PENDING), all)
  assert.ok(all.includes(CANCELED), all)
})

test("A12-F-176 [지금 동작] 줄에 기다리는 주문이 없으면 실패 안내는 안내 칸 하나에만 한 번 보임 (덧붙임 칸에 겹쳐 안 옮김)", async () => {
  kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT] })
  await kit.renderStore({ search: FAIL_CARD })
  assert.equal(kit.countText(CARD), 1, screenText())
  assert.equal(document.querySelector('[data-testid="topup-return-notes"]'), null)
})
