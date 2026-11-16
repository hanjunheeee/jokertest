// 다 내면 5초 뒤 판정 알림(phase_settle_started)을 넣었을 때 낮 마감·시간 줄 상태 글 화면 상태 시험
// 목록 A03-낮투표.md 번호 A03-F-047~064, 119~120 (F-052·055~057·120은 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, dayPhaseChanged, dayResolved, fakeSocket, fire, nextDay, renderEvents, resetAll, seat, settle, snapshot,
  selectInGameTimebarPhaseDeadline, selectInGameTimebarStatusLabel, useInGameStore, uuidOf,
} from "./dayVoteHarness.mjs"

const { computeInGameNightTurnRemainingSec } = await import("../../src/domains/game/ingame/utils/selectInGameNightTurnDeadline.js")

test.afterEach(() => resetAll())

const SETTLE_LABEL = "[5초 뒤 마감]"
const DAY_LABEL = "[낮-토론과 투표]"
const TRIBUNAL_LABEL = "[재판-진행 중]"
const NIGHT_LABEL = "[밤-활동 시간]"

// 6명 판 1일 낮 (기본 투표 중, 마감 40초 뒤)
async function dayGame({ dayPhase = "DAY_VOTE" } = {}) {
  const socket = fakeSocket()
  const voteEnd = Date.now() + 40_000
  seat({ n: 6, phase: "DAY", dayPhase, deadline: voteEnd })
  await renderEvents(socket)
  return { socket, voteEnd }
}
const now = () => useInGameStore.getState().state

test("A03-F-047 ① 낮 투표 중 받음 → 낮 마감이 새 값, 상태 글 [5초 뒤 마감]", async () => {
  const { socket } = await dayGame()
  const pulled = Date.now() + 5_000
  await fire(socket, "phase_settle_started", settle({ deadline: pulled }))
  assert.equal(now().dayPhaseDeadline, pulled)
  assert.equal(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL)
})

// A03-F-048~050 안 맞는 알림 → 그대로
;[
  ["A03-F-048", "② 다른 판 id", { gameId: "g-other" }, "DAY_VOTE"],
  ["A03-F-049", "③ 다른 날", { dayIndex: 2 }, "DAY_VOTE"],
  ["A03-F-050", "④ 토론 중", {}, "DAY_DISCUSSION"],
].forEach(([id, label, override, dayPhase]) => {
  test(`${id} ${label} 알림 → 마감·상태 글 그대로`, async () => {
    const { socket, voteEnd } = await dayGame({ dayPhase })
    await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000, ...override }))
    assert.equal(now().dayPhaseDeadline, voteEnd)
    assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
  })
})

test("A03-F-051 ⑤ 지금 마감보다 늦은 값 → 그대로", async () => {
  const { socket, voteEnd } = await dayGame()
  await fire(socket, "phase_settle_started", settle({ deadline: voteEnd + 10_000 }))
  assert.equal(now().dayPhaseDeadline, voteEnd)
  assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
})

test("A03-F-052 ⑥ 같은 알림 두 번 → 한 번만 바뀜 [지금 동작]", async () => {
  const { socket } = await dayGame()
  const payload = settle({ deadline: Date.now() + 5_000 })
  await fire(socket, "phase_settle_started", payload)
  const afterFirst = now()
  await fire(socket, "phase_settle_started", { ...payload })
  assert.equal(now(), afterFirst, "두 번째 알림은 판 상태를 새로 안 만듦")
  assert.equal(now().dayPhaseDeadline, payload.deadline)
})

test("A03-F-053 ⑦ 당긴 뒤 재판으로 넘어가면 [5초 뒤 마감] 없어짐", async () => {
  const { socket } = await dayGame()
  await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TRIBUNAL", alive: 6, abstain: 0, target: uuidOf(2), tribunalDeadline: Date.now() + 60_000 }))
  assert.equal(now().phase, "TRIBUNAL")
  assert.notEqual(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL)
})

test("A03-F-054 ⑧ 당긴 뒤 밤이 되면 [5초 뒤 마감] 없어짐", async () => {
  const { socket } = await dayGame()
  await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  assert.equal(now().phase, "NIGHT")
  assert.notEqual(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL)
})

// A03-F-055~057 마감 값이 틀린 알림 → 그대로 [지금 동작]
;[
  ["A03-F-055", "⑨ deadline 0", 0],
  ["A03-F-056", "⑩ deadline 음수", -5_000],
  ["A03-F-057", "⑪ deadline 글자", "1763280005000"],
].forEach(([id, label, deadline]) => {
  test(`${id} ${label} → 마감·상태 글 그대로 [지금 동작]`, async () => {
    const { socket, voteEnd } = await dayGame()
    await fire(socket, "phase_settle_started", settle({ deadline }))
    assert.equal(now().dayPhaseDeadline, voteEnd)
    assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
  })
})

test("A03-F-058 ⑫ 당긴 마감이 실린 스냅샷 → 남은 시간이 그 값 기준", async () => {
  await dayGame()
  const pulled = Date.now() + 4_000
  useInGameStore.getState().applySessionSnapshot(snapshot({ n: 6, extra: { dayPhaseDeadline: pulled } }))
  const deadline = selectInGameTimebarPhaseDeadline(now())
  assert.equal(deadline, pulled)
  assert.equal(computeInGameNightTurnRemainingSec(deadline, pulled - 4_000), 4)
})

// A03-F-059~064 시간 줄 상태 글
test("A03-F-059 ① 당김 → 상태 글 [5초 뒤 마감]", async () => {
  const { socket } = await dayGame()
  await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 3_000 }))
  assert.equal(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL)
})

test("A03-F-060 ② 당김 없는 투표 → 낮 기본 글", async () => {
  await dayGame()
  assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
})

test("A03-F-061 ③ 토론 → 낮 기본 글", async () => {
  await dayGame({ dayPhase: "DAY_DISCUSSION" })
  assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
})

test("A03-F-062 ④ 재판으로 넘어감 → 재판 글", async () => {
  const { socket } = await dayGame()
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(3), tribunalDeadline: Date.now() + 60_000 }))
  assert.equal(selectInGameTimebarStatusLabel(now()), TRIBUNAL_LABEL)
})

test("A03-F-063 ⑤ 밤 → 밤 글", async () => {
  const { socket } = await dayGame()
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TIE", alive: 6, abstain: 0 }))
  assert.equal(selectInGameTimebarStatusLabel(now()), NIGHT_LABEL)
})

test("A03-F-064 ⑥ 1일 당김 표시가 남은 채 2일 투표 → 낮 기본 글", async () => {
  const { socket } = await dayGame()
  await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await fire(socket, "day_phase_changed", dayPhaseChanged({ dayIndex: 2, deadline: Date.now() + 30_000 }))
  assert.equal(now().dayIndex, 2)
  assert.equal(now().dayPhase, "DAY_VOTE")
  assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
})

// A03-F-119~120 당김 알림 단계 안 맞음
test("A03-F-119 ① 낮인데 phase TRIBUNAL 당김 알림 → 마감·상태 글 그대로", async () => {
  const { socket, voteEnd } = await dayGame()
  await fire(socket, "phase_settle_started", { gameId: GAME, phase: "TRIBUNAL", dayIndex: 1, role: null, deadline: Date.now() + 5_000 })
  assert.equal(now().dayPhaseDeadline, voteEnd)
  assert.equal(now().tribunalDeadline ?? null, null)
  assert.equal(selectInGameTimebarStatusLabel(now()), DAY_LABEL)
})

test("A03-F-120 ② 알림 마감 = 지금 마감 → 마감 그대로·표시만 켬 [지금 동작]", async () => {
  const { socket, voteEnd } = await dayGame()
  await fire(socket, "phase_settle_started", settle({ deadline: voteEnd }))
  assert.equal(now().dayPhaseDeadline, voteEnd)
  assert.equal(selectInGameTimebarStatusLabel(now()), SETTLE_LABEL)
})
