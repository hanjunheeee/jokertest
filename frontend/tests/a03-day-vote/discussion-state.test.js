// 낮 토론 상태(투표 시작 준비·토론→투표 알림·첫 낮·"낮이 되었습니다" 창 동안 잠김) 화면 상태 시험
// 목록 A03-낮투표.md 번호 A03-F-089~100 (②는 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, buttonByName, click, closeDawnReport, dayPhaseChanged, dayResolved, deferred, fakeSocket, fire, firstDay, nextDay,
  renderPage, resetAll, seat, useInGameStore,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const readyButton = () => document.querySelector('[data-ingame-phase-action="dayReady"]')
const entrance = () => document.querySelector('[data-ingame-phase-entrance]')
const state = () => useInGameStore.getState().state

// 6명 판 1일 토론 중 화면 (준비 답은 acks로)
async function discussionPage({ acks = {}, ...seatOptions } = {}) {
  const socket = fakeSocket({ acks })
  const deadline = Date.now() + 60_000
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", deadline, ...seatOptions })
  await renderPage(socket)
  return { socket, deadline }
}

// 역할 공개 중 화면 → 첫 낮 알림을 받음
async function firstDayPage() {
  const socket = fakeSocket()
  seat({ n: 6, phase: "ROLE_REVEAL", dayIndex: 0 })
  await renderPage(socket)
  const deadline = Date.now() + 60_000
  await fire(socket, "game_phase_changed", firstDay({ deadline }))
  return { socket, deadline }
}

test("A03-F-089 ① 준비 누름 → '준비 중...' → ok 답 → '준비 완료'", async () => {
  const ack = deferred()
  const { socket } = await discussionPage({ acks: { ready_for_day_vote: () => ack.promise } })
  assert.equal(readyButton().textContent, "투표 시작 준비")
  await click(readyButton())
  assert.equal(readyButton().textContent, "준비 중...")
  assert.deepEqual(socket.sentOf("ready_for_day_vote"), [{ gameId: GAME }])
  ack.resolve({ ok: true, readyCount: 1, requiredCount: 6 })
  await fire(socket, "noop", null)
  assert.equal(readyButton().textContent, "준비 완료")
  assert.equal(readyButton().disabled, true)
})

test("A03-F-090 ② 준비 실패 답 → 다시 누를 수 있음 [지금 동작]", async () => {
  const { socket } = await discussionPage({ acks: { ready_for_day_vote: { ok: false, code: "INVALID_DAY_PHASE", message: "지금은 준비할 수 없습니다." } } })
  await click(readyButton())
  assert.equal(readyButton().textContent, "투표 시작 준비")
  assert.equal(readyButton().disabled, false)
  await click(readyButton())
  assert.equal(socket.sentOf("ready_for_day_vote").length, 2)
})

test("A03-F-091 ③ 준비 뒤 투표로 넘어가면 준비 단추 상태 사라짐", async () => {
  const { socket } = await discussionPage()
  await click(readyButton())
  assert.equal(readyButton().textContent, "준비 완료")
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: Date.now() + 30_000 }))
  assert.equal(readyButton() === null, true)
})

test("A03-F-092 ④ 죽은 나 → 준비 못 함", async () => {
  const { socket } = await discussionPage({ dead: [0] })
  const button = readyButton()
  assert.ok(button === null || button.disabled === true)
  if (button) await click(button)
  assert.equal(socket.sentOf("ready_for_day_vote").length, 0)
})

test("A03-F-093 ⑤ day_phase_changed 투표 알림 → 단계 투표·투표 마감 시각", async () => {
  const { socket } = await discussionPage()
  const voteEnd = Date.now() + 30_000
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: voteEnd }))
  assert.equal(state().dayPhase, "DAY_VOTE")
  assert.equal(state().dayPhaseDeadline, voteEnd)
})

test("A03-F-094 ⑥ 다른 판의 day_phase_changed → 무시", async () => {
  const { socket, deadline } = await discussionPage()
  await fire(socket, "day_phase_changed", dayPhaseChanged({ gameId: "g-other", deadline: Date.now() + 30_000 }))
  assert.equal(state().dayPhase, "DAY_DISCUSSION")
  assert.equal(state().dayPhaseDeadline, deadline)
})

test("A03-F-095 ⑦ 다른 날의 day_phase_changed → 무시", async () => {
  const { socket, deadline } = await discussionPage()
  await fire(socket, "day_phase_changed", dayPhaseChanged({ dayIndex: 2, deadline: Date.now() + 30_000 }))
  assert.equal(state().dayPhase, "DAY_DISCUSSION")
  assert.equal(state().dayPhaseDeadline, deadline)
})

test("A03-F-096 ⑧ 역할 공개 끝 첫 낮 알림 → 1일 토론·토론 마감", async () => {
  const { deadline } = await firstDayPage()
  assert.equal(state().phase, "DAY")
  assert.equal(state().dayIndex, 1)
  assert.equal(state().dayPhase, "DAY_DISCUSSION")
  assert.equal(state().dayPhaseDeadline, deadline)
})

test("A03-F-097 ⑨ '낮이 되었습니다' 창 떠 있는 동안 조작 잠김", async () => {
  await firstDayPage()
  assert.ok(entrance(), "낮 시작 창이 떠 있음")
  assert.equal(readyButton().disabled, true)
  assert.ok(readyButton().closest("[inert]"), "판 화면이 눌리지 않게 막힘")
})

test("A03-F-098 ⑩ 창 닫으면 조작 열림", async () => {
  await firstDayPage()
  await click(buttonByName("확인"))
  assert.equal(entrance() === null, true)
  assert.equal(readyButton().disabled, false)
  assert.equal(readyButton().closest("[inert]") === null, true)
})

test("A03-F-099 ⑪ 창 떠 있어도 마감 시각 그대로(시간은 흐름)", async () => {
  const { deadline } = await firstDayPage()
  assert.ok(entrance())
  assert.equal(state().dayPhaseDeadline, deadline)
  await click(buttonByName("확인"))
  assert.equal(state().dayPhaseDeadline, deadline, "창을 닫아도 마감이 다시 안 늘어남")
})

test("A03-F-100 ⑫ 2일 낮 → 1일 준비 기록 지워짐", async () => {
  const { socket } = await discussionPage()
  await click(readyButton())
  assert.equal(readyButton().textContent, "준비 완료")
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: Date.now() + 30_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await closeDawnReport()
  await click(buttonByName("확인"))
  assert.equal(state().dayIndex, 2)
  assert.equal(readyButton().textContent, "투표 시작 준비")
  assert.equal(readyButton().disabled, false)
})
