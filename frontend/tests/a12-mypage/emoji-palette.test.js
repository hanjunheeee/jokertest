// 마이페이지 이모티콘 팔레트 화면 시험: 처음 8칸·칸 바꾸기·저장 몸·되돌리기·버전 충돌·안 가진 것 거절·목록은 23개 전부(안 가진 것 잠금)·검색/거르기
// 목록 A12-상점-결제.md A12-F-135~144 (옛 설계 F-33 2-2), 서버는 가짜(GET·PUT /user/me/emoji-palette)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const kit = await import("../a12-store/storeKit.mjs")
const { EMOTICON_STORE_ITEMS } = await import("../../src/domains/store/constants/storeItems.js")
const { default: EmoticonPalettePage } = await import("../../src/domains/user/pages/EmoticonPalettePage.jsx")
const { useEmojiPaletteStore } = await import("../../src/domains/user/store/emojiPalette.store.js")

test.afterEach(() => {
  kit.reset()
  useEmojiPaletteStore.getState().reset()
})

const PALETTE = "/user/me/emoji-palette"
const BASIC = EMOTICON_STORE_ITEMS.filter((item) => item.defaultGrant === true)
const SHOP = EMOTICON_STORE_ITEMS.filter((item) => item.defaultGrant !== true)
const SHUSH = SHOP.find((item) => item.name === "쉿 조용히")
// 서버 칸: 기본 8종을 거꾸로 (순서가 그대로 나오는지 보려고)
const SERVER_SLOTS = BASIC.map((item) => item.id).reverse()
// 가진 것: 기본 8종 + 산 "쉿 조용히" = 9개
const OWNED = [...BASIC.map((item) => item.id), SHUSH.id]

// 팔레트 화면 그림 (서버 답을 정함)
async function palettePage({ slots = SERVER_SLOTS, owned = OWNED, put } = {}) {
  const s = kit.start()
  s.on("GET", PALETTE, kit.reply(200, { ok: true, slots, revision: "rev-1", owned }))
  if (put) s.on("PUT", PALETTE, put)
  kit.rtl.render(kit.h(kit.MemoryRouter, { initialEntries: ["/mypage/emoticons"] }, kit.h(EmoticonPalettePage)))
  await kit.flush()
  return s
}
// 바퀴 칸 8개에 든 이모티콘 이름 (비면 null)
const wheelNames = () => [...document.querySelectorAll('[aria-label="팔레트 슬롯"] button')]
  .map((button) => button.querySelector("img")?.getAttribute("alt") ?? null)
const slotButton = (number) => document.querySelector(`button[aria-label="${number}번 슬롯"]`)
const listItems = () => [...document.querySelectorAll('ul[aria-label="이모티콘 목록"] > li')]
const nameOf = (id) => EMOTICON_STORE_ITEMS.find((item) => item.id === id).name

test("A12-F-135 처음 그림: 서버 칸 8개 → 팔레트 8칸이 그 순서", async () => {
  await palettePage()
  assert.deepEqual(wheelNames(), SERVER_SLOTS.map(nameOf))
})

test("A12-F-136 3번 칸 누름 → 고른 표시 → 왼쪽 \"쉿 조용히\" 누름 → 3번 칸 바뀜 (아직 저장 전)", async () => {
  const s = await palettePage()
  await kit.click(slotButton(3))
  assert.equal(slotButton(3).getAttribute("aria-pressed"), "true")
  await kit.click(document.querySelector('button[aria-label="쉿 조용히 팔레트에 넣기"]'))
  assert.equal(wheelNames()[2], "쉿 조용히")
  assert.equal(s.callsOf("PUT", PALETTE).length, 0)
})

test("A12-F-137 저장 → PUT 몸 {slots[8], expectedRevision}", async () => {
  const s = await palettePage({ put: ({ body }) => kit.reply(200, { ok: true, slots: body.slots, revision: "rev-2" }) })
  await kit.click(slotButton(3))
  await kit.click(document.querySelector('button[aria-label="쉿 조용히 팔레트에 넣기"]'))
  await kit.click(kit.buttonNamed("저장"))
  const sent = s.callsOf("PUT", PALETTE)
  assert.equal(sent.length, 1)
  assert.deepEqual(Object.keys(sent[0].body).sort(), ["expectedRevision", "slots"])
  assert.equal(sent[0].body.slots.length, 8)
  assert.equal(sent[0].body.slots[2], SHUSH.id)
  assert.equal(sent[0].body.expectedRevision, "rev-1")
})

test("A12-F-138 바꾼 뒤 되돌리기(취소) → 서버 값으로", async () => {
  await palettePage()
  await kit.click(slotButton(3))
  await kit.click(document.querySelector('button[aria-label="쉿 조용히 팔레트에 넣기"]'))
  assert.equal(wheelNames()[2], "쉿 조용히")
  await kit.click(kit.buttonNamed("되돌리기"))
  assert.deepEqual(wheelNames(), SERVER_SLOTS.map(nameOf))
})

test("A12-F-139 [지금 동작] 다른 곳에서 먼저 바꿈(409 REVISION_MISMATCH + 지금 값) → 그 값으로 다시 그림 + 안내 글", async () => {
  const theirs = [SHUSH.id, ...BASIC.slice(0, 7).map((item) => item.id)]
  await palettePage({
    put: kit.reply(409, {
      ok: false, code: "REVISION_MISMATCH", message: "이모티콘 팔레트가 다른 곳에서 이미 변경되었습니다. 최신 상태를 다시 불러온 뒤 다시 시도하세요.",
      revision: "rev-9", slots: theirs,
    }),
  })
  await kit.click(slotButton(1))
  await kit.click(document.querySelector(`button[aria-label="${BASIC[7].name} 팔레트에 넣기"]`))
  await kit.click(kit.buttonNamed("저장"))
  assert.deepEqual(wheelNames(), theirs.map(nameOf))
  assert.match(document.body.textContent, /다른 곳에서 먼저 변경되어 최신 값을 불러왔습니다/)
})

test("A12-F-140 안 가진 것 거절(400 NOT_OWNED) → 안내 글, 저장된 것으로 안 봄", async () => {
  await palettePage({ put: kit.reply(400, { ok: false, code: "NOT_OWNED", message: "소유하지 않은 이모티콘입니다." }) })
  await kit.click(slotButton(3))
  await kit.click(document.querySelector('button[aria-label="쉿 조용히 팔레트에 넣기"]'))
  await kit.click(kit.buttonNamed("저장"))
  const alerts = [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent).join("|")
  assert.match(alerts, /보유하지 않은 이모티콘이 포함되어 있습니다/)
  assert.equal(document.querySelector("[data-emoticon-palette-save-success]"), null)
  // 저장 안 됐으니 되돌리면 서버 값 그대로
  await kit.click(kit.buttonNamed("되돌리기"))
  assert.deepEqual(wheelNames(), SERVER_SLOTS.map(nameOf))
})

// 목록 단추 (칸마다 하나)
const listButtons = () => listItems().map((li) => li.querySelector("button"))

// 사용자 결정(2026-11-16 오전 둘째 8번 "지금대로"): 안 가진 것도 잠금 표시로 다 보임
test("A12-F-141 왼쪽 목록은 23개 전부: owned 9개 → 가진 9개만 누를 수 있고 안 가진 14개는 잠금(미보유)", async () => {
  await palettePage()
  assert.equal(OWNED.length, 9)
  assert.equal(EMOTICON_STORE_ITEMS.length, 23)
  const buttons = listButtons()
  assert.equal(buttons.length, 23)
  const open = buttons.filter((button) => !button.disabled).map((button) => button.getAttribute("aria-label")).sort()
  assert.deepEqual(open, OWNED.map((id) => `${nameOf(id)} 팔레트에 넣기`).sort())
  const locked = buttons.filter((button) => button.disabled).map((button) => button.getAttribute("aria-label")).sort()
  assert.deepEqual(locked, SHOP.filter((item) => item.id !== SHUSH.id).map((item) => `${item.name} (미보유)`).sort())
})

test("A12-F-142 목록 거르기: 검색 \"쉿\" → 1개", async () => {
  await palettePage()
  const input = document.querySelector('input[aria-label="이모티콘 검색"]')
  await kit.rtl.act(async () => { kit.rtl.fireEvent.change(input, { target: { value: "쉿" } }) })
  await kit.flush()
  assert.deepEqual(listItems().map((li) => li.querySelector("img[alt]:not([alt=''])")?.getAttribute("alt")), ["쉿 조용히"])
})

// 등급 거르기 고르기
async function gradeFilter(value) {
  const select = document.querySelector('select[aria-label="이모티콘 등급 필터"]')
  await kit.rtl.act(async () => { kit.rtl.fireEvent.change(select, { target: { value } }) })
  await kit.flush()
  return listItems().map((li) => li.querySelector("img[alt]:not([alt=''])")?.getAttribute("alt"))
}

test("A12-F-143 목록 거르기: \"기본\" → 기본 8종", async () => {
  await palettePage()
  assert.deepEqual(await gradeFilter("기본"), BASIC.map((item) => item.name))
})

test("A12-F-144 목록 거르기: \"상점\" → 상점 15종 전부, 산 것(쉿 조용히)만 누를 수 있고 나머지 14개는 잠금", async () => {
  await palettePage()
  assert.deepEqual(await gradeFilter("상점"), SHOP.map((item) => item.name))
  const open = listButtons().filter((button) => !button.disabled).map((button) => button.getAttribute("aria-label"))
  assert.deepEqual(open, ["쉿 조용히 팔레트에 넣기"])
})
