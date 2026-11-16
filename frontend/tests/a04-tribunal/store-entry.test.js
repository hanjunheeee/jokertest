// 재판 진입 알림 반영 시험: 낮 투표 판정(재판)이 오면 단계·피고·재판 마감이 들어가고 낮 마감·"이미 함"이 풀림
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-034~041
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable } from "./tribunalTable.mjs"

test.afterEach(resetTable)

test("A04-F-034 6명 판: day_vote_resolved TRIBUNAL → 단계 TRIBUNAL·피고·tribunalDeadline = 받은 값", async () => {
  const t = await openTable({ n: 6 })
  const payload = await t.openTribunal(4, { seconds: 45 })
  assert.equal(t.state().phase, "TRIBUNAL")
  assert.equal(t.state().tribunal.defendantUuid, t.uuid(4))
  assert.equal(t.state().tribunalDeadline, payload.tribunalDeadline)
})

test("A04-F-035 7명 판: 재판 진입 때 낮 마감 시각 칸 비움", async () => {
  const t = await openTable({ n: 7 })
  assert.ok(t.state().dayPhaseDeadline > 0, "낮 마감이 있던 판이어야 함")
  await t.openTribunal(3)
  assert.equal(t.state().dayPhaseDeadline, null)
})

test("A04-F-036 8명 판: 낮에 표 내 \"이번 단계에 이미 함\" 참 → 재판 진입 → 거짓", async () => {
  const t = await openTable({ n: 8, selfExtra: { hasActedThisPhase: true, hasSubmittedDayVote: true, dayVoteTargetUuid: null } })
  assert.equal(t.self().hasActedThisPhase, true)
  await t.openTribunal(3)
  assert.equal(t.self().hasActedThisPhase, false)
})

test("A04-F-037 [지금 동작] 5명 판: 다른 gameId 재판 진입 알림은 무시", async () => {
  const t = await openTable({ n: 5 })
  const before = t.state()
  await t.say("day_vote_resolved", t.tribunalEntryPayload(3, { gameId: "a04-other-game" }))
  assert.equal(t.state(), before)
  assert.equal(t.state().phase, "DAY")
})

test("A04-F-038 [지금 동작] 6명 판: 2일 낮에 1일 dayIndex 재판 진입 알림은 무시", async () => {
  const t = await openTable({ n: 6 })
  await t.openTribunal(3)
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  const before = t.state()
  await t.say("day_vote_resolved", t.tribunalEntryPayload(4, { dayIndex: 1 }))
  assert.equal(t.state(), before)
  assert.equal(t.state().phase, "DAY")
  assert.equal(t.state().dayIndex, 2)
})

;[
  ["A04-F-039", "TIE"],
  ["A04-F-040", "ABSTAIN_MAJORITY"],
  ["A04-F-041", "ABSTAINED"],
].forEach(([id, outcome]) => {
  test(`${id} 7명 판: 낮 판정 ${outcome} → 단계 NIGHT, 재판 칸 없음`, async () => {
    const t = await openTable({ n: 7 })
    await t.say("day_vote_resolved", t.nightOutcomePayload(outcome))
    assert.equal(t.state().phase, "NIGHT")
    assert.equal(t.state().tribunal ?? null, null)
  })
})
