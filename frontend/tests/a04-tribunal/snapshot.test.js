// 재판 중 스냅샷 시험: 새로고침·다시 붙음 때 재판 단계·피고·마감·내 표 여부가 들어가고, 옛 표시는 덮이며, 채팅 채널이 맞음
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-086~096, 275~278
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL } from "./tribunalTable.mjs"

const { resolveInGameChatSendChannel } = await import("../../src/domains/game/ingame/utils/inGameChatChannel.js")

test.afterEach(resetTable)

// 서버 판이 재판으로 넘어간 것으로 적어 둠 (그 알림은 이 화면이 못 받음)
function serverInTribunal(t, defendant, seconds = 60) {
  t.phase = "TRIBUNAL"
  t.defendantIndex = defendant
  t.tribunalDeadline = Date.now() + seconds * 1000
}

test("A04-F-086 7명 판: 재판 중 스냅샷 → 단계·피고·마감·내 표 여부 반영", async () => {
  const t = await openTable({ n: 7 })
  serverInTribunal(t, 3)
  await t.applySnapshot({ self: { hasSubmittedTribunalVote: true } })
  assert.equal(t.state().phase, "TRIBUNAL")
  assert.equal(t.state().tribunal.defendantUuid, t.uuid(3))
  assert.equal(t.state().tribunalDeadline, t.tribunalDeadline)
  assert.equal(t.self().hasSubmittedTribunalVote, true)
})

test("A04-F-087 6명 판: 낸 사람 스냅샷 hasSubmittedTribunalVote true → \"투표가 완료되었습니다.\"", async () => {
  const t = await openTable({ n: 6, view: "actions", phase: "TRIBUNAL", defendant: 3, selfExtra: { hasSubmittedTribunalVote: true } })
  assert.equal(t.self().hasSubmittedTribunalVote, true)
  assert.notEqual(RTL.screen.queryByText("투표가 완료되었습니다."), null)
  assert.equal(RTL.screen.queryByRole("button", { name: "유죄" }), null)
})

test("A04-F-088 [버그 8] 8명 판: 1일 참이 남은 상태 + 2일 재판 스냅샷 거짓 → 거짓 (본인 정보 통째로 바꿈)", async () => {
  const t = await openTable({ n: 8 })
  await t.openTribunal(3)
  await t.myProgress({ hasSubmittedTribunalVote: true }, { done: 1 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  // 1일 표시가 남은 화면 (지우기를 놓친 상태) + 다른 옛 칸 하나
  await t.patchSelf({ hasSubmittedTribunalVote: true, dayVoteDayIndex: 1 })
  await t.applySnapshot({ self: { hasSubmittedTribunalVote: false } })
  assert.equal(t.self().hasSubmittedTribunalVote, false)
  assert.equal(Object.hasOwn(t.self(), "dayVoteDayIndex"), false)
})

test("A04-F-089 5명 판: 밤 스냅샷엔 재판 칸·재판 마감 없음", async () => {
  const t = await openTable({ n: 5, phase: "TRIBUNAL", defendant: 3 })
  assert.equal(t.state().phase, "TRIBUNAL")
  // 서버는 이미 밤 (재판 결과 알림을 놓침)
  t.phase = "NIGHT"
  t.tribunalDeadline = null
  await t.applySnapshot()
  assert.equal(t.state().phase, "NIGHT")
  assert.equal(t.state().tribunal ?? null, null)
  assert.equal(t.state().tribunalDeadline ?? null, null)
})

test("A04-F-090 7명 판: 처형된 내가 다시 붙음 → 스냅샷 본인 죽음 → 재판 단추 켤 조건 거짓", async () => {
  const t = await openTable({ n: 7, view: "actions", phase: "TRIBUNAL", defendant: 3, dead: [1] })
  assert.equal(t.player(1).alive, false)
  assert.equal(t.ctx().tribunalVoteControlsEnabled, false)
})

test("A04-F-091 6명 판: 끊겼다 다시 붙은 피고 → 스냅샷 피고 = 나 → 피고 참, 재판 그대로", async () => {
  const t = await openTable({ n: 6, view: "actions", phase: "TRIBUNAL", defendant: 1 })
  assert.equal(t.state().phase, "TRIBUNAL")
  assert.equal(t.state().tribunal.defendantUuid, t.me)
  assert.equal(t.ctx().tribunalVoteIsDefendant, true)
})

test("A04-F-092 8명 판: 다시 붙은 안 낸 투표자 → 스냅샷 거짓 → 단추 켤 조건 참", async () => {
  const t = await openTable({ n: 8, view: "actions", phase: "TRIBUNAL", defendant: 3 })
  assert.equal(t.self().hasSubmittedTribunalVote, false)
  assert.equal(t.ctx().tribunalVoteControlsEnabled, true)
})

test("A04-F-093 10명 판: 스냅샷 사람 목록에 피고 줄이 없어도 재판 피고 uuid는 들어감", async () => {
  const t = await openTable({ n: 10 })
  serverInTribunal(t, 3)
  const snapshot = t.snapshot()
  const withoutDefendant = { ...snapshot, players: snapshot.players.filter((p) => p.uuid !== t.uuid(3)) }
  await RTL.act(async () => {
    t.store().clearGame()
    t.store().bootstrapSessionSnapshot(withoutDefendant, null)
  })
  assert.equal(t.state()?.tribunal?.defendantUuid, t.uuid(3))
})

test("A04-F-094 7명 판: 재판 중 산 투표자의 보낼 채팅 채널 = 낮", async () => {
  const t = await openTable({ n: 7 })
  await t.openTribunal(3)
  assert.equal(resolveInGameChatSendChannel(t.state()), "DAY")
})

test("A04-F-095 6명 판: 재판 중 피고의 보낼 채팅 채널 = 낮", async () => {
  const t = await openTable({ n: 6 })
  await t.openTribunal(1)
  assert.equal(resolveInGameChatSendChannel(t.state()), "DAY")
})

test("A04-F-096 8명 판: 재판 중 죽은 사람의 보낼 채팅 채널 = 죽은 사람 채널", async () => {
  const t = await openTable({ n: 8, dead: [1] })
  await t.openTribunal(3)
  assert.equal(resolveInGameChatSendChannel(t.state()), "DEAD")
})

// A04-F-275~278 스냅샷의 재판 칸: 표 수 없이도 받음·취소/피고 사망으로 닫힌 재판도 받음·밤에 실려 오면 그 칸만 버림
// 재판으로 끝난 판 스냅샷 (서버 모양: 재판 칸에 결과·처형된 사람만, 표 수 없음)
function endedSnapshot(t, tribunal) {
  const winResult = t.resolvedPayload("GUILTY", { ended: "CITIZEN" }).winResult
  t.phase = "ENDED"
  t.tribunalDeadline = null
  const base = t.snapshot()
  return {
    ...base,
    winResult,
    resultClosesAt: Date.now() + 180_000,
    dayVoteResolution: {
      round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: tribunal.defendantUuid,
      publicVoteCount: base.players.length, publicAbstainCount: 0, revoteExcludedUuids: [],
    },
    tribunal,
  }
}

test("A04-F-275 5명 판: 재판으로 끝난 판 스냅샷의 재판 칸에 표 수(counts)가 없어도 스냅샷을 받음", async () => {
  const t = await openTable({ n: 5 })
  await t.openTribunal(0)
  const response = endedSnapshot(t, { defendantUuid: t.uuid(0), resolved: true, outcome: "GUILTY", executedUuid: t.uuid(0) })
  await RTL.act(async () => {
    t.store().applySessionSnapshot(response, null)
  })
  assert.equal(t.state().phase, "ENDED")
  assert.equal(t.state().tribunal.outcome, "GUILTY")
  assert.equal(t.state().tribunal.executedUuid, t.uuid(0))
  assert.equal(Object.hasOwn(t.state().tribunal, "counts"), false)
})

for (const [i, outcome] of ["CANCELLED", "DEFENDANT_DIED"].entries()) {
  test(`A04-F-${276 + i} 6명 판: 끝난 판 스냅샷의 재판 결과 ${outcome}(처형 없음) → 스냅샷을 받음`, async () => {
    const t = await openTable({ n: 6 })
    await t.openTribunal(3)
    const response = endedSnapshot(t, { defendantUuid: t.uuid(3), resolved: true, outcome, executedUuid: null })
    await RTL.act(async () => {
      t.store().applySessionSnapshot(response, null)
    })
    assert.equal(t.state().phase, "ENDED")
    assert.equal(t.state().tribunal.outcome, outcome)
    assert.equal(t.state().tribunal.executedUuid, null)
  })
}

test("A04-F-278 7명 판: 밤 스냅샷에 재판 칸이 실려 와도 스냅샷은 받고 재판 칸만 버림, 낮 판정 결과는 받음", async () => {
  const t = await openTable({ n: 7, phase: "TRIBUNAL", defendant: 3 })
  t.phase = "NIGHT"
  t.tribunalDeadline = null
  const base = t.snapshot()
  const response = {
    ...base,
    dayVoteResolution: {
      round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: t.uuid(3),
      publicVoteCount: base.players.length, publicAbstainCount: 0, revoteExcludedUuids: [],
    },
    tribunal: { defendantUuid: t.uuid(3), resolved: true, outcome: "NOT_GUILTY", executedUuid: null },
  }
  await RTL.act(async () => {
    t.store().applySessionSnapshot(response, null)
  })
  assert.equal(t.state().phase, "NIGHT")
  assert.equal(t.state().tribunal ?? null, null)
  assert.equal(t.state().dayVoteResolution?.outcome, "TRIBUNAL")
  assert.equal(t.state().dayVoteResolution?.tribunalTargetUuid, t.uuid(3))
})
