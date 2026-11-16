// 재판 창 채팅 시험(jsdom, 인게임 화면 전체) — "최후의 반론" 채팅 칸, 피고·죽은 사람도 씀, 앞 낮 말 이어짐, 재판 끝 뒤 시민 칸 닫힘, 피고 못 찾음, 151자, 글자 그대로
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-148~155
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, startFakeClock, tick } from "./a06Kit.mjs"

const { INTRO_HOLD_MS } = await import("../../src/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js")

test.afterEach(resetTable)

const CLOSED_TEXT = "밤에는 귀족이 채팅을 쓸 수 없습니다"

// 7명 낮 판, 0번 광대, 5번 의사, 나 = me번 시민 → 재판 시작 알림(피고 자리) → 처음 연출 1초 뒤 채팅 열림
async function tribunalPage({ me = 1, defendant = 3, dead = [], uuid } = {}, before = async () => {}) {
  startFakeClock()
  const t = await openTable({ n: 7, me, roles: { 0: "JOKER", 5: "DOCTOR" }, dead, phase: "DAY", view: "page" })
  await before(t)
  await t.openTribunal(defendant, { uuid })
  await tick(INTRO_HOLD_MS)
  return t
}

test("A06-F-148 재판 시작 알림(나 산 배심) → 재판 창 안 \"최후의 반론\" 채팅 입력칸 있음", async () => {
  const t = await tribunalPage()
  assert.ok(t.tribunalChat() !== null, "재판 창 채팅이 없음")
  const input = t.input("tribunal")
  assert.ok(input !== null, "재판 창 채팅 입력칸이 없음")
  assert.equal(input.disabled, false)
})

test("A06-F-149 나 = 피고 → 재판 창 입력칸 있음, Enter → submit_game_chat_message", async () => {
  const t = await tribunalPage({ me: 3, defendant: 3 })
  assert.ok(t.input("tribunal") !== null, "피고 입력칸이 없음")
  await t.type("저는 시민입니다", "tribunal")
  await t.enter("tribunal")
  assert.deepEqual(t.sentOf("submit_game_chat_message"), [{ gameId: t.gameId, text: "저는 시민입니다" }])
})

test("A06-F-150 나 죽은 사람 → 재판 창 채팅에 \"죽은 사람끼리\", Enter → submit_game_chat_message", async () => {
  const t = await tribunalPage({ me: 4, dead: [4] })
  assert.equal(t.deadBadge("tribunal")?.textContent, "죽은 사람끼리")
  await t.type("죽어서 보는 중", "tribunal")
  await t.enter("tribunal")
  assert.deepEqual(t.sentOf("submit_game_chat_message"), [{ gameId: t.gameId, text: "죽어서 보는 중" }])
})

test("A06-F-151 낮 줄 3개 뒤 재판 → 재판 창 목록에 3줄 [지금 동작]", async () => {
  const t = await tribunalPage({}, async (table) => {
    await table.dayChat(2, "낮1")
    await table.dayChat(4, "낮2")
    await table.dayChat(6, "낮3")
  })
  const rows = t.rows("tribunal")
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((row) => /낮\d/.exec(row)?.[0]), ["낮1", "낮2", "낮3"])
})

test("A06-F-152 재판 결과(무죄) 뒤 밤, 나 시민 → 재판 창 닫히고 판 위 채팅 칸에 까닭 글", async () => {
  const t = await tribunalPage()
  await t.resolveTribunal("NOT_GUILTY")
  assert.equal(t.tribunalChat() === null, true, "재판 창 채팅이 남음")
  assert.equal(t.input("board") === null, true, "시민 입력칸이 남음")
  assert.equal(t.closedText("board")?.textContent, CLOSED_TEXT)
})

test("A06-F-153 피고 uuid가 명단에 없음 → 기본 그림 재판 창 + 채팅 칸 있음", async () => {
  const t = await tribunalPage({ defendant: 3, uuid: "a06-not-in-roster" })
  assert.ok(t.tribunalChat() !== null, "재판 창 채팅이 사라짐")
  assert.ok(t.input("tribunal") !== null, "재판 창 입력칸이 없음")
})

test("A06-F-154 재판 창에서 151자 → 길이 문구, 사건 0", async () => {
  const t = await tribunalPage()
  await t.type("가".repeat(151), "tribunal")
  await t.enter("tribunal")
  assert.equal(t.statusText("tribunal"), "메시지는 150자 이하로 입력해주세요.")
  assert.equal(t.sentOf("submit_game_chat_message").length, 0)
})

test("A06-F-155 재판 창 채팅 XSS: 받은 글 <img src=x onerror=alert(1)> → 글자 그대로, img 요소 없음", async () => {
  const t = await tribunalPage()
  const text = "<img src=x onerror=alert(1)>"
  await t.dayChat(2, text)
  const row = t.rowEls("tribunal")[0]
  assert.ok(row, "재판 창 목록에 줄이 없음")
  assert.ok(row.textContent.includes(text))
  assert.equal(row.querySelectorAll("img").length, 0)
})
