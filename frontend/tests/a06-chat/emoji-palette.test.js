// 이모티콘 팔레트 시험(jsdom, 인게임 화면 전체) — 단계 × 생존마다 내 카드 우클릭 + 칸 누름 결과, 남 카드, 팔레트 칸, 말풍선, 접근성
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-156~171 (재판·밤 기대는 결정 "2026-11-16 아침" 9번: 이모티콘은 낮에만)
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, flush, startFakeClock, tick, EMOJI, EMOJI_NAMES } from "./a06Kit.mjs"

test.afterEach(resetTable)

const DEAD_REPLY = { ok: false, code: "PLAYER_NOT_ALIVE", message: "요청을 처리할 수 없습니다." }
// 팔레트의 채워진 칸 단추 (이름 "사랑 보내기" 등)
const slotFor = (t, itemId) => t.palette()?.querySelector(`button[aria-label="${EMOJI_NAMES[itemId]} 보내기"]`) ?? null
const slotButtons = (t) => [...(t.palette()?.querySelectorAll("button") ?? [])]

// 내 카드 우클릭 → 팔레트가 열리면 "사랑" 칸 누름, 보낸 send_emoji 수 돌려줌
async function rightClickAndPick(t) {
  await t.rightClick(t.myCard())
  const slot = slotFor(t, EMOJI.love)
  if (slot && !slot.disabled && slot.closest("[inert]") === null) await t.click(slot)
  return t.sentOf("send_emoji").length
}

// 7명 판: 0번 광대, 나 = 2번 시민 (죽은 칸이면 나 죽음), 재판이면 피고 3번
const PALETTE_TABLE = [
  ["A06-F-156", "역할 확인 × 산", { phase: "ROLE_REVEAL" }, { sends: 1 }],
  ["A06-F-157", "낮 × 산", { phase: "DAY" }, { sends: 1 }],
  ["A06-F-158", "재판 × 산", { phase: "TRIBUNAL", defendant: 3 }, { sends: 0 }],
  ["A06-F-159", "밤 × 산", { phase: "NIGHT" }, { sends: 0 }],
  ["A06-F-160", "결과 × 산", { phase: "ENDED" }, { palette: false, sends: 0 }],
  ["A06-F-161", "낮 × 죽은", { phase: "DAY", dead: [2] }, { bubble: false }],
  ["A06-F-162", "재판 × 죽은", { phase: "TRIBUNAL", defendant: 3, dead: [2] }, { bubble: false }],
  ["A06-F-163", "밤 × 죽은", { phase: "NIGHT", dead: [2] }, { bubble: false }],
]
for (const [id, label, options, exp] of PALETTE_TABLE) {
  const expectText = exp.palette === false ? "팔레트 안 열림"
    : exp.bubble === false ? "말풍선 안 생김" : `send_emoji ${exp.sends}번`
  test(`${id} 이모티콘 팔레트 표: ${label} → 내 카드 우클릭 + 칸 누름 = ${expectText}`, async () => {
    const dead = options.dead ?? []
    const t = await openTable({
      n: 7, me: 2, roles: { 0: "JOKER" }, view: "page", ...options,
      acks: dead.includes(2) ? { send_emoji: DEAD_REPLY } : {},
    })
    assert.ok(t.myCard() !== null, "내 카드가 없음")
    const sends = await rightClickAndPick(t)
    if (exp.palette === false) assert.equal(t.palette() === null, true, "팔레트가 열림")
    if (exp.sends !== undefined) assert.equal(sends, exp.sends)
    if (exp.bubble === false) assert.equal(t.bubbleOn(2) === null, true, "내 카드에 말풍선이 생김")
  })
}

test("A06-F-164 남 카드 우클릭 → 팔레트 안 열림 [지금 동작]", async () => {
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.rightClick(t.cardOf(3))
  assert.equal(t.palette() === null, true)
})

test("A06-F-165 팔레트엔 넣어 둔 것만: 3칸 넣음 → 켜진 단추 3개, 빈 칸 단추 꺼짐", async () => {
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.rightClick(t.myCard())
  const buttons = slotButtons(t)
  assert.equal(buttons.length, 8)
  assert.equal(buttons.filter((b) => !b.disabled).length, 3)
  assert.equal(buttons.filter((b) => b.disabled).length, 5)
})

test("A06-F-166 \"사랑\" 칸 누름 → send_emoji itemId \"emoji-basic-love\"", async () => {
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.rightClick(t.myCard())
  await t.click(slotFor(t, EMOJI.love))
  assert.deepEqual(t.sentOf("send_emoji"), [{ gameId: t.gameId, itemId: EMOJI.love }])
})

test("A06-F-167 받은 이모티콘(B 카드 emoji_shown) → B 카드 위 말풍선", async () => {
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.emojiShown(3, EMOJI.hello)
  assert.equal(t.bubbleOn(3)?.getAttribute("data-ingame-emoji-bubble"), EMOJI.hello)
  assert.equal(t.bubbleOn(1) === null, true)
  assert.equal(t.bubbleOn(2) === null, true)
})

test("A06-F-168 말풍선 3초 뒤 사라짐 (가짜 시계) [지금 동작]", async () => {
  startFakeClock()
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.emojiShown(3, EMOJI.hello)
  assert.ok(t.bubbleOn(3) !== null, "말풍선이 안 뜸")
  await tick(3_000)
  assert.equal(t.bubbleOn(3) === null, true)
})

test("A06-F-169 거절된 이모티콘(RATE_LIMITED) → 내 카드 말풍선 없음 [지금 동작]", async () => {
  const t = await openTable({
    n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page",
    acks: { send_emoji: { ok: false, code: "RATE_LIMITED", message: "요청을 처리할 수 없습니다." } },
  })
  const sends = await rightClickAndPick(t)
  assert.equal(sends, 1)
  assert.equal(t.bubbleOn(1) === null, true)
})

test("A06-F-170 팔레트 화면 읽기 이름 (접근성) → \"이모티콘 팔레트\"", async () => {
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  await t.rightClick(t.myCard())
  assert.ok(t.palette() !== null, "팔레트가 안 열림")
  assert.equal(t.palette().getAttribute("aria-label"), "이모티콘 팔레트")
})

test("A06-F-171 키보드로 팔레트 열고 보냄 (접근성): 내 카드 초점 + 메뉴 키 → 팔레트, Enter → send_emoji 1번 [지금 동작]", async () => {
  const t = await openTable({ n: 6, me: 1, roles: { 0: "JOKER" }, phase: "DAY", view: "page" })
  const card = t.myCard()
  assert.ok(card.tabIndex >= 0, "내 카드에 키보드 초점이 안 감")
  card.focus()
  // 메뉴 키(Shift+F10)는 브라우저가 초점 요소에 contextmenu를 보냄 → 그대로 흉내
  await RTL.act(async () => {
    const notCancelled = RTL.fireEvent.keyDown(card, { key: "ContextMenu", code: "ContextMenu" })
    if (notCancelled) RTL.fireEvent.contextMenu(card)
  })
  await flush()
  const slot = slotFor(t, EMOJI.love)
  assert.ok(slot !== null, "팔레트가 안 열림")
  assert.ok(slot.tabIndex >= 0 && !slot.disabled, "칸에 키보드 초점이 안 감")
  slot.focus()
  // 단추에서 Enter = 누름 (브라우저 기본 동작)
  await RTL.act(async () => {
    const notCancelled = RTL.fireEvent.keyDown(slot, { key: "Enter", code: "Enter" })
    if (notCancelled) RTL.fireEvent.click(slot)
  })
  await flush()
  assert.equal(t.sentOf("send_emoji").length, 1)
})
