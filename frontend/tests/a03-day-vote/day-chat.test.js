// 낮 채팅 입력(150자·0.5초·빈 글·열림/막힘) 화면 부품 시험 — 인게임 화면 채팅 칸에 쳐서 보내 봄
// 목록 A03-낮투표.md 번호 A03-F-205~213 (⑧·⑨는 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  GAME, T0, buttonByName, click, fakeSocket, fire, firstDay, flush, renderPage, resetAll, rtl, seat, tick,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const input = () => document.querySelector("textarea")
const sendButton = () => buttonByName("채팅 보내기")
// 글 치기 (사람이 붙여 넣거나 친 값)
async function type(text) {
  await rtl.act(async () => { rtl.fireEvent.change(input(), { target: { value: text } }) })
  await flush()
}
async function typeAndSend(text) {
  await type(text)
  await click(sendButton())
}
const sentTexts = (socket) => socket.sentOf("submit_game_chat_message").map((p) => p.text)
const isOpen = (el) => el !== null && el.disabled !== true && el.closest("[inert]") === null

// 6명 판 1일 낮 화면 (기본 투표 중)
async function chatPage({ dayPhase = "DAY_VOTE", ...seatOptions } = {}) {
  const socket = fakeSocket({ acks: { submit_game_chat_message: { ok: true } } })
  seat({ n: 6, phase: "DAY", dayPhase, ...seatOptions })
  await renderPage(socket)
  return socket
}

test("A03-F-205 ① 149자 → 보냄", async () => {
  const socket = await chatPage()
  const text = "가".repeat(149)
  await typeAndSend(text)
  assert.deepEqual(socket.sentOf("submit_game_chat_message"), [{ gameId: GAME, text }])
})

test("A03-F-206 ② 150자 → 보냄", async () => {
  const socket = await chatPage()
  const text = "나".repeat(150)
  await typeAndSend(text)
  assert.deepEqual(sentTexts(socket), [text])
})

// 목록을 지금 값으로 고침: 입력칸은 151자째도 받고, 보낼 때 막음 (막히기는 함)
test("A03-F-207 ③ 151자째는 입력칸에 들어가고, 보내기를 눌러도 안 나감", async () => {
  const socket = await chatPage()
  await typeAndSend("다".repeat(151))
  assert.equal(input().value.length, 151)
  assert.deepEqual(sentTexts(socket), [])
})

// 목록을 지금 값으로 고침: 화면엔 0.5초 막기가 없음 (서버가 막음) → 둘 다 서버로 나감
test("A03-F-208 ④ 0.5초 안 두 번째 → 화면은 안 막고 보냄 (0.5초 막기는 서버 몫)", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 })
  const socket = await chatPage({ deadline: T0 + 60_000 })
  await typeAndSend("첫 말")
  await tick(300)
  await typeAndSend("둘째 말")
  assert.deepEqual(sentTexts(socket), ["첫 말", "둘째 말"])
})

test("A03-F-209 ⑤ 투표 단계 산 사람 → 입력 열림", async () => {
  await chatPage({ dayPhase: "DAY_VOTE" })
  assert.equal(isOpen(input()), true)
  assert.equal(isOpen(sendButton()), true)
})

test("A03-F-210 ⑥ 토론 산 사람 → 입력 열림", async () => {
  await chatPage({ dayPhase: "DAY_DISCUSSION" })
  assert.equal(isOpen(input()), true)
  assert.equal(isOpen(sendButton()), true)
})

test("A03-F-211 ⑦ '낮이 되었습니다' 창 동안 입력 막힘", async () => {
  const socket = fakeSocket({ acks: { submit_game_chat_message: { ok: true } } })
  seat({ n: 6, phase: "ROLE_REVEAL", dayIndex: 0 })
  await renderPage(socket)
  await fire(socket, "game_phase_changed", firstDay({ deadline: Date.now() + 60_000 }))
  assert.ok(document.querySelector('[data-ingame-phase-entrance="DAY"]'))
  assert.equal(isOpen(input()), false)
})

test("A03-F-212 ⑧ 빈 글 → 안 보냄 [지금 동작]", async () => {
  const socket = await chatPage()
  await click(sendButton())
  assert.deepEqual(sentTexts(socket), [])
})

test("A03-F-213 ⑨ 공백만 → 안 보냄 [지금 동작]", async () => {
  const socket = await chatPage()
  await typeAndSend("   \n  ")
  assert.deepEqual(sentTexts(socket), [])
})
