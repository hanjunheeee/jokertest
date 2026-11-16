// 결제창에서 돌아온 주소 처리 시험: 토스 실패 까닭 보이기·결제사 글 안 씀·실패 복귀엔 확인 안 보냄·성공 주소 모양 검사·같은 주소 두 번
// 목록 A12-상점-결제.md A12-F-067~083 (받은 버그 2: 토스 실패 까닭, 다른 주문 확인 중 실패 주소), 결제사는 가짜
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const CONFIRM = /^\/economy\/topup\/orders\/[^/]+\/confirm$/
const ORDER_ONE = /^\/economy\/topup\/orders\/[^/]+$/
const CANCELED = "결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다."
const ABORTED = "결제 진행 중 문제가 생겨 결제가 끝나지 않았습니다. 다이아는 충전되지 않았습니다."
const CARD = "카드사에서 결제를 거절했습니다. 카드 정보·한도를 확인해 주세요. 다이아는 충전되지 않았습니다."
const OTHER = "결제사에서 결제를 끝내지 못했습니다. 다이아는 충전되지 않았습니다."
const INVALID = "결제 복귀 정보가 올바르지 않아 확인하지 않았습니다."
const CODE_NOTE = "결제사 실패 코드"

// 결제창에서 돌아온 주소로 상점을 엶 (확인 답은 지급 끝)
async function returnTo(search) {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT] })
  s.on("POST", CONFIRM, kit.reply(200, { ok: true, status: "GRANTED", balanceDiamond: 110 }))
  await kit.renderStore({ search })
  return s
}
const screenText = () => kit.container().textContent

// ── A12-F-067~072: 토스 실패 까닭 ──

const FAIL_CODES = [
  ["A12-F-067", "PAY_PROCESS_CANCELED", "&code=PAY_PROCESS_CANCELED", CANCELED, false],
  ["A12-F-068", "PAY_PROCESS_ABORTED", "&code=PAY_PROCESS_ABORTED", ABORTED, false],
  ["A12-F-069", "REJECT_CARD_COMPANY", "&code=REJECT_CARD_COMPANY", CARD, false],
  ["A12-F-070", "표에 없는 코드 INVALID_CARD_NUMBER", "&code=INVALID_CARD_NUMBER", OTHER, true],
  ["A12-F-071", "code 없음", "", CANCELED, false],
]
for (const [id, label, codePart, text, withNote] of FAIL_CODES) {
  test(`${id} [버그 2] 실패 주소 ${label} → 그 까닭 글${withNote ? ' + "결제사 실패 코드: INVALID_CARD_NUMBER"' : ""}`, async () => {
    await returnTo(`?topup=fail${codePart}&orderId=order_a12_0001`)
    const all = screenText()
    assert.ok(all.includes(text), all)
    if (withNote) assert.ok(all.includes("결제사 실패 코드: INVALID_CARD_NUMBER"), all)
    else assert.ok(!all.includes(CODE_NOTE), all)
  })
}

test("A12-F-072 [버그 2] 실패 주소 code 모양 틀림(소문자·꺾쇠) → 코드 안 붙임", async () => {
  await returnTo(`?topup=fail&code=${encodeURIComponent("bad<code>")}&orderId=order_a12_0001`)
  const all = screenText()
  assert.ok(!all.includes(CODE_NOTE), all)
  assert.ok(!all.includes("bad<code>"), all)
  assert.ok(!all.includes("bad"), all)
})

test("A12-F-073 [지금 동작] 주소의 결제사 글(message=가짜 안내) → 화면에 그 글 없음", async () => {
  await returnTo(`?topup=fail&code=REJECT_CARD_COMPANY&message=${encodeURIComponent("가짜 안내")}&orderId=order_a12_0001`)
  const all = screenText()
  assert.ok(all.includes(CARD), all)
  assert.ok(!all.includes("가짜 안내"), all)
})

test("A12-F-074 실패 주소로 돌아옴 → 결제 확인 요청 0", async () => {
  const s = await returnTo("?topup=fail&code=REJECT_CARD_COMPANY&orderId=order_a12_0001")
  assert.equal(s.callsOf("POST", CONFIRM).length, 0)
})

test("A12-F-075 [버그 2] 열린 주문 확인이 도는 중에 ?topup=fail&code=REJECT_CARD_COMPANY → 카드 거절 안내가 보임", async () => {
  const s = kit.start({
    gold: 0, diamond: 0, products: [kit.DIA_PRODUCT],
    openOrders: [{ orderId: "order_open_0001", status: "PENDING_GRANT", amount: 1100, orderName: "다이아 100", createdAt: "2026-11-16T00:00:00.000Z" }],
  })
  s.on("GET", ORDER_ONE, () => kit.later().promise)
  await kit.renderStore()
  // 열린 주문이 화면에 떠 있음 (지급 대기)
  assert.ok(screenText().includes("결제는 승인되었고 다이아 지급을 기다리고 있습니다."), screenText())
  await kit.navigateStore("?topup=fail&code=REJECT_CARD_COMPANY&orderId=order_a12_0002")
  assert.ok(screenText().includes(CARD), screenText())
})

// ── A12-F-076~081: 성공 주소 모양 ──

const GOOD = { paymentKey: "pk_ok_a12fakekey", orderId: "order_a12_0001", amount: "1100" }
const successSearch = (over) => {
  const params = new URLSearchParams({ topup: "success", ...GOOD, ...over })
  for (const [key, value] of Object.entries(over)) if (value === null) params.delete(key)
  return `?${params.toString()}`
}

test("A12-F-076 성공 주소 다 맞음 → 결제 확인 1번 {paymentKey, amount}", async () => {
  const s = await returnTo(successSearch({}))
  const sent = s.callsOf("POST", CONFIRM)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].path, "/economy/topup/orders/order_a12_0001/confirm")
  assert.deepEqual(sent[0].body, { paymentKey: GOOD.paymentKey, amount: 1100 })
  assert.ok(!screenText().includes(INVALID))
})

const BAD_SUCCESS = [
  ["A12-F-077", "paymentKey 없음", { paymentKey: null }],
  ["A12-F-078", "amount 0", { amount: "0" }],
  ["A12-F-079", "amount \"01100\"", { amount: "01100" }],
  ["A12-F-080", "amount 1.5", { amount: "1.5" }],
  ["A12-F-081", "orderId 모양 틀림", { orderId: "bad id!" }],
]
for (const [id, label, over] of BAD_SUCCESS) {
  test(`${id} 성공 주소 ${label} → "결제 복귀 정보가 올바르지 않아 확인하지 않았습니다.", 확인 0`, async () => {
    const s = await returnTo(successSearch(over))
    assert.ok(screenText().includes(INVALID), screenText())
    assert.equal(s.callsOf("POST", CONFIRM).length, 0)
  })
}

test("A12-F-082 같은 성공 주소를 두 번 그림(새로고침) → 같은 주문 확인이 동시에 둘 안 감", async () => {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT] })
  const held = kit.later()
  s.on("POST", CONFIRM, () => held.promise)
  await kit.renderStore({ search: successSearch({}) })
  kit.rtl.cleanup()
  await kit.renderStore({ search: successSearch({}) })
  assert.equal(s.callsOf("POST", CONFIRM).length, 1)
  held.give(kit.reply(200, { ok: true, status: "GRANTED", balanceDiamond: 110 }))
  await kit.flush()
  assert.equal(s.callsOf("POST", CONFIRM).length, 1)
})

test("A12-F-083 결제 복귀 아님(topup 칸 없음) → 충전 안내 없음, 확인 0", async () => {
  const s = await returnTo("?orderId=order_a12_0001&code=REJECT_CARD_COMPANY")
  assert.equal(document.querySelector('[data-testid="topup-feedback"]'), null)
  assert.equal(document.querySelector('[data-testid="topup-return-notes"]'), null)
  assert.ok(!screenText().includes("다이아는 충전되지 않았습니다"))
  assert.equal(s.callsOf("POST", CONFIRM).length, 0)
})
