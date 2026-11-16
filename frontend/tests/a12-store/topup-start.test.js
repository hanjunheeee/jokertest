// 다이아 충전 시작 화면 시험: 주문 만들기 한 번·결제창엔 응답 값만·설정 대기·값 바뀜·상품 없음/중지·결제창 실패와 취소
// 목록 A12-상점-결제.md A12-F-055~066 (옛 설계 F-32 2-5a 충전 표), 결제창은 가짜(진짜 토스로 안 나감)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const ORDERS = "/economy/topup/orders"
const CONFIRM = /^\/economy\/topup\/orders\/[^/]+\/confirm$/
const ORDER = Object.freeze({ ok: true, orderId: "order_a12_0001", amount: 1100, orderName: "다이아 100", clientKey: kit.FAKE_CLIENT_KEY })
const fail = (status, code, message) => kit.reply(status, { ok: false, code, message })

// 재화 분류에서 "다이아 100"을 고른 화면 (주문 답·결제창 행동을 정함)
async function topupStore({ order = kit.reply(201, ORDER), behave } = {}) {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  s.on("POST", ORDERS, order)
  const toss = kit.installToss(behave)
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("다이아 100")
  assert.equal(kit.buyLabel(), "충전")
  return { s, toss }
}

test("A12-F-055 충전 누름 → 주문 요청 1번 {productId, version}", async () => {
  const { s } = await topupStore()
  await kit.pressBuy()
  const sent = s.callsOf("POST", ORDERS)
  assert.equal(sent.length, 1)
  assert.deepEqual(sent[0].body, { productId: "dia-100", version: 3 })
})

test("A12-F-056 주문 만드는 중 다시 누름 → 더 안 보냄", async () => {
  const held = kit.later()
  const { s } = await topupStore({ order: () => held.promise })
  const button = kit.buyButton()
  await kit.click(button)
  await kit.rtl.act(async () => { kit.rtl.fireEvent.click(button) })
  await kit.flush()
  assert.equal(s.callsOf("POST", ORDERS).length, 1)
  held.give(kit.reply(201, ORDER))
  await kit.flush()
  assert.equal(s.callsOf("POST", ORDERS).length, 1)
})

test("A12-F-057 결제창엔 주문 응답의 clientKey·orderId·amount 그대로", async () => {
  const { toss } = await topupStore()
  await kit.pressBuy()
  assert.equal(toss.opened.length, 1)
  assert.deepEqual(
    { clientKey: toss.opened[0].clientKey, orderId: toss.opened[0].orderId, amount: toss.opened[0].amount },
    { clientKey: ORDER.clientKey, orderId: ORDER.orderId, amount: ORDER.amount },
  )
})

const CONFIG_PENDING = "결제 설정이 아직 준비되지 않았습니다(설정 대기). 상품 목록을 새로고침한 뒤 다시 시도해 주세요."

test("A12-F-058 결제 설정 없음(503 CONFIG_MISSING) → 단추 \"설정 대기\" + 설정 대기 글, 결제창 0·확인 0, 다시 눌러도 요청 없음", async () => {
  const { s, toss } = await topupStore({ order: fail(503, "CONFIG_MISSING", "결제 설정이 올바르지 않습니다.") })
  await kit.pressBuy()
  assert.equal(kit.buyLabel(), "설정 대기")
  assert.ok(kit.belowText().includes(CONFIG_PENDING), kit.belowText())
  await kit.pressBuy()
  assert.equal(s.callsOf("POST", ORDERS).length, 1)
  assert.equal(toss.opened.length, 0)
  assert.equal(s.callsOf("POST", CONFIRM).length, 0)
})

test("A12-F-059 설정 대기 → 상품 목록 새로고침 → 충전 단추 다시 켜짐", async () => {
  await topupStore({ order: fail(503, "CONFIG_MISSING", "결제 설정이 올바르지 않습니다.") })
  await kit.pressBuy()
  assert.equal(kit.buyButton().disabled, true)
  await kit.click(kit.buttonNamed("상품 목록 새로고침"))
  assert.deepEqual({ label: kit.buyLabel(), disabled: kit.buyButton().disabled }, { label: "충전", disabled: false })
})

test("A12-F-060 충전 상품 값이 바뀐 사이(409 버전) → 새 가격 보이고 다시 확인받음 (자동 주문 없음)", async () => {
  const { s } = await topupStore({
    order: kit.reply(409, { ok: false, code: "PRODUCT_VERSION_MISMATCH", message: "상품 정보가 변경되었습니다.", product: { ...kit.DIA_PRODUCT, payAmount: 1200, version: 4 } }),
  })
  s.products = [{ ...kit.DIA_PRODUCT, payAmount: 1200, version: 4 }, kit.GOLD_PRODUCT]
  await kit.pressBuy()
  await kit.flush()
  assert.equal(kit.detail().querySelector('[data-testid="currency-pay"]').textContent, "1,200 원")
  assert.ok(kit.belowText().includes("상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 시도해 주세요."), kit.belowText())
  assert.equal(s.callsOf("POST", ORDERS).length, 1)
})

const GONE = [
  ["A12-F-061", "상품 없음(404)", fail(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다."), "상품을 찾을 수 없습니다. 목록을 확인해 주세요."],
  ["A12-F-062", "판매 중지(409 PRODUCT_STOPPED)", fail(409, "PRODUCT_STOPPED", "판매가 중지된 상품입니다."), "판매가 중지된 상품입니다. 목록을 확인해 주세요."],
]
for (const [id, label, order, text] of GONE) {
  test(`${id} ${label} → 이유 글 + 상품 목록 다시 받음`, async () => {
    const { s } = await topupStore({ order })
    const listBefore = s.callsOf("GET", "/economy/currency-products").length
    await kit.pressBuy()
    assert.ok(kit.belowText().includes(text), kit.belowText())
    assert.ok(s.callsOf("GET", "/economy/currency-products").length > listBefore)
  })
}

test("A12-F-063 주문 만들기 다른 실패(500) → \"주문을 만들지 못했습니다. 다시 시도해 주세요.\"", async () => {
  await topupStore({ order: fail(500, "SERVER_ERROR", "서버 내부에서 에러가 발생했습니다.") })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("주문을 만들지 못했습니다. 다시 시도해 주세요."), kit.belowText())
})

test("A12-F-064 결제창 꾸러미 못 받음 → \"결제창을 불러오지 못했습니다. 다시 시도해 주세요.\"", async () => {
  await topupStore()
  const restore = kit.breakTossSdk()
  try {
    await kit.pressBuy()
    await kit.flush()
  } finally {
    restore()
  }
  assert.ok(kit.belowText().includes("결제창을 불러오지 못했습니다. 다시 시도해 주세요."), kit.belowText())
})

test("A12-F-065 결제창 열기 실패 → \"결제창을 열지 못했습니다. 다시 시도해 주세요.\"", async () => {
  await topupStore({ behave: () => Promise.reject(Object.assign(new Error("창 열기 실패"), { code: "INVALID_REQUEST" })) })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("결제창을 열지 못했습니다. 다시 시도해 주세요."), kit.belowText())
})

test("A12-F-066 결제창 닫음·취소 → 취소 글(다이아 충전 안 됨), 확인 요청 0", async () => {
  const { s } = await topupStore({ behave: () => Promise.reject(Object.assign(new Error("취소"), { code: "USER_CANCEL" })) })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다."), kit.belowText())
  assert.equal(s.callsOf("POST", CONFIRM).length, 0)
})
