// 거래 내역·잔액 칸 시험: 사유 이름 14가지·판 보상 줄·금액 글·틀린 시각·지갑 못 받음 다시 받기
// 목록 A12-상점-결제.md A12-F-107~127 (판 보상 줄은 결정 "판 끝 — 재화 보상")
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")
const { formatHistoryTime } = await import("../../src/domains/store/utils/currencyView.js")

test.afterEach(() => kit.reset())

let txSeq = 0
// 서버 내역 한 줄 (백엔드 serializeLedgerEntry 모양)
const tx = (over) => ({
  id: ++txSeq, reason: "PURCHASE", itemId: null, currency: "GOLD", amount: -10, balanceAfter: 90,
  referenceEventId: `a12-ref-${txSeq}`, createdAt: "2026-11-16T03:00:00.000Z", ...over,
})

// 재화 분류를 열어 내역 줄들을 글자로 꺼냄
async function historyRows(transactions) {
  kit.start({ gold: 100, diamond: 10, products: [kit.DIA_PRODUCT], transactions })
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  return [...document.querySelectorAll('[data-testid="currency-transaction"]')].map((row) => ({
    text: row.textContent,
    amount: row.querySelector('[data-testid="transaction-amount"]').textContent,
  }))
}

// ── A12-F-107~120: 사유 이름 ──

const REASONS = [
  ["A12-F-107", "DIAMOND_TOPUP", "다이아 충전"],
  ["A12-F-108", "GOLD_PURCHASE", "골드 구매"],
  ["A12-F-109", "PURCHASE", "상점 구매"],
  ["A12-F-110", "DEFAULT_GRANT", "기본 지급"],
  ["A12-F-111", "ACHIEVEMENT_REWARD", "업적 보상"],
  ["A12-F-112", "COUPON_REWARD", "쿠폰 보상"],
  ["A12-F-113", "REWARD", "보상"],
  ["A12-F-114", "QA_TEST_GRANT_GOLD", "시험 지급"],
  ["A12-F-115", "QA_TEST_GRANT_DIAMOND", "시험 지급"],
  ["A12-F-116", "EVENT_COMPENSATION_GOLD", "이벤트 보상"],
  ["A12-F-117", "ADMIN_GRANT", "운영팀 지급"],
  ["A12-F-118", "ADMIN_REVOKE", "운영팀 회수"],
  ["A12-F-119", "TOPUP_REFUND", "충전 환불"],
  ["A12-F-120", "SOME_NEW_REASON", "기타"],
]
for (const [id, reason, label] of REASONS) {
  test(`${id} 내역 사유 ${reason} → "${label}"`, async () => {
    const rows = await historyRows([tx({ reason })])
    assert.equal(rows.length, 1)
    assert.ok(rows[0].text.includes(label), rows[0].text)
    assert.ok(!rows[0].text.includes(reason), rows[0].text)
  })
}

test("A12-F-121 판 보상 줄: 내역 응답에 GAME_REWARD +1 골드 → 한 줄에 \"판 보상\"·\"+1\"·\"골드\"", async () => {
  const rows = await historyRows([tx({ reason: "GAME_REWARD", currency: "GOLD", amount: 1, balanceAfter: 101 })])
  assert.equal(rows.length, 1)
  assert.ok(rows[0].text.includes("판 보상"), rows[0].text)
  assert.equal(rows[0].amount, "+1")
  assert.ok(rows[0].text.includes("골드"), rows[0].text)
})

// ── A12-F-122~124: 금액 글 ──

for (const [id, amount, shown] of [["A12-F-122", 1100, "+1,100"], ["A12-F-123", -10, "-10"], ["A12-F-124", 0, "0"]]) {
  test(`${id} 금액 ${amount} → "${shown}"`, async () => {
    const rows = await historyRows([tx({ amount, balanceAfter: 2000 })])
    assert.equal(rows[0].amount, shown)
  })
}

test("A12-F-125 [지금 동작] 시각 칸이 틀린 값 \"x\" → 그대로 보임 (안 깨짐)", () => {
  assert.equal(formatHistoryTime("x"), "x")
})

// ── A12-F-126~127: 지갑 못 받음 → 다시 받기 ──

test("A12-F-126 지갑 못 받음 → 위 잔액 칸에 다시 받기(재시도) 단추", async () => {
  const s = kit.start({ gold: 1000 })
  s.on("GET", /\/wallet$/, kit.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." }))
  await kit.renderStorePage()
  const balance = document.querySelector('[aria-label="보유 재화"]')
  assert.ok(balance !== null)
  assert.ok(kit.buttonNamed("재시도", balance) !== null)
})

test("A12-F-127 재시도 누름 → 지갑 다시 요청 → 됨 → 구매 단추 켜짐", async () => {
  const s = kit.start({ gold: 1000 })
  s.on("GET", /\/wallet$/, ({ n }) => (n === 1
    ? kit.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." })
    : kit.reply(200, { balanceGold: 1000, balanceDiamond: 0 })))
  await kit.renderStorePage()
  assert.equal(kit.buyButton().disabled, true)
  const before = s.callsOf("GET", /\/wallet$/).length
  await kit.click(kit.buttonNamed("재시도", document.querySelector('[aria-label="보유 재화"]')))
  assert.ok(s.callsOf("GET", /\/wallet$/).length > before)
  assert.deepEqual(kit.balanceLabels(), ["무료 재화 1000", "유료 재화 0"])
  assert.equal(kit.buyButton().disabled, false)
})
