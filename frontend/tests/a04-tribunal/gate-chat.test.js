// 재판 창 채팅 시험(jsdom): 산 투표자·피고는 입력칸으로 낮 채팅을 보내고, 죽은 사람은 "죽은 사람끼리", 채팅이 통째로 사라지지 않음
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-228~231, A04-F-268
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useFakeClock, tick } from "./tribunalTable.mjs"

const { INTRO_HOLD_MS } = await import("../../src/domains/game/ingame/constants/tribunalPresentation/ingameTribunalPresentationLayout.js")
const { MotionGlobalConfig } = await import("framer-motion")
MotionGlobalConfig.skipAnimations = true

test.afterEach(() => {
  resetTable()
  try { window.localStorage.clear() } catch { /* 저장소 막힘 무시 */ }
})

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

test("A04-F-290 6명 판: 배포 기본 자리(timebar)에서도 재판 창 채팅 상단 명패·시계 상자에 단계 글과 남은 초가 채워짐", async () => {
  window.localStorage.setItem("joker.ingame.timerPlacement", "timebar")
  const t = await tribunalChatPage(6)
  const chat = tribunalChat()
  const strip = chat.querySelector("[data-ingame-chat-phase-timer-strip]")
  assert.ok(strip !== null, "재판 채팅 상단 명패·시계 칸이 비어 있음")
  assert.equal(strip.querySelector("p")?.textContent, "[재판-진행 중]")
  assert.match(strip.querySelector('[role="timer"]')?.textContent ?? "", /^\d{2}:\d{2}$/)
  await t.say("phase_settle_started", { gameId: t.gameId, phase: "TRIBUNAL", dayIndex: 1, role: null, deadline: Date.now() + 5_000 })
  assert.equal(strip.querySelector("p")?.textContent, "[5초 뒤 마감]")
})

test("A04-F-291 6명 판: 타이머 자리 timebar(배포 기본)면 보드·크게 보기 채팅은 빈 명패 없는 틀을 쓰고 chat-embedded 판 없음", async () => {
  window.localStorage.setItem("joker.ingame.timerPlacement", "timebar")
  await openTable({ n: 6, view: "page" })
  const board = boardChat()
  assert.ok(board !== null, "보드 채팅이 없음")
  assert.equal(board.querySelector("[data-ingame-phase-timer]"), null, "timebar 자리인데 채팅에 타이머 판이 생김")
  const frameSrcOf = (root) => decodeURIComponent(root.querySelector("img")?.getAttribute("src") ?? "").normalize("NFC")
  assert.equal(frameSrcOf(board).includes("채팅패널_리메이크.png"), false, "timebar 자리인데 빈 명패·시계 구멍이 있는 틀이 보임")
  assert.equal(frameSrcOf(board).includes("인게임-채팅창프레임2.webp"), true, "명패 없는 틀이 아님")

  const openBtn = [...board.querySelectorAll("button")].find((b) => b.textContent.trim() === "채팅 크게 보기")
  await RTL.act(async () => { RTL.fireEvent.click(openBtn) })
  const closeup = screen.getByRole("dialog", { name: "채팅 클로즈업" })
  const closeupImgs = [...closeup.querySelectorAll("img")].map((img) => decodeURIComponent(img.getAttribute("src") ?? "").normalize("NFC"))
  assert.equal(closeupImgs.some((src) => src.includes("채팅패널_리메이크.png")), false, "크게 보기에도 빈 명패·시계 구멍이 보임")
  assert.equal(closeupImgs.some((src) => src.includes("인게임-채팅창프레임2.webp")), true, "크게 보기 틀이 명패 없는 틀이 아님")
})

test("A04-F-292 6명 판: 타이머 자리 chat이면 보드 채팅은 리메이크 틀 + chat-embedded 명패·시계를 그림", async () => {
  window.localStorage.setItem("joker.ingame.timerPlacement", "chat")
  await openTable({ n: 6, view: "page" })
  const board = boardChat()
  const frameSrc = decodeURIComponent(board.querySelector("img")?.getAttribute("src") ?? "").normalize("NFC")
  assert.equal(frameSrc.includes("채팅패널_리메이크.png"), true, "chat 자리인데 리메이크 틀이 아님")
  assert.equal(board.querySelector('[data-ingame-phase-timer="chat-embedded"]') !== null, true, "chat 자리인데 채팅 타이머 판이 없음")
})
