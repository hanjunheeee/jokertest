// 상점 이모티콘 칸 시험: 상점 15종 구매 단추·기본 8종은 목록에 없음·일괄구매 합에 들어감·옛 "준비중" 글 없음
// 목록 A12-상점-결제.md A12-F-147~150 (옛 설계 F-33 2-1)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")
const { EMOTICON_STORE_ITEMS } = await import("../../src/domains/store/constants/storeItems.js")

test.afterEach(() => kit.reset())

const SHOP = EMOTICON_STORE_ITEMS.filter((item) => item.defaultGrant !== true)
const BASIC = EMOTICON_STORE_ITEMS.filter((item) => item.defaultGrant === true)

// 골드 넉넉한 계정으로 이모티콘 분류를 엶
async function emoticonStore() {
  const s = kit.start({ gold: 10000 })
  await kit.renderStore()
  await kit.pickCategory("이모티콘")
  return s
}

test("A12-F-147 이모티콘 분류 → 상점 15종 칸이 있고 고르면 켜진 \"구매\" 단추", async () => {
  await emoticonStore()
  assert.equal(SHOP.length, 15)
  const seen = []
  for (const item of SHOP) {
    const slot = kit.slotOf(item.name)
    assert.ok(slot !== undefined, `칸 없음: ${item.name}`)
    await kit.click(slot)
    seen.push({ name: kit.detail().querySelector("h2").textContent, label: kit.buyLabel(), disabled: kit.buyButton().disabled })
  }
  assert.deepEqual(seen, SHOP.map((item) => ({ name: item.name, label: "구매", disabled: false })))
})

// 기본 8종은 모두가 이미 받은 것이라 살 것이 아님 → 상점 목록에서 일부러 뺌 (storeItems.js getStoreItemsByCategory)
test("A12-F-148 기본 8종 → 상점 이모티콘 분류 목록에 안 나옴 (칸은 상점 15종뿐)", async () => {
  await emoticonStore()
  assert.equal(BASIC.length, 8)
  const shown = BASIC.map((item) => ({ name: item.name, inGrid: kit.slotOf(item.name) !== undefined }))
  assert.deepEqual(shown, BASIC.map((item) => ({ name: item.name, inGrid: false })))
  assert.equal(kit.slotButtons().length, SHOP.length)
})

test("A12-F-149 일괄구매에서 이모티콘 둘 고름 → 확인 창 합에 들어감 (500 + 500 = 1,000 골드)", async () => {
  await emoticonStore()
  await kit.pickItem(SHOP[0].name)
  await kit.click(kit.buttonNamed("일괄구매"))
  await kit.pickItem(SHOP[3].name)
  await kit.pressBuy()
  const dialog = document.querySelector('[role="dialog"][aria-label="선택 상품 구매 확인"]')
  assert.ok(dialog !== null)
  const text = dialog.textContent
  assert.ok(text.includes(SHOP[0].name) && text.includes(SHOP[3].name), text)
  assert.ok(text.includes("1,000 골드"), text)
})

test("A12-F-150 이모티콘 고름 → 옛 \"표시 전용 · 준비중\" 글 없음", async () => {
  await emoticonStore()
  await kit.pickItem(SHOP[0].name)
  assert.equal(kit.detail().querySelector("h2").textContent, SHOP[0].name)
  assert.ok(!document.body.textContent.includes("표시 전용"))
  assert.ok(!kit.detail().textContent.includes("준비중"))
})
