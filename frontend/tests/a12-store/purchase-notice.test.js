// 아이템 구매 실패 글 자리 시험: 꺼진 까닭·서버 거절·끊김·로그인 풀림·저장소 막힘 글이 구매 단추 바로 아래에 한 번만
// 목록 A12-상점-결제.md A12-F-019~035 (받은 버그 2), 보임(색 대비)은 jsdom이 못 봐서 브라우저 시험 몫
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("./storeKit.mjs")
const { setUnauthorizedHandler } = await import("../../src/shared/api/response.js")
const { handleAuthUnauthorized } = await import("../../src/domains/auth/api/unauthorized.js")
const { STORE_ITEMS } = await import("../../src/domains/store/constants/storeItems.js")

test.afterEach(() => kit.reset())

const REJECTED = "구매가 거부되었습니다. 재화는 차감되지 않았습니다."
const NEED_CHECK = "구매 결과 확인이 필요합니다."
const NETWORK = "인터넷 연결이 끊겨 구매 결과를 확인하지 못했습니다. 연결을 확인한 뒤 결과 확인을 눌러 주세요."
const AUTH_LOST = "구매 중 로그인이 풀려 결과를 확인하지 못했습니다. 다시 로그인한 뒤 결과 확인을 눌러 주세요."

// 골드 넉넉한 계정이 스킨(처음 고른 상품, 500골드) 앞에 섬, 구매 답은 answer로 정함
async function skinStore({ gold = 1000, answer } = {}) {
  const s = kit.start({ gold })
  if (answer) s.on("POST", "/economy/purchases/bulk", answer)
  await kit.renderStore()
  return s
}

// 단추 아래 칸이 그 글을 품고 있고, 판 맨 위(설명 칸 밖)엔 없는지
function onlyBelowButton(text) {
  return { below: kit.belowText().includes(text), outside: kit.outsideDetailText().includes(text) }
}

test("A12-F-019 [버그 2] 골드 0 계정이 스킨을 고름 → 단추 disabled, 까닭 \"잔액이 부족합니다.\"가 단추 줄 바로 다음 칸 안", async () => {
  await skinStore({ gold: 0 })
  assert.equal(kit.buyButton().disabled, true)
  const reason = kit.reasonEl()
  assert.ok(reason !== null)
  assert.equal(reason.textContent, "잔액이 부족합니다.")
  assert.ok(kit.belowButton() !== null && kit.belowButton().contains(reason))
  // 숨김 표시 없음, 글자색·바탕색 클래스가 같은 값이 아님 (진짜 보이는지는 브라우저 시험 몫)
  assert.equal(reason.hidden, false)
  assert.equal(reason.closest("[hidden],[aria-hidden='true']"), null)
  const cls = reason.className
  const text = cls.match(/text-\[(#[0-9a-fA-F]+)\]/)?.[1]
  const bg = cls.match(/bg-\[(#[0-9a-fA-F]+)\]/)?.[1]
  assert.ok(text && bg && text.toLowerCase() !== bg.toLowerCase(), `글자색 ${text} 바탕색 ${bg}`)
})

test("A12-F-020 [버그 2] 서버 409 \"이미 보유한 상품입니다.\" → 그 글이 단추 아래 칸 안, 판 맨 위 상자엔 없음", async () => {
  await skinStore({ answer: kit.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: "이미 보유한 상품입니다." }) })
  await kit.pressBuy()
  assert.deepEqual(onlyBelowButton("이미 보유한 상품입니다."), { below: true, outside: false })
})

test("A12-F-021 다른 창에서 골드를 써서 서버가 잔액 부족(400) → 거부 글 + \"잔액이 부족합니다.\" 단추 아래", async () => {
  await skinStore({ gold: 1000, answer: kit.reply(400, { success: false, code: "INSUFFICIENT_BALANCE", message: "잔액이 부족합니다." }) })
  await kit.pressBuy()
  assert.deepEqual(onlyBelowButton(REJECTED), { below: true, outside: false })
  assert.deepEqual(onlyBelowButton("잔액이 부족합니다."), { below: true, outside: false })
})

test("A12-F-022 판매 안 하는 상품 거절(400 ITEM_NOT_PURCHASABLE) → 거부 글 + 서버 글, 상품 id 영어 없음", async () => {
  await skinStore({ answer: kit.reply(400, { success: false, code: "ITEM_NOT_PURCHASABLE", message: "존재하지 않거나 구매할 수 없는 상품입니다." }) })
  await kit.pressBuy()
  const below = kit.belowText()
  assert.ok(below.includes(REJECTED))
  assert.ok(below.includes("존재하지 않거나 구매할 수 없는 상품입니다."))
  assert.doesNotMatch(below, /[A-Za-z]/)
})

test("A12-F-023 서버 500 → \"구매 결과 확인이 필요합니다.\" + 결과 확인·다시 시도 단추", async () => {
  await skinStore({ answer: kit.reply(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." }) })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes(NEED_CHECK))
  assert.ok(kit.buttonNamed("결과 확인", kit.belowButton()) !== null)
  assert.ok(kit.buttonNamed("다시 시도", kit.belowButton()) !== null)
})

const OFFLINE = [
  ["A12-F-024", "Failed to fetch"],
  ["A12-F-025", "NetworkError when attempting to fetch resource."],
  ["A12-F-026", "Load failed"],
]
for (const [id, message] of OFFLINE) {
  test(`${id} 인터넷 끊김(TypeError "${message}") → 우리말 끊김 글, 영어 글자 없음`, async () => {
    await skinStore({ answer: kit.offline(message) })
    await kit.pressBuy()
    const below = kit.belowText()
    assert.ok(below.includes(NETWORK), below)
    assert.doesNotMatch(below, /[A-Za-z]/)
  })
}

test("A12-F-027 구매 중 401(로그인 풀림) → 그 계정 기록에 결과 모름 + 로그인 풀림 글, 같은 계정으로 다시 그리면 단추 아래", async () => {
  // 앱이 쓰는 401 처리 그대로 (로그아웃 → 로그인 화면으로)
  setUnauthorizedHandler(handleAuthUnauthorized)
  try {
    const s = await skinStore({ answer: kit.reply(401, { success: false, message: "로그인이 필요합니다." }) })
    await kit.pressBuy()
    assert.equal(kit.useAuthStore.getState().user, null)
    kit.rtl.cleanup()
    kit.signIn(s.uuid)
    await kit.renderStore()
    assert.ok(kit.belowText().includes(AUTH_LOST), kit.belowText())
    assert.ok(kit.belowText().includes(NEED_CHECK))
  } finally {
    setUnauthorizedHandler(null)
  }
})

test("A12-F-028 기기 저장소 쓰기 오류 → \"구매 기록을 안전하게 저장하지 못해 전송하지 않았습니다.\", 구매 요청 0번", async () => {
  const s = await skinStore()
  const proto = Object.getPrototypeOf(window.localStorage)
  const original = proto.setItem
  proto.setItem = () => { throw new window.DOMException("저장소 막힘", "QuotaExceededError") }
  try {
    await kit.pressBuy()
  } finally {
    proto.setItem = original
  }
  assert.ok(kit.belowText().includes("구매 기록을 안전하게 저장하지 못해 전송하지 않았습니다."))
  assert.equal(s.callsOf("POST", "/economy/purchases/bulk").length, 0)
})

test("A12-F-029 막힘 상태(저장소 읽기 오류) 안내 → 첫 줄부터 글 (빈 첫 줄 없음)", async () => {
  kit.createServer({ gold: 1000 })
  const proto = Object.getPrototypeOf(window.localStorage)
  const original = proto.getItem
  proto.getItem = () => { throw new window.DOMException("저장소 막힘", "SecurityError") }
  try {
    kit.signIn(kit.nextUuid())
  } finally {
    proto.getItem = original
  }
  await kit.renderStore()
  const box = kit.belowButton()?.querySelector('[role="status"]')
  assert.ok(box !== null && box !== undefined)
  const first = box.firstElementChild
  assert.ok(first !== null)
  assert.notEqual(first.textContent.trim(), "")
  assert.match(box.textContent, /이전 구매 기록을 읽지 못했습니다/)
})

test("A12-F-030 실패 하나 → 같은 글이 화면에 한 번만 (판 맨 위 상자와 안 겹침)", async () => {
  await skinStore({ answer: kit.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: "이미 보유한 상품입니다." }) })
  await kit.pressBuy()
  assert.equal(kit.countText("이미 보유한 상품입니다."), 1)
  assert.equal(kit.countText(REJECTED), 1)
})

test("A12-F-031 [지금 동작] 구매 성공 → 단추 \"보유중\"으로 꺼짐, 실패 글 없음", async () => {
  const s = await skinStore()
  s.on("POST", "/economy/purchases/bulk", ({ body }) => {
    for (const { itemId } of body.items) s.entitlements.push({ itemId, itemType: "SKIN", source: "PURCHASE", acquiredAt: "2026-11-16T00:00:00.000Z" })
    return kit.reply(201, { idempotent: false, kind: "ITEM", results: [] })
  })
  await kit.pressBuy()
  assert.deepEqual({ label: kit.buyLabel(), disabled: kit.buyButton().disabled }, { label: "보유중", disabled: true })
  assert.doesNotMatch(kit.belowText(), /거부|확인이 필요|실패/)
})

test("A12-F-032 [지금 동작] 실패 뒤 다른 상품 고름 → 단추 아래 비어 있음", async () => {
  await skinStore({ answer: kit.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: "이미 보유한 상품입니다." }) })
  await kit.pressBuy()
  assert.ok(kit.belowText().includes("이미 보유한 상품입니다."))
  await kit.pickItem("경비원-푸른서리")
  assert.equal(kit.detail().querySelector("h2").textContent, "경비원-푸른서리")
  assert.equal(kit.belowText(), "")
})

test("A12-F-033 묶음 구매 확인 창 안에서 구매 실패 → 실패 글이 창 안", async () => {
  const s = kit.start({ gold: 5000 })
  s.on("POST", "/economy/purchases/bulk", kit.reply(409, { success: false, code: "ITEM_ALREADY_OWNED", message: "이미 보유한 상품입니다." }))
  await kit.renderStore()
  await kit.click(kit.buttonNamed("일괄구매"))
  await kit.pickItem("경비원-푸른서리")
  await kit.pressBuy()
  const dialog = document.querySelector('[role="dialog"][aria-label="선택 상품 구매 확인"]')
  assert.ok(dialog !== null)
  await kit.click(dialog.querySelector('button[aria-label="구매하기"]'))
  const inDialog = document.querySelector('[role="dialog"][aria-label="선택 상품 구매 확인"]')
  assert.ok(inDialog.textContent.includes("이미 보유한 상품입니다."))
  assert.ok(inDialog.textContent.includes(REJECTED))
})

test("A12-F-034 꺼진 까닭 줄은 role=\"status\" (화면 읽기 프로그램이 읽어 줌)", async () => {
  await skinStore({ gold: 0 })
  assert.equal(kit.reasonEl().getAttribute("role"), "status")
})

test("A12-F-035 구매 단추 aria-label = 보이는 글자 (\"구매\"·\"보유중\", 꺼져 있어도)", async () => {
  await skinStore({ gold: 0 })
  const buy = kit.buyButton()
  assert.deepEqual({ aria: buy.getAttribute("aria-label"), text: buy.textContent, disabled: buy.disabled }, { aria: "구매", text: "구매", disabled: true })
  kit.reset()
  kit.start({ gold: 0, entitlements: [STORE_ITEMS[0].id] })
  await kit.renderStore()
  const owned = kit.buyButton()
  assert.deepEqual({ aria: owned.getAttribute("aria-label"), text: owned.textContent, disabled: owned.disabled }, { aria: "보유중", text: "보유중", disabled: true })
})
