// [받은 버그 9] 기권이 최다 득표 이상이면 재판 없이 밤 — 화면 상태가 재판으로 안 가는지 시험
// 목록 A03-낮투표.md 번호 A03-F-101~105
import test from "node:test"
import assert from "node:assert/strict"
import {
  dayResolved, fakeSocket, fire, nextDay, renderEvents, resetAll, seat, useInGameStore, uuidOf,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// n명 판 투표 중에 판정 알림 받기 (2일이면 1일 밤을 지나 2일 투표까지 감)
async function resolveOn({ n, dayIndex = 1, spec }) {
  const socket = fakeSocket()
  seat({ n, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderEvents(socket)
  if (dayIndex === 2) {
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: n, abstain: n }))
    await fire(socket, "night_result_applied", nextDay({ n, deadline: Date.now() + 60_000 }))
    await fire(socket, "day_phase_changed", { gameId: "g-a03", dayIndex: 2, dayPhase: "DAY_VOTE", round: 1, dayPhaseDeadline: Date.now() + 30_000 })
  }
  await fire(socket, "day_vote_resolved", dayResolved({ ...spec, dayIndex }))
  return useInGameStore.getState().state
}

test("A03-F-101 ① 7명 1표 6기권 ABSTAIN_MAJORITY → 재판 상태 안 됨·밤", async () => {
  const state = await resolveOn({ n: 7, spec: { outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 } })
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.tribunal ?? null, null)
  assert.equal(state.dayVoteResolution?.outcome, "ABSTAIN_MAJORITY")
})

test("A03-F-102 ② 6명 3표 3기권 ABSTAIN_MAJORITY → 밤", async () => {
  const state = await resolveOn({ n: 6, spec: { outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 3 } })
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.tribunal ?? null, null)
})

test("A03-F-103 ③ 7명 4표 3기권 TRIBUNAL → 재판·피고 그 사람", async () => {
  const state = await resolveOn({ n: 7, spec: { outcome: "TRIBUNAL", alive: 7, abstain: 3, target: uuidOf(4), tribunalDeadline: Date.now() + 60_000 } })
  assert.equal(state.phase, "TRIBUNAL")
  assert.equal(state.tribunal?.defendantUuid, uuidOf(4))
})

test("A03-F-104 ④ 옛 규칙 모양(TRIBUNAL, 찍은 1·기권 6) → 버림, 재판으로 안 감", async () => {
  const state = await resolveOn({ n: 7, spec: { outcome: "TRIBUNAL", alive: 7, abstain: 6, target: uuidOf(4) } })
  assert.equal(state.phase, "DAY")
  assert.equal(state.tribunal ?? null, null)
  assert.equal(state.dayVoteResolution ?? null, null)
})

test("A03-F-105 ⑤ 2일 낮 7명 1표 6기권 ABSTAIN_MAJORITY → 밤", async () => {
  const state = await resolveOn({ n: 7, dayIndex: 2, spec: { outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 } })
  assert.equal(state.dayIndex, 2)
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.tribunal ?? null, null)
  assert.equal(state.dayVoteResolution?.outcome, "ABSTAIN_MAJORITY")
})
