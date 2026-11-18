// 투표 중 투표 현황 창의 낸 사람 수("3 / 6명 투표함")와 재판 없이 밤일 때 밤 안내 아래 까닭 줄 — 화면 부품 시험 (사용자 결정 2026-11-18)
// 목록 A03-낮투표.md 번호 A03-F-258~272
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, NAMES, buttonByName, click, closeDawnReport, dayPhaseChanged, dayResolved, fakeSocket, fire, loginOnly,
  nextDay, renderPage, resetAll, seat, snapshot,
} from "./dayVoteHarness.mjs"
import { getNightReasonMsg } from "../../src/domains/game/ingame/constants/ingamePhaseEntrance.js"

test.afterEach(() => resetAll())

const statusDialog = () => document.querySelector('[role="dialog"][aria-label="투표 현황"]')
const progressLine = () => statusDialog()?.querySelector('[data-testid="vote-status-progress"]')?.textContent ?? null
const unresolvedLine = () => statusDialog()?.querySelector('[data-testid="vote-status-unresolved"]')?.textContent ?? null
const nightEntrance = () => document.querySelector('[data-ingame-phase-entrance="NIGHT"]')
const entranceReason = () => document.querySelector("[data-ingame-phase-entrance-reason]")?.textContent ?? null

// 서버가 표가 들어올 때마다 판 전원 각자에게 보내는 진행 알림 (내 칸은 안 냄 그대로)
let seq = 0
const progressOf = (doneCount, requiredCount, { dayIndex = 1 } = {}) => {
  seq += 1
  return {
    gameId: GAME,
    phase: "DAY",
    dayIndex,
    participationRevision: 0,
    selfProgressSeq: seq,
    progress: { kind: "DAY_VOTE", doneCount, requiredCount },
    self: { hasSubmittedDayVote: false, dayVoteTargetUuid: null, dayVoteRound: 1 },
  }
}

// n명 판 1일 투표 중 화면, 투표 현황 창을 열어 둠
async function openStatus({ n = 6, ...rest } = {}) {
  const socket = fakeSocket()
  seat({ n, phase: "DAY", dayPhase: "DAY_VOTE", ...rest })
  await renderPage(socket)
  await click(buttonByName("투표 현황 열기"))
  return socket
}

// 판정 알림 뒤 밤 시작 창
async function nightAfter(spec, n = 6) {
  const socket = fakeSocket()
  seat({ n, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderPage(socket)
  await fire(socket, "day_vote_resolved", dayResolved(spec))
  return socket
}

test("A03-F-258 6명 판 투표 중 남이 표 냄 → 창을 연 채로 '3 / 6명 투표함' → '4 / 6명 투표함', '집계 전'은 그대로", async () => {
  const socket = await openStatus()
  await fire(socket, "session_self_progress", progressOf(3, 6))
  assert.equal(unresolvedLine(), "집계 전")
  assert.equal(progressLine(), "3 / 6명 투표함")
  await fire(socket, "session_self_progress", progressOf(4, 6))
  assert.equal(progressLine(), "4 / 6명 투표함")
})

test("A03-F-259 투표 시작 알림에 숫자 0/6 실림 → 아무도 안 냈어도 '0 / 6명 투표함'", async () => {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION" })
  await renderPage(socket)
  await fire(socket, "day_phase_changed", {
    ...dayPhaseChanged({ deadline: Date.now() + 30_000 }),
    progress: { kind: "DAY_VOTE", doneCount: 0, requiredCount: 6 },
  })
  await click(buttonByName("투표 현황 열기"))
  assert.equal(progressLine(), "0 / 6명 투표함")
})

test("A03-F-260 진행 숫자 없음(서버가 아직 안 줌) → '집계 전'만, 숫자 줄 없음", async () => {
  await openStatus()
  assert.equal(unresolvedLine(), "집계 전")
  assert.equal(progressLine(), null)
})

test("A03-F-261 토론 중엔 숫자 줄 없음 (토론 준비 숫자는 투표 숫자가 아님)", async () => {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", state: { progress: { kind: "DAY_DISCUSSION", doneCount: 2, requiredCount: 6 } } })
  await renderPage(socket)
  await click(buttonByName("투표 현황 열기"))
  assert.equal(unresolvedLine(), "집계 전")
  assert.equal(progressLine(), null)
})

test("A03-F-262 1일 투표 숫자 6/6이 남은 채 2일 토론 → 숫자 줄 없음, 2일 투표 시작(0/6) → '0 / 6명 투표함'", async () => {
  const socket = await openStatus()
  await fire(socket, "session_self_progress", progressOf(6, 6))
  assert.equal(progressLine(), "6 / 6명 투표함")
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await closeDawnReport()
  if (!statusDialog()) await click(buttonByName("투표 현황 열기"))
  assert.equal(unresolvedLine(), "집계 전")
  assert.equal(progressLine(), null, "2일 토론에 1일 숫자가 남음")
  await fire(socket, "day_phase_changed", {
    ...dayPhaseChanged({ dayIndex: 2, deadline: Date.now() + 30_000 }),
    progress: { kind: "DAY_VOTE", doneCount: 0, requiredCount: 6 },
  })
  if (!statusDialog()) await click(buttonByName("투표 현황 열기"))
  assert.equal(progressLine(), "0 / 6명 투표함")
})

test("A03-F-263 판정 뒤엔 숫자 줄 대신 결과 칸 (투표 가능·기권·결과·재판 대상)", async () => {
  const socket = await openStatus()
  await fire(socket, "session_self_progress", progressOf(5, 6))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 4 }))
  if (!statusDialog()) await click(buttonByName("투표 현황 열기"))
  assert.equal(progressLine(), null)
  assert.equal(statusDialog().querySelector('[data-testid="vote-status-outcome"]')?.textContent, "기권이 많아 재판 없음")
})

test("A03-F-264 숫자 줄·창 어디에도 사람 이름 없음 (누가 냈는지 안 보임)", async () => {
  const socket = await openStatus()
  await fire(socket, "session_self_progress", progressOf(3, 6))
  const text = statusDialog().textContent
  for (const name of NAMES.slice(0, 6)) assert.equal(text.includes(name), false, `${name} 이름이 창에 나옴`)
})

test("A03-F-265 새로고침 스냅샷 숫자 2/5 (죽은 나) → '2 / 5명 투표함'", async () => {
  loginOnly()
  const socket = fakeSocket({
    acks: {
      get_session_snapshot: snapshot({
        dead: [0],
        extra: { dayPhaseDeadline: Date.now() + 30_000, progress: { kind: "DAY_VOTE", doneCount: 2, requiredCount: 5 } },
      }),
    },
  })
  await renderPage(socket)
  await click(buttonByName("투표 현황 열기"))
  assert.equal(progressLine(), "2 / 5명 투표함")
})

// A03-F-266~269 재판 없이 밤 → 밤 안내 아래 까닭 줄 (판정 결과 값마다)
;[
  ["A03-F-266", { outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 }, 7, "기권이 많아 재판이 열리지 않았습니다"],
  ["A03-F-267", { outcome: "ABSTAINED", alive: 6, abstain: 6 }, 6, "모두 기권하여 재판이 열리지 않았습니다"],
  ["A03-F-268", { outcome: "TIE", alive: 6, abstain: 0 }, 6, "최다 득표가 동점이라 재판이 열리지 않았습니다"],
  ["A03-F-269", { outcome: "DEFENDANT_DISCONNECTED", alive: 6, abstain: 1 }, 6, "재판 대상의 연결이 끊겨 재판이 열리지 않았습니다"],
].forEach(([id, spec, n, reason]) => {
  test(`${id} ${spec.outcome} 판정 → '밤이 되었습니다' 아래 '${reason}'`, async () => {
    await nightAfter(spec, n)
    assert.ok(nightEntrance(), "밤 시작 창 없음")
    assert.match(nightEntrance().textContent, /밤이 되었습니다/)
    assert.equal(entranceReason(), reason)
  })
})

test("A03-F-270 까닭 줄은 밤 안내·재판 없는 판정일 때만 (재판 회부·낮 안내·결과 없음 → 없음)", () => {
  assert.equal(getNightReasonMsg("NIGHT", "TRIBUNAL"), null)
  assert.equal(getNightReasonMsg("DAY", "ABSTAINED"), null)
  assert.equal(getNightReasonMsg("NIGHT", null), null)
  assert.equal(getNightReasonMsg("NIGHT", "ABSTAINED"), "모두 기권하여 재판이 열리지 않았습니다")
})

test("A03-F-271 전원 기권 밤 뒤 다음 낮 안내 → 까닭 줄 없음 (지난 판정이 안 남음)", async () => {
  const socket = await nightAfter({ outcome: "ABSTAINED", alive: 6, abstain: 6 })
  assert.equal(entranceReason(), "모두 기권하여 재판이 열리지 않았습니다")
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await closeDawnReport()
  assert.ok(document.querySelector('[data-ingame-phase-entrance="DAY"]'), "낮 시작 창 없음")
  assert.equal(entranceReason(), null)
})

test("A03-F-272 1일 숫자 6/6이 남은 채 2일 투표 시작 알림에 숫자 칸이 없음(옛 서버) → 옛 숫자 안 보임", async () => {
  const socket = await openStatus()
  await fire(socket, "session_self_progress", progressOf(6, 6))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await closeDawnReport()
  await fire(socket, "day_phase_changed", dayPhaseChanged({ dayIndex: 2, deadline: Date.now() + 30_000 }))
  if (!statusDialog()) await click(buttonByName("투표 현황 열기"))
  assert.equal(unresolvedLine(), "집계 전")
  assert.equal(progressLine(), null, "2일 투표에 1일 숫자가 남음")
})
