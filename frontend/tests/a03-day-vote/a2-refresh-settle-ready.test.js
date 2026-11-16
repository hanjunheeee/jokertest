// 새 낮에 내 준비 기록이 스토어에서 지워지는지 + 5초 당김 중 새로고침·다시 묻기 스냅샷이 "[5초 뒤 마감]" 표시를 살리는지 시험
// 목록 A03-낮투표.md 번호 A03-F-245~253
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  GAME, T0, dayPhaseChanged, dayResolved, fakeSocket, fire, loginOnly, nextDay, renderEvents, renderPage, resetAll, seat, settle,
  snapshot, selectInGameTimebarStatusLabel, useInGameStore,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const SETTLE_LABEL = "[5초 뒤 마감]"
const DAY_LABEL = "[낮-토론과 투표]"
const now = () => useInGameStore.getState().state
const timebar = () => document.querySelector('[aria-label$="시간 흐름"]')
const clock = () => timebar()?.querySelector('[role="timer"]')?.textContent ?? null
const expandButton = () => timebar()?.querySelector("[data-ingame-timebar-expand]")

// 1일 토론 → 투표 → 전원 기권(밤) → 2일 낮
async function toSecondDay(socket) {
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: Date.now() + 30_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  assert.equal(now().dayIndex, 2, "2일로 못 감 (준비 잘못)")
  assert.equal(now().dayPhase, "DAY_DISCUSSION")
}

// ---------- 새 낮에 내 준비 기록 지움 (화면 훅이 막고 있어도 스토어가 스스로 지움) ----------
test("A03-F-245 6명 판: 1일 토론에 내 준비 기록 참(내 진행 알림) → 2일 낮이 되면 판 상태의 내 준비 기록이 참이 아님", async () => {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
  await renderEvents(socket)
  await fire(socket, "session_self_progress", { gameId: GAME, dayIndex: 1, participationRevision: 0, selfProgressSeq: 1, self: { isDayVoteReady: true } })
  assert.equal(now().self.isDayVoteReady, true, "준비 기록이 안 들어감 (준비 잘못)")
  await toSecondDay(socket)
  assert.notEqual(now().self.isDayVoteReady, true)
})

test("A03-F-246 6명 판: 1일 토론 중 새로고침(스냅샷의 내 준비 기록 참) → 2일 낮이 되면 판 상태의 내 준비 기록이 참이 아님", async () => {
  loginOnly()
  const socket = fakeSocket({
    acks: { get_session_snapshot: snapshot({ dayPhase: "DAY_DISCUSSION", extra: { dayPhaseDeadline: Date.now() + 60_000 }, self: { isDayVoteReady: true } }) },
  })
  await renderPage(socket)
  assert.equal(now().self.isDayVoteReady, true, "준비 기록이 안 들어감 (준비 잘못)")
  await toSecondDay(socket)
  assert.notEqual(now().self.isDayVoteReady, true)
})

// ---------- 5초 당김 중 새로고침: 스냅샷의 당김 표시 (결정 2026-11-16 아침 8번이 새로고침 뒤에도 지켜지게) ----------
// 서버 스냅샷 모양: phaseSettle { phase, dayIndex, role, deadline } (낮·재판은 role null, deadline은 그 단계 마감과 같음)
const settledSnapshot = (pulled, { mark = {}, dayPhase = "DAY_VOTE" } = {}) => snapshot({
  n: 6,
  dayPhase,
  extra: { dayPhaseDeadline: pulled, phaseSettle: { phase: "DAY", dayIndex: 1, role: null, deadline: pulled, ...mark } },
})

test("A03-F-247 6명 판: 5초 당김 중 새로고침(빈 화면에 스냅샷) → 낮 마감 = 당긴 값, 상태 글 [5초 뒤 마감]", async () => {
  loginOnly()
  const pulled = Date.now() + 3_000
  await renderEvents(fakeSocket())
  useInGameStore.getState().bootstrapSessionSnapshot(settledSnapshot(pulled))
  assert.equal(now()?.dayPhaseDeadline, pulled, "스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL)
})

test("A03-F-248 6명 판: 당김 없는 투표 중 새로고침(표시 칸 없음) → 낮 기본 글", async () => {
  loginOnly()
  const voteEnd = Date.now() + 20_000
  await renderEvents(fakeSocket())
  useInGameStore.getState().bootstrapSessionSnapshot(snapshot({ n: 6, extra: { dayPhaseDeadline: voteEnd } }))
  assert.equal(now()?.dayPhaseDeadline, voteEnd, "스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
})

// A03-F-249~251 지금 단계 것이 아닌 표시 → 그 칸만 버림 (스냅샷은 받음)
;[
  ["A03-F-249", "표시 마감이 낮 마감과 다름", { mark: { deadline: 1 } }],
  ["A03-F-250", "다른 날 표시", { mark: { dayIndex: 2 } }],
  ["A03-F-251", "토론 중인데 표시가 옴", { dayPhase: "DAY_DISCUSSION" }],
].forEach(([id, label, options]) => {
  test(`${id} 6명 판: ${label} → 스냅샷은 받고(마감 반영) 상태 글은 낮 기본 글`, async () => {
    loginOnly()
    const pulled = Date.now() + 3_000
    await renderEvents(fakeSocket())
    useInGameStore.getState().bootstrapSessionSnapshot(settledSnapshot(pulled, options))
    assert.equal(now()?.dayPhaseDeadline, pulled, "스냅샷이 안 들어감")
    assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
  })
})

test("A03-F-252 6명 판: 당김 알림을 받은 화면이 스냅샷을 다시 받음(표시 실림) → [5초 뒤 마감] 그대로", async () => {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE", deadline: Date.now() + 40_000 })
  await renderEvents(socket)
  const pulled = Date.now() + 5_000
  await fire(socket, "phase_settle_started", settle({ deadline: pulled }))
  assert.equal(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL, "당김이 안 들어감 (준비 잘못)")
  const before = now()
  useInGameStore.getState().applySessionSnapshot(settledSnapshot(pulled))
  assert.ok(now() !== before, "스냅샷이 안 들어감")
  assert.equal(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL)
})

test("A03-F-253 6명 판 화면: 5초 당김 중 새로고침 → 시간 바가 저절로 펼쳐지고 '[5초 뒤 마감]'과 남은 00:03", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 })
  loginOnly()
  const socket = fakeSocket({ acks: { get_session_snapshot: settledSnapshot(T0 + 3_000) } })
  await renderPage(socket)
  assert.equal(now()?.dayPhaseDeadline, T0 + 3_000, "스냅샷이 안 들어감")
  assert.equal(expandButton()?.getAttribute("aria-expanded"), "true")
  assert.ok(timebar().hasAttribute("data-ingame-phase-settle") || timebar().querySelector("[data-ingame-phase-settle]") !== null)
  assert.match(timebar().textContent, /\[5초 뒤 마감\]/)
  assert.equal(clock(), "00:03")
})
