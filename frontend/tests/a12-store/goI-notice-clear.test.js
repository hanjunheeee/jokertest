// 상점 고치기 시험: 상품을 바꾸면 끝난 구매 안내가 지워짐·성공 번호여도 답 모양이 틀리면 결과 모름·PC 안내 글 줄마다 글자색 [받은 버그 2]
// 목록 A12-상점-결제.md A12-F-151~169, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a12-store/goI-notice-clear.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const BULK = "/economy/purchases/bulk"
const GOLD_POST = "/economy/gold-purchases"
const LOOKUP = /^\/economy\/purchases\/[^/]+$/
const REJECTED = "구매가 거부되었습니다. 재화는 차감되지 않았습니다."
const NEED_CHECK = "구매 결과 확인이 필요합니다."
const DONE_TEXT = "구매가 완료되었습니다."
const ALREADY = kit.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: "이미 보유한 상품입니다." })
const SERVER_500 = kit.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." })
// 서버가 실제로 주는 장부 한 줄 모양 (backend/controllers/economy/serializers.js serializeLedgerEntry)
const LEDGER = { id: 1, reason: "PURCHASE", itemId: "skin-a", currency: "GOLD", amount: -500, balanceAfter: 4500, referenceEventId: "shop:x::item::skin-a", createdAt: "2026-11-16T00:00:00.000Z" }

// 골드 넉넉한 계정이 스킨(처음 고른 상품) 앞에 섬, 구매 답은 answer
async function skinStore(answer, { gold = 5000 } = {}) {
  const s = kit.start({ gold })
  if (answer) s.on("POST", BULK, answer)
  await kit.renderStore()
  return s
}
const shownName = () => kit.detail().querySelector("h2").textContent

// ── 상품을 바꾸면 끝난 구매 안내를 지움 (C-032) ──

test("A12-F-151 [버그 2] 실패 뒤 다른 상품 고름 → 같은 계정으로 다시 그려도(새로고침) 앞 실패 글이 안 돌아옴", async () => {
  const s = await skinStore(ALREADY)
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(REJECTED), kit.belowText())
  await kit.pickItem("경비원-푸른서리")
  assert.equal(kit.belowText(), "")
  kit.rtl.cleanup()
  kit.signOut()
  kit.signIn(s.uuid)
  await kit.renderStore()
  assert.equal(kit.belowText(), "")
})

test("A12-F-152 구매 완료 글 뒤 다른 상품 고름 → 단추 아래 비어 있음", async () => {
  await skinStore(kit.reply(201, { idempotent: false, kind: "SINGLE", results: [LEDGER] }))
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(DONE_TEXT), kit.belowText())
  await kit.pickItem("경비원-푸른서리")
  assert.equal(shownName(), "경비원-푸른서리")
  assert.equal(kit.belowText(), "")
})

test("A12-F-153 골드 구매 거절(다이아 부족) 뒤 다른 재화 상품 고름 → 부족 글·충전하러 가기 단추가 안 남음", async () => {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  s.on("POST", GOLD_POST, kit.reply(400, { ok: false, code: "INSUFFICIENT_DIAMOND", message: "다이아 잔액이 부족합니다." }))
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("골드 500")
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("다이아가 부족합니다."), kit.belowText())
  await kit.pickItem("다이아 100")
  assert.equal(shownName(), "다이아 100")
  assert.ok(!kit.belowText().includes("다이아가 부족합니다."), kit.belowText())
  assert.ok(kit.buttonNamed("다이아 충전하러 가기", kit.belowButton()) === null)
})

test("A12-F-154 실패 뒤 분류를 바꿔 다른 상품이 골라짐 → 단추 아래에 앞 실패 글 없음", async () => {
  await skinStore(ALREADY)
  await kit.pressBuy()
  const before = shownName()
  assert.ok(kit.belowText().includes(REJECTED))
  await kit.pickCategory("프로필 테두리")
  assert.notEqual(shownName(), before)
  assert.ok(!kit.belowText().includes(REJECTED), kit.belowText())
  assert.ok(!kit.belowText().includes("이미 보유한 상품입니다."), kit.belowText())
})

test("A12-F-155 실패 뒤 같은 상품을 다시 누름 → 실패 글·다시 시도 그대로 (상품이 안 바뀌면 안 지움)", async () => {
  await skinStore(ALREADY)
  await kit.pressBuy()
  const name = shownName()
  await kit.pickItem(name)
  assert.equal(shownName(), name)
  assert.ok(kit.belowText().includes(REJECTED), kit.belowText())
  assert.ok(kit.buttonNamed("다시 시도", kit.belowButton()) !== null)
})

test("A12-F-156 결과 모름 뒤 분류를 바꿈 → \"구매 결과 확인이 필요합니다.\"·결과 확인 단추 그대로 (결과 모름은 안 지움)", async () => {
  await skinStore(SERVER_500)
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(NEED_CHECK))
  await kit.pickCategory("프로필 테두리")
  assert.ok(kit.belowText().includes(NEED_CHECK), kit.belowText())
  assert.ok(kit.buttonNamed("결과 확인", kit.belowButton()) !== null)
})

// ── 성공 번호(200·201)여도 답 모양이 약속과 다르면 완료가 아니라 결과 모름 (C-033, 돈 쪽) ──

const BROKEN_BULK = [
  ["A12-F-157", "장부 줄 목록(results) 없음", { idempotent: false, kind: "SINGLE" }],
  ["A12-F-158", "results가 배열 아님", { idempotent: false, kind: "SINGLE", results: "ok" }],
  ["A12-F-159", "처음 처리인지(idempotent) 없음", { kind: "SINGLE", results: [LEDGER] }],
  ["A12-F-160", "장부 줄이 빈 값(null)", { idempotent: false, kind: "SINGLE", results: [null] }],
]
for (const [id, label, body] of BROKEN_BULK) {
  test(`${id} 구매 답 201인데 ${label} → 완료 아님(결과 확인 필요), 단추 "보유중" 아님`, async () => {
    await skinStore(kit.reply(201, body))
    await kit.pressBuy()
    assert.ok(kit.belowText().includes(NEED_CHECK), kit.belowText())
    assert.ok(!kit.belowText().includes(DONE_TEXT), kit.belowText())
    assert.notEqual(kit.buyLabel(), "보유중")
  })
}

test("A12-F-161 결과 모름 → 결과 확인 답이 200인데 모양 틀림({}) → 완료 아님, 결과 모름 그대로, 구매 다시 안 보냄", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  s.on("GET", LOOKUP, kit.reply(200, {}))
  await kit.click(kit.buttonNamed("결과 확인", kit.belowButton()))
  assert.ok(s.callsOf("GET", LOOKUP).length >= 1)
  assert.ok(kit.belowText().includes(NEED_CHECK), kit.belowText())
  assert.ok(!kit.belowText().includes(DONE_TEXT), kit.belowText())
  assert.equal(s.callsOf("POST", BULK).length, 1)
})

test("A12-F-162 결과 모름 → \"결과 확인\" 누름 + 404(결과 없음) → 묻기만 함: 구매 다시 안 보냄, 결과 모름 그대로", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  s.on("GET", LOOKUP, kit.reply(404, { success: false, code: "PURCHASE_RESULT_NOT_FOUND", message: "해당 참조 사건 ID로 커밋된 구매 결과가 없습니다." }))
  await kit.click(kit.buttonNamed("결과 확인", kit.belowButton()))
  assert.ok(s.callsOf("GET", LOOKUP).length >= 1)
  assert.equal(s.callsOf("POST", BULK).length, 1)
  assert.ok(kit.belowText().includes(NEED_CHECK), kit.belowText())
})

test("A12-F-163 같은 번호를 서버가 이미 처리함(200 idempotent:true + 장부 줄) → 완료", async () => {
  await skinStore(kit.reply(200, { idempotent: true, kind: "SINGLE", results: [LEDGER] }))
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(DONE_TEXT), kit.belowText())
})

test("A12-F-164 결과 모름 → 결과 확인 답이 서버 모양 그대로({kind, results[장부 줄], createdAt}) → 완료", async () => {
  const s = await skinStore(SERVER_500)
  await kit.pressBuy()
  s.on("GET", LOOKUP, kit.reply(200, { kind: "SINGLE", results: [LEDGER], createdAt: "2026-11-16T00:00:00.000Z" }))
  await kit.click(kit.buttonNamed("결과 확인", kit.belowButton()))
  assert.ok(kit.belowText().includes(DONE_TEXT), kit.belowText())
})

// ── PC 구매 안내 글 줄마다 글자색 [받은 버그 2] ──
// 전역 CSS가 p에 검정 글자색을 줘서, 칸에만 글자색을 두면 어두운 칸 안 글이 검정으로 묻힘 (대비 1.2)
// jsdom은 색을 못 그려서 여기선 "글 줄(p)마다 칸 바탕색과 다른 글자색 클래스가 있나"만 봄, 진짜 대비는 브라우저 시험 몫

// 클래스 글자에서 색 값 꺼내기 → "text-[#f3dfb4] …" → "#f3dfb4"
const colorOf = (className, kind) => (String(className).match(new RegExp(`(?:^|\\s)${kind}-\\[(#[0-9a-fA-F]{6})\\]`)) ?? [])[1] ?? null
// 어두운 안내 칸(바탕색 클래스가 있는 칸) 안 글 줄마다 { 글, 글자색, 바탕색 }
function noticeLines(root = document.body) {
  const lines = []
  for (const p of root.querySelectorAll("p")) {
    const box = p.closest('[class*="bg-[#241a10]"]')
    if (!box || p.textContent.trim() === "") continue
    lines.push({ text: p.textContent.trim().slice(0, 20), color: colorOf(p.className, "text"), bg: colorOf(box.className, "bg") })
  }
  return lines
}
function assertLinesColored(lines, least) {
  assert.ok(lines.length >= least, `안내 글 줄이 ${lines.length}줄뿐 (${least}줄 이상이어야 함)`)
  const bare = lines.filter((line) => line.color === null || line.color.toLowerCase() === line.bg?.toLowerCase())
  assert.deepEqual(bare, [], "글자색이 없는(전역 검정에 묻히는) 글 줄")
}

test("A12-F-165 [버그 2] 서버 거절 안내 칸: \"구매가 거부되었습니다…\"·서버 글 줄마다 글자색 있음", async () => {
  await skinStore(ALREADY)
  await kit.pressBuy()
  assertLinesColored(noticeLines(kit.belowButton()), 2)
})

test("A12-F-166 [버그 2] 결과 모름 안내 칸: \"구매 결과 확인이 필요합니다.\"·서버 글 줄마다 글자색 있음", async () => {
  await skinStore(SERVER_500)
  await kit.pressBuy()
  assertLinesColored(noticeLines(kit.belowButton()), 2)
})

test("A12-F-167 [버그 2] 골드 구매 거절 안내 칸·거래 내역 칸: 글 줄마다 글자색 있음", async () => {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  s.on("POST", GOLD_POST, kit.reply(400, { ok: false, code: "INSUFFICIENT_DIAMOND", message: "다이아 잔액이 부족합니다." }))
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("골드 500")
  await kit.pressBuy()
  assertLinesColored(noticeLines(kit.belowButton()), 1)
  assertLinesColored(noticeLines(document.querySelector('[data-testid="currency-history"]').parentElement), 2)
})

test("A12-F-168 [버그 2] 결제 실패로 돌아온 안내 칸(카드 거절): 글 줄마다 글자색 있음", async () => {
  kit.start({ gold: 0, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  await kit.renderStore({ search: "?topup=fail&code=REJECT_CARD_COMPANY&orderId=order_a12_0001" })
  const box = document.querySelector('[data-testid="topup-feedback"]')
  assert.ok(box !== null, "충전 안내 칸이 없음")
  assertLinesColored(noticeLines(box.parentElement), 1)
})

test("A12-F-169 [버그 2] 결제 실패 덧붙임 글 칸(표에 없는 결제사 코드): 글 줄마다 글자색 있음", async () => {
  kit.start({ gold: 0, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  await kit.renderStore({ search: "?topup=fail&code=A12_UNKNOWN_CODE&orderId=order_a12_0001" })
  const notes = document.querySelector('[data-testid="topup-return-notes"]')
  assert.ok(notes !== null, "덧붙임 글 칸이 없음")
  assertLinesColored(noticeLines(notes.parentElement), 2)
})
