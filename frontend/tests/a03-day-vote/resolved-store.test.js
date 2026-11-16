// 낮 판정 알림을 받은 뒤 스토어 판 상태(단계·피고·재판 마감) 화면 상태 시험
// 목록 A03-낮투표.md 번호 A03-F-041~046
import test from "node:test"
import assert from "node:assert/strict"
import {
  dayResolved, fakeSocket, fire, renderEvents, resetAll, seat, useInGameStore, uuidOf,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// 6명 판 1일 낮 투표 중에 판정 알림 하나 받기
async function resolveWith(spec) {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderEvents(socket)
  await fire(socket, "day_vote_resolved", dayResolved(spec))
  return useInGameStore.getState().state
}

test("A03-F-041 ① TRIBUNAL(6명 몰표) → 단계 재판·피고 그 사람", async () => {
  const state = await resolveWith({ outcome: "TRIBUNAL", alive: 6, abstain: 0, target: uuidOf(2), tribunalDeadline: Date.now() + 60_000 })
  assert.equal(state.phase, "TRIBUNAL")
  assert.equal(state.tribunal?.defendantUuid, uuidOf(2))
  assert.equal(state.dayVoteResolution?.outcome, "TRIBUNAL")
})

// A03-F-042~044 밤으로 가는 결과 셋
;[
  ["A03-F-042", "②", { outcome: "TIE", alive: 6, abstain: 0 }],
  ["A03-F-043", "③", { outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 5 }],
  ["A03-F-044", "④", { outcome: "ABSTAINED", alive: 6, abstain: 6 }],
].forEach(([id, mark, spec]) => {
  test(`${id} ${mark} ${spec.outcome} → 단계 밤·피고 없음`, async () => {
    const state = await resolveWith(spec)
    assert.equal(state.phase, "NIGHT")
    assert.equal(state.dayIndex, 1)
    assert.equal(state.tribunal ?? null, null)
    assert.equal(state.dayVoteResolution?.outcome, spec.outcome)
    assert.equal(state.dayVoteResolution?.tribunalTargetUuid, null)
  })
})

test("A03-F-045 ⑤ 재판 결과에 tribunalDeadline 있음 → 재판 마감 시각이 그 값", async () => {
  const deadline = Date.now() + 45_000
  const state = await resolveWith({ outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(3), tribunalDeadline: deadline })
  assert.equal(state.tribunalDeadline, deadline)
})

test("A03-F-046 ⑥ 재판 결과에 tribunalDeadline 없음 → 재판 마감 비워 둠(스냅샷이 채움)", async () => {
  const state = await resolveWith({ outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(3) })
  assert.equal(state.phase, "TRIBUNAL")
  assert.equal(state.tribunalDeadline, null)
})
