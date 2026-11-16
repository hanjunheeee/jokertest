// 재판 창 채팅 시험(jsdom): 산 투표자·피고는 입력칸으로 낮 채팅을 보내고, 죽은 사람은 "죽은 사람끼리", 채팅이 통째로 사라지지 않음
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-228~231, A04-F-268
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useFakeClock, tick } from "./tribunalTable.mjs"

const { INTRO_HOLD_MS } = await import("../../src/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js")

test.afterEach(resetTable)

const { screen, within } = RTL

// 재판 창 안 채팅 칸·판 화면 채팅 틀
const tribunalChat = () => screen.queryByLabelText("최후의 반론 채팅")
const boardChat = () => screen.queryByRole("complementary", { name: "채팅" })

// 재판 중인 인게임 화면, 재판 창 채팅이 열릴 때까지 (처음 연출 1초 뒤 채팅이 옆에 열림)
async function tribunalChatPage(n, { defendant = 3, ...options } = {}) {
  useFakeClock()
  const t = await openTable({ n, view: "page", ...options })
  await t.openTribunal(defendant)
  await tick(INTRO_HOLD_MS)
  assert.ok(tribunalChat(), "재판 창 채팅이 안 열림")
  return t
}

// 재판 창 채팅 입력칸에 글을 쓰고 Enter
async function typeAndSend(t, text) {
  const input = within(tribunalChat()).getByLabelText("채팅 입력")
  await RTL.act(async () => {
    RTL.fireEvent.change(input, { target: { value: text } })
  })
  await RTL.act(async () => {
    RTL.fireEvent.keyDown(input, { key: "Enter" })
  })
}

// 서버 채팅 방송 한 줄 (낮·죽은 사람 채팅 모양)
const chatLine = (t, { from, text, id }) => ({
  gameId: t.gameId,
  senderUuid: t.uuid(from),
  messageId: id,
  nickname: t.nick(from),
  text,
  sentAt: Date.now(),
  dayIndex: t.dayIndex,
})

test("A04-F-228 6명 판: 산 투표자 → 재판 창 채팅 입력칸이 켜져 낮 채팅을 보냄", async () => {
  const t = await tribunalChatPage(6)
  const input = within(tribunalChat()).getByLabelText("채팅 입력")
  assert.equal(input.disabled, false)
  await typeAndSend(t, "피고 수상함")
  assert.deepEqual(t.sentOf("submit_game_chat_message"), [{ gameId: t.gameId, text: "피고 수상함" }])
})

test("A04-F-229 8명 판: 죽은 사람 → 재판 창 채팅에 \"죽은 사람끼리\" 표시", async () => {
  await tribunalChatPage(8, { dead: [1] })
  assert.ok(within(tribunalChat()).queryByText("죽은 사람끼리"), "죽은 사람끼리 표시 없음")
})

test("A04-F-230 7명 판: 피고 → 재판 창 채팅 입력칸이 켜져 보냄", async () => {
  const t = await tribunalChatPage(7, { defendant: 1 })
  const input = within(tribunalChat()).getByLabelText("채팅 입력")
  assert.equal(input.disabled, false)
  await typeAndSend(t, "저는 시민입니다")
  assert.equal(t.sentOf("submit_game_chat_message").length, 1)
})

test("A04-F-231 6명 판: 재판 진입 → 원래 채팅 틀은 숨고 재판 창 안 채팅이 보임", async () => {
  useFakeClock()
  const t = await openTable({ n: 6, view: "page" })
  assert.ok(boardChat(), "재판 전 판 화면 채팅 틀이 없음")
  await t.openTribunal(3)
  assert.equal(boardChat(), null, "재판 중에 판 화면 채팅 틀이 남음")
  await tick(INTRO_HOLD_MS)
  assert.ok(tribunalChat(), "재판 창 안 채팅이 없음")
  assert.ok(within(tribunalChat()).getByLabelText("채팅 입력"))
})

test("A04-F-268 6명 판: 산 사람 화면에 죽은 사람 채널 줄이 들어와도 안 그림 (낮 채팅 줄은 그림)", async () => {
  const t = await tribunalChatPage(6, { dead: [4] })
  await t.say("dead_chat_message_received", chatLine(t, { from: 4, text: "죽은사람말", id: "m-dead-1" }))
  await t.say("day_chat_message_received", chatLine(t, { from: 2, text: "산사람말", id: "m-day-1" }))
  const text = tribunalChat().textContent
  assert.match(text, /산사람말/)
  assert.doesNotMatch(text, /죽은사람말/)
})
