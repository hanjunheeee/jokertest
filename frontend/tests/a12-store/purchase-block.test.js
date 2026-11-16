// 상점 구매 단추가 꺼지는 때와 단추 아래 까닭 글 시험 (잔액 미리 검사·지갑 못 받음·묶음 0개·보유·재화 상품 목록 문제)
// 목록 A12-상점-결제.md A12-F-001~018 (받은 버그 2: 잔액이 모자라면 단추를 미리 끄고 "잔액이 부족합니다.")
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")
const { purchaseBlockOf } = await import("../../src/domains/store/utils/storePanel.js")
const { EMOTICON_STORE_ITEMS, INGAME_MONEY_STORE_ITEMS, STORE_PRICE_PENDING } = await import("../../src/domains/store/constants/storeItems.js")

test.afterEach(() => kit.reset())

const SHORT = "잔액이 부족합니다."

// 지갑을 받은 뒤 프로필 테두리 분류 → 첫 상품 "남작"(200골드)이 골라짐
async function borderStore(gold, extra = {}) {
  const s = kit.start({ gold, ...extra })
  await kit.renderStore()
  await kit.pickCategory("프로필 테두리")
  return s
}

// 단추 꺼짐·까닭 글을 글자와 참거짓으로만 꺼냄
const state = () => ({ disabled: kit.buyButton().disabled, reason: kit.reasonText() })

// ── A12-F-001~006: 잔액 미리 검사 (돈 경계: 0·하나 모자람·딱 맞음·하나 남음) ──

for (const [id, gold, disabled] of [["A12-F-001", 0, true], ["A12-F-002", 199, true]]) {
  test(`${id} [버그 2] 200골드 테두리 + 잔액 ${gold} → 단추 꺼짐 + "잔액이 부족합니다."`, async () => {
    await borderStore(gold)
    assert.equal(kit.detail().querySelector("h2").textContent, "남작")
    assert.deepEqual(state(), { disabled, reason: SHORT })
  })
}

for (const [id, gold] of [["A12-F-003", 200], ["A12-F-004", 201]]) {
  test(`${id} [버그 2] 200골드 테두리 + 잔액 ${gold} → 단추 켜짐, 까닭 줄 없음`, async () => {
    await borderStore(gold)
    assert.equal(kit.detail().querySelector("h2").textContent, "남작")
    assert.deepEqual(state(), { disabled: false, reason: null })
  })
}

// 일괄구매 켜면 지금 고른 남작(200)으로 시작 → 자작(300)을 더 골라 합 500
async function bulkFiveHundred(gold) {
  await borderStore(gold)
  await kit.click(kit.buttonNamed("일괄구매"))
  await kit.pickItem("자작")
}

test("A12-F-005 [버그 2] 묶음 합 500(남작 200 + 자작 300) + 잔액 499 → 단추 꺼짐 + \"잔액이 부족합니다.\"", async () => {
  await bulkFiveHundred(499)
  assert.deepEqual(state(), { disabled: true, reason: SHORT })
})

test("A12-F-006 [버그 2] 묶음 합 500 + 잔액 500 → 단추 켜짐, 까닭 줄 없음", async () => {
  await bulkFiveHundred(500)
  assert.deepEqual(state(), { disabled: false, reason: null })
})

// ── A12-F-007~009: 지갑 상태 ──

test("A12-F-007 지갑을 못 받음 → 단추 꺼짐 + 재시도 안내 글", async () => {
  const s = kit.createServer({ gold: 500 })
  s.on("GET", /\/wallet$/, kit.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." }))
  kit.signIn(kit.nextUuid())
  await kit.renderStore()
  await kit.pickCategory("프로필 테두리")
  assert.deepEqual(state(), {
    disabled: true,
    reason: "보유 재화를 불러오지 못해 구매할 수 없습니다. 보유 재화 칸의 재시도를 눌러 주세요.",
  })
})

// 지갑 답을 붙잡아 둔 채 그림
async function walletHeld() {
  const s = kit.createServer({ gold: 0 })
  const held = kit.later()
  s.on("GET", /\/wallet$/, () => held.promise)
  kit.signIn(kit.nextUuid())
  await kit.renderStore()
  await kit.pickCategory("프로필 테두리")
  return held
}

test("A12-F-008 지갑 받는 중 → 단추 꺼짐 + \"보유 재화를 불러오는 중입니다.\"", async () => {
  const held = await walletHeld()
  assert.deepEqual(state(), { disabled: true, reason: "보유 재화를 불러오는 중입니다." })
  held.give(kit.reply(200, { balanceGold: 0, balanceDiamond: 0 }))
})

test("A12-F-009 지갑 받는 중 + 잔액 칸 0 → 까닭이 \"잔액이 부족합니다.\"가 아님 (못 받은 0을 잔액으로 안 봄)", async () => {
  const held = await walletHeld()
  assert.equal(kit.useEconomyStore.getState().balanceGold, 0)
  assert.notEqual(kit.reasonText(), SHORT)
  held.give(kit.reply(200, { balanceGold: 0, balanceDiamond: 0 }))
})

// ── A12-F-010~015 ──

test("A12-F-010 묶음 모드에서 고른 것 0개 → 단추 꺼짐 + \"일괄구매할 상품을 골라 주세요.\"", async () => {
  await borderStore(1000)
  await kit.click(kit.buttonNamed("일괄구매"))
  // 켤 때 들어간 남작을 다시 눌러 뺌
  await kit.pickItem("남작")
  assert.deepEqual(state(), { disabled: true, reason: "일괄구매할 상품을 골라 주세요." })
})

test("A12-F-011 이미 가진 테두리 → 단추 꺼짐, 단추 글자 \"보유중\", 까닭 줄 없음", async () => {
  await borderStore(1000, { entitlements: ["profile-border-남작"] })
  assert.deepEqual({ ...state(), label: kit.buyLabel() }, { disabled: true, reason: null, label: "보유중" })
})

test("A12-F-012 기본 지급 이모티콘(기본 8종 하나) → 단추 꺼짐 (이미 가짐)", () => {
  const basic = EMOTICON_STORE_ITEMS.find((item) => item.defaultGrant === true)
  assert.equal(basic.category, "이모티콘")
  const block = purchaseBlockOf({
    currentItem: basic, bulkMode: false, bulkSelectedIds: new Set(), ownedItemIds: new Set(),
    purchaseLocked: false, economyStatus: "ready", balanceGold: 1000,
  })
  assert.equal(block.disabled, true)
})

test("A12-F-013 [지금 동작] 가격 미정 아이템 → 잔액 검사 안 함 (잔액 0이어도 부족 글 없음)", () => {
  const pending = { id: "a12-pending-item", category: "스킨", name: "가격 미정 스킨", priceAmount: STORE_PRICE_PENDING }
  const block = purchaseBlockOf({
    currentItem: pending, bulkMode: false, bulkSelectedIds: new Set(), ownedItemIds: new Set(),
    purchaseLocked: false, economyStatus: "ready", balanceGold: 0,
  })
  assert.notEqual(block.reason, SHORT)
})

test("A12-F-014 구매 보냄(답 전) → 단추 꺼짐, 까닭 줄 없음 (단추 아래 결과 안내가 까닭)", async () => {
  const s = await borderStore(1000)
  const held = kit.later()
  s.on("POST", "/economy/purchases/bulk", () => held.promise)
  await kit.pressBuy()
  assert.deepEqual(state(), { disabled: true, reason: null })
  assert.match(kit.belowText(), /구매 결과를 확인하고 있습니다/)
  held.give(kit.reply(201, { idempotent: false, kind: "ITEM", results: [] }))
})

test("A12-F-015 골드 0 + 골드 구매 상품 → 단추 켜짐 (골드 잔액으로 안 끔)", async () => {
  kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("골드 500")
  assert.equal(kit.detail().querySelector("h2").textContent, "골드 500")
  assert.deepEqual(state(), { disabled: false, reason: null })
})

// ── A12-F-016~017: 재화 상품 목록 문제 ──

test("A12-F-016 재화 상품 목록 다시 받기 실패 → \"상품 목록을 불러오지 못했습니다. 상품 목록 새로고침을 눌러 주세요.\"", async () => {
  const s = kit.start({ gold: 0, diamond: 100, products: [kit.DIA_PRODUCT, kit.GOLD_PRODUCT] })
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("골드 500")
  s.on("GET", "/economy/currency-products", kit.reply(500, { ok: false, code: "SERVER_ERROR", message: "서버 내부에서 에러가 발생했습니다." }))
  await kit.click(kit.buttonNamed("상품 목록 새로고침"))
  assert.deepEqual(state(), { disabled: true, reason: "상품 목록을 불러오지 못했습니다. 상품 목록 새로고침을 눌러 주세요." })
})

test("A12-F-017 충전 상품 값이 바뀜(409) → \"상품 정보가 바뀌었습니다. 상품 목록 새로고침을 눌러 주세요.\"", async () => {
  const s = kit.start({ gold: 0, diamond: 0, products: [kit.DIA_PRODUCT] })
  kit.installToss()
  await kit.renderStore()
  await kit.pickCategory("인게임 재화")
  await kit.pickItem("다이아 100")
  // 새 목록 받기는 붙잡아 둠 (바뀐 상품 표시가 남은 동안을 봄)
  const held = kit.later()
  s.on("GET", "/economy/currency-products", () => held.promise)
  s.on("POST", "/economy/topup/orders", kit.reply(409, {
    ok: false, code: "PRODUCT_VERSION_MISMATCH", message: "상품 정보가 변경되었습니다.", product: { ...kit.DIA_PRODUCT, version: 4 },
  }))
  await kit.pressBuy()
  assert.deepEqual(state(), { disabled: true, reason: "상품 정보가 바뀌었습니다. 상품 목록 새로고침을 눌러 주세요." })
  held.give(kit.reply(200, { ok: true, products: [{ ...kit.DIA_PRODUCT, version: 4 }] }))
})

test("A12-F-018 여기서 못 사는 분류(인게임 재화의 옛 자리표시 상품) → \"이 분류의 상품은 여기서 살 수 없습니다.\"", () => {
  const block = purchaseBlockOf({
    currentItem: INGAME_MONEY_STORE_ITEMS[0], bulkMode: false, bulkSelectedIds: new Set(), ownedItemIds: new Set(),
    purchaseLocked: false, economyStatus: "ready", balanceGold: 1000,
  })
  assert.deepEqual(block, { disabled: true, reason: "이 분류의 상품은 여기서 살 수 없습니다." })
})
