// 재판 결과 알림 반영 시험: 유죄·무죄·취소·판 끝이 판 상태에 맞게 들어가고, 처형 직업은 안 들어가며, 같은 결과는 한 번만
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-042~055, 271~274
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable } from "./tribunalTable.mjs"

test.afterEach(resetTable)

// 재판 중인 판 (나는 1번 자리, 광대는 0번 자리)
async function tribunalTable(n, defendant = 3, options = {}) {
  const t = await openTable({ n, ...options })
  await t.openTribunal(defendant)
  return t
}

// 죽은 사람 자리 목록
const deadSeats = (t) => t.seats.map((_, i) => i).filter((i) => t.player(i)?.alive === false)

test("A04-F-042 6명 판: 유죄 결과 → 피고 죽음, 단계 NIGHT", async () => {
  const t = await tribunalTable(6)
  await t.resolve("GUILTY")
  assert.equal(t.player(3).alive, false)
  assert.equal(t.state().phase, "NIGHT")
})

test("A04-F-043 7명 판: 무죄 결과 → 피고 산 채, 단계 NIGHT", async () => {
  const t = await tribunalTable(7)
  await t.resolve("NOT_GUILTY")
  assert.equal(t.player(3).alive, true)
  assert.equal(t.state().phase, "NIGHT")
})

test("A04-F-044 8명 판: 취소(DEFENDANT_LEFT) 결과 → NIGHT, 피고 죽음 처리, 다른 사람은 처형 없음", async () => {
  const t = await tribunalTable(8)
  await t.resolve("CANCELLED")
  assert.equal(t.state().phase, "NIGHT")
  assert.equal(t.player(3).alive, false)
  assert.deepEqual(deadSeats(t), [3])
})

test("A04-F-045 6명 판: 취소 알림 먼저 → 탈락 알림 나중이어도 피고 죽음 한 번, 밤", async () => {
  const t = await tribunalTable(6)
  const eliminated = t.eliminatedPayload(3, { phase: "NIGHT" })
  await t.resolve("CANCELLED")
  await t.say("player_eliminated", eliminated)
  assert.deepEqual(deadSeats(t), [3])
  assert.equal(t.state().phase, "NIGHT")
})

test("A04-F-046 6명 판: 탈락 알림 먼저 → 취소 알림 나중이어도 피고 죽음 한 번, 밤", async () => {
  const t = await tribunalTable(6)
  await t.eliminate(3, { phase: "NIGHT" })
  await t.resolve("CANCELLED")
  assert.deepEqual(deadSeats(t), [3])
  assert.equal(t.state().phase, "NIGHT")
})

test("A04-F-047 5명 판: 결과 알림에 판 끝 칸 → 단계 ENDED·승패 값", async () => {
  const t = await tribunalTable(5, 0)
  await t.resolve("GUILTY", { ended: "CITIZEN" })
  assert.equal(t.state().phase, "ENDED")
  assert.equal(t.state().winResult.winner, "CITIZEN")
})

test("A04-F-048 5명 판: 판 끝 칸의 결과 닫힘 시각 → 상태에 그 값", async () => {
  const t = await tribunalTable(5, 0)
  const closesAt = Date.now() + 180_000
  await t.resolve("GUILTY", { ended: "CITIZEN", resultClosesAt: closesAt })
  assert.equal(t.state().resultClosesAt, closesAt)
})

test("A04-F-049 [지금 동작] 6명 판: 다른 gameId 결과는 무시", async () => {
  const t = await tribunalTable(6)
  const before = t.state()
  await t.say("tribunal_vote_resolved", t.resolvedPayload("GUILTY", { gameId: "a04-other-game" }))
  assert.equal(t.state(), before)
  assert.equal(t.state().phase, "TRIBUNAL")
})

test("A04-F-050 [지금 동작] 7명 판: 지금 피고와 다른 defendantUuid 결과는 무시", async () => {
  const t = await tribunalTable(7)
  const before = t.state()
  await t.say("tribunal_vote_resolved", t.resolvedPayload("GUILTY", { defendantIndex: 4 }))
  assert.equal(t.state(), before)
  assert.equal(t.player(4).alive, true)
})

test("A04-F-051 [지금 동작] 8명 판: 모르는 취소 이유 X는 무시", async () => {
  const t = await tribunalTable(8)
  const before = t.state()
  await t.say("tribunal_vote_resolved", { ...t.resolvedPayload("CANCELLED"), reason: "X" })
  assert.equal(t.state(), before)
  assert.equal(t.state().phase, "TRIBUNAL")
})

test("A04-F-052 10명 판: 결과 알림에 executedRole(처형된 사람 직업)이 실려 와도 판 상태 사람 목록에 안 들어감", async () => {
  // 광대 둘 중 하나 처형 → 판 계속, 서버는 이제 직업 칸을 안 싣지만 옛 모양으로 실려 와도 안 새는지 봄
  const t = await tribunalTable(10, 0, { jokers: [0, 5] })
  const payload = await t.resolve("GUILTY", { executedRole: "JOKER", counts: { guilty: 8, notGuilty: 1 } })
  assert.equal(payload.executedRole, "JOKER")
  assert.equal(t.state().phase, "NIGHT")
  for (const player of t.state().players) {
    assert.equal(Object.hasOwn(player, "role"), false, `${player.nickname} 줄에 직업 칸이 생김`)
  }
  assert.doesNotMatch(JSON.stringify(t.state().players), /JOKER/)
  assert.doesNotMatch(JSON.stringify(t.state().tribunal ?? null), /JOKER|guilty/)
})

test("A04-F-053 6명 판: 재판 결과 반영 뒤 tribunalDeadline 없음", async () => {
  const t = await tribunalTable(6)
  assert.ok(t.state().tribunalDeadline > 0, "재판 마감이 있던 판이어야 함")
  await t.resolve("NOT_GUILTY")
  assert.equal(t.state().tribunalDeadline ?? null, null)
})

test("A04-F-054 7명 판: 같은 유죄 결과 두 번 받아도 두 번째는 상태 그대로", async () => {
  const t = await tribunalTable(7)
  const payload = await t.resolve("GUILTY")
  const after = t.state()
  await t.say("tribunal_vote_resolved", payload)
  assert.equal(t.state(), after)
  assert.deepEqual(deadSeats(t), [3])
})

test("A04-F-055 8명 판: 내가 피고·유죄 → 본인 살아 있음 거짓", async () => {
  const t = await tribunalTable(8, 1)
  await t.resolve("GUILTY")
  assert.equal(t.player(1).uuid, t.me)
  assert.equal(t.player(1).alive, false)
})

// A04-F-271~274 표 수·직업 칸 없는 결과(지금 서버 모양)·피고 사망 결과·재판 마감 비움
test("A04-F-271 5명 판: counts·executedRole 칸 없는 유죄 결과(판 끝) → 반영됨, 재판 상태에 표 수 칸 없음", async () => {
  const t = await tribunalTable(5, 0)
  const payload = await t.resolve("GUILTY", { ended: "CITIZEN" })
  assert.equal(Object.hasOwn(payload, "counts"), false)
  assert.equal(Object.hasOwn(payload, "executedRole"), false)
  assert.equal(t.state().phase, "ENDED")
  assert.equal(t.state().tribunal.outcome, "GUILTY")
  assert.equal(t.state().tribunal.executedUuid, t.uuid(0))
  assert.equal(Object.hasOwn(t.state().tribunal, "counts"), false)
})

test("A04-F-272 7명 판: 피고 사망(DEFENDANT_DIED) 결과 → NIGHT, 피고 죽음, 재판 상태·재판 마감 없음, 다른 사람은 그대로", async () => {
  const t = await tribunalTable(7)
  const payload = await t.resolve("DEFENDANT_DIED")
  assert.equal(Object.hasOwn(payload, "reason"), false)
  assert.equal(t.state().phase, "NIGHT")
  assert.equal(t.player(3).alive, false)
  assert.deepEqual(deadSeats(t), [3])
  assert.equal(t.state().tribunal ?? null, null)
  assert.equal(t.state().tribunalDeadline ?? null, null)
})

test("A04-F-273 6명 판: 탈락 알림 먼저 → 피고 사망 결과 나중이어도 피고 죽음 한 번, 밤", async () => {
  const t = await tribunalTable(6)
  await t.eliminate(3, { phase: "NIGHT" })
  await t.resolve("DEFENDANT_DIED")
  assert.deepEqual(deadSeats(t), [3])
  assert.equal(t.state().phase, "NIGHT")
})

test("A04-F-274 8명 판: 취소 결과 반영 뒤에도 tribunalDeadline 없음", async () => {
  const t = await tribunalTable(8)
  assert.ok(t.state().tribunalDeadline > 0, "재판 마감이 있던 판이어야 함")
  await t.resolve("CANCELLED")
  assert.equal(t.state().tribunalDeadline ?? null, null)
})
