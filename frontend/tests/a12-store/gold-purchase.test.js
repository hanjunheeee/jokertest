// 골드 구매(다이아 → 골드) 화면 시험: 한 번 보냄·다이아 부족과 충전하러 가기·값 바뀜과 새 조건·그 밖 거절·결과 모름·두 잔액
// 목록 A12-상점-결제.md A12-F-044~054 (옛 설계 F-32 2-5a 골드 표, 고치기 5 마지막 줄)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")

test.afterEach(() => kit.reset())

const GOLD_POST = "/economy/gold-purchases"
// 충전·골드 경로 오류 몸 모양 (백엔드 errorHandler 충전 범위)
const fail = (status, code, message) => kit.reply(status, { ok: false, code, message })

// 재화 분류에서 "골드 500" 상품을 고른 화면
async function goldStore({ diamond = 100, answer, page = false } = {}) {
  const s = kit.start({ gold: 0, diamond, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  if (answer) s.on("POST", GOLD_POST, answer)
  if (page) await kit.renderStorePage()
  else await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("골드 500")
  assert.equal(kit.detail().querySelector("h2").textContent, "골드 500")
  return s
}

test("A12-F-044 골드 구매 누름 → POST /gold-purchases 1번, 몸 {productId, version, referenceEventId}", async () => {
  const s = await goldStore({ answer: kit.reply(200, { ok: true, balanceGold: 500, balanceDiamond: 50 }) })
  await kit.pressBuy()
  const sent = s.callsOf("POST", GOLD_POST)
  assert.equal(sent.length, 1)
  assert.deepEqual(Object.keys(sent[0].body).sort(), ["productId", "referenceEventId", "version"])
  assert.equal(sent[0].body.productId, "gold-500")
  assert.equal(sent[0].body.version, 2)
  assert.equal(typeof sent[0].body.referenceEventId, "string")
})

test("A12-F-045 다이아 부족(400 INSUFFICIENT_DIAMOND) → \"다이아가 부족합니다. 잔액은 변하지 않았습니다.\" + \"다이아 충전하러 가기\"", async () => {
  await goldStore({ diamond: 0, answer: fail(400, "INSUFFICIENT_DIAMOND", "다이아 잔액이 부족합니다.") })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("다이아가 부족합니다. 잔액은 변하지 않았습니다."), kit.belowText())
  assert.ok(kit.buttonNamed("다이아 충전하러 가기", kit.belowButton()) !== null)
})

test("A12-F-046 다이아 충전하러 가기 누름 → 다이아 충전 상품이 골라짐", async () => {
  await goldStore({ diamond: 0, answer: fail(400, "INSUFFICIENT_DIAMOND", "다이아 잔액이 부족합니다.") })
  await kit.pressBuy()
  await kit.click(kit.buttonNamed("다이아 충전하러 가기", kit.belowButton()))
  assert.equal(kit.detail().querySelector("h2").textContent, "다이아 100")
  assert.equal(kit.buyLabel(), "충전")
})

// 값이 바뀜: 409 + 지금 상품, 목록을 다시 받으면 새 버전(값 60 다이아 → 골드 600)
const NEW_GOLD = { ...kit.GOLD_PRODUCT, payAmount: 60, grantAmount: 600, version: 3 }
async function priceChanged() {
  const s = await goldStore({ answer: kit.reply(409, { ok: false, code: "PRODUCT_VERSION_MISMATCH", message: "상품 정보가 변경되었습니다.", product: NEW_GOLD }) })
  s.products = [kit.DIA_PRODUCT, NEW_GOLD]
  await kit.pressBuy()
  await kit.flush()
  return s
}

test("A12-F-047 상품 값이 바뀐 사이(409 PRODUCT_VERSION_MISMATCH) → \"상품 정보가 변경되었습니다…\" + 새 조건, 자동으로 다시 사지 않음", async () => {
  const s = await priceChanged()
  const below = kit.belowText()
  assert.match(below, /상품 정보가 변경되었습니다/)
  assert.ok(below.includes("새 조건: 60 다이아 → 골드 600"), below)
  assert.equal(s.callsOf("POST", GOLD_POST).length, 1)
})

test("A12-F-048 새 조건 확인 누름 → 새 버전으로 1번 (다시 누른 구매가 새 버전으로 한 번만 감)", async () => {
  const s = await priceChanged()
  s.on("POST", GOLD_POST, kit.reply(200, { ok: true, balanceGold: 600, balanceDiamond: 40 }))
  await kit.click(kit.buttonNamed("새 조건 확인", kit.belowButton()))
  assert.equal(s.callsOf("POST", GOLD_POST).length, 1)
  await kit.pressBuy()
  const sent = s.callsOf("POST", GOLD_POST)
  assert.equal(sent.length, 2)
  assert.equal(sent[1].body.version, 3)
})

const OTHER_REJECTS = [
  ["A12-F-049", "판매 중지", fail(409, "PRODUCT_STOPPED", "판매가 중지된 상품입니다."), "판매가 중지된 상품입니다."],
  ["A12-F-050", "상품 없음", fail(404, "PRODUCT_NOT_FOUND", "상품을 찾을 수 없습니다."), "상품을 찾을 수 없습니다."],
  ["A12-F-051", "잔액 한도", fail(400, "BALANCE_LIMIT_EXCEEDED", "잔액 한도를 초과했습니다."), "잔액 한도를 초과했습니다."],
]
for (const [id, label, answer, serverText] of OTHER_REJECTS) {
  test(`${id} 그 밖 거절(${label}) → "골드 구매에 실패했습니다. 재화는 차감되지 않았습니다." + 서버 글`, async () => {
    await goldStore({ answer })
    await kit.pressBuy()
    const below = kit.belowText()
    assert.ok(below.includes("골드 구매에 실패했습니다. 재화는 차감되지 않았습니다."), below)
    assert.ok(below.includes(serverText), below)
  })
}

test("A12-F-052 서버 500·인터넷 끊김 → \"골드 구매 결과 확인이 필요합니다.\"", async () => {
  await goldStore({ answer: fail(500, "SERVER_ERROR", "서버 내부에서 에러가 발생했습니다.") })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("골드 구매 결과 확인이 필요합니다."), kit.belowText())
  kit.reset()
  await goldStore({ answer: kit.offline("Failed to fetch") })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("골드 구매 결과 확인이 필요합니다."), kit.belowText())
})

test("A12-F-053 골드 구매 됨 → 응답의 balanceGold·balanceDiamond로 위 잔액 칸 바뀜", async () => {
  const s = await goldStore({ page: true, diamond: 100, answer: kit.reply(200, { ok: true, balanceGold: 500, balanceDiamond: 50 }) })
  assert.deepEqual(kit.balanceLabels(), ["무료 재화 0", "유료 재화 100"])
  // 다시 받는 지갑은 붙잡아 둠 → 응답 잔액만으로 바뀌는지 봄
  const held = kit.later()
  s.on("GET", /\/wallet$/, () => held.promise)
  await kit.pressBuy()
  // 지갑을 다시 받기 전에 이미 응답의 두 잔액이 들어가 있음 (스토어 값)
  const economy = kit.useEconomyStore.getState()
  assert.deepEqual([economy.balanceGold, economy.balanceDiamond], [500, 50])
  // 다시 받은 지갑이 오면 위 칸 숫자도 그 값
  held.give(kit.reply(200, { balanceGold: 500, balanceDiamond: 50 }))
  await kit.flush()
  assert.deepEqual(kit.balanceLabels(), ["무료 재화 500", "유료 재화 50"])
})

test("A12-F-054 응답 잔액 모양 틀림(balanceGold: -1) → 성공으로 안 봄, 결과 확인", async () => {
  await goldStore({ answer: kit.reply(200, { ok: true, balanceGold: -1, balanceDiamond: 50 }) })
  await kit.pressBuy()
  const below = kit.belowText()
  assert.ok(below.includes("골드 구매 결과 확인이 필요합니다."), below)
  assert.doesNotMatch(below, /골드 구매가 완료되었습니다/)
  assert.ok(kit.buttonNamed("결과 확인", kit.belowButton()) !== null)
})
