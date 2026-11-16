// 내 낮 표 제출 상태(낸 표시·고른 대상·오류·잠김) 화면 상태 시험 — 카드 메뉴·기권 단추로 내고 화면이 든 값을 봄
// 목록 A03-낮투표.md 번호 A03-F-065~076 (③·④·⑦·⑧은 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test from "node:test"
import assert from "node:assert/strict"
import {
  GAME, abstainButton, click, dayResolved, fakeSocket, fire, flush, nextDay, renderPanel, resetAll,
  seat, settle, useInGameStore, uuidOf, voteVia,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// 6명 판 1일 투표 중, 나는 0번 시민
async function votingPanel({ acks = {}, ...seatOptions } = {}) {
  const socket = fakeSocket({ acks })
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE", ...seatOptions })
  const sink = await renderPanel(socket)
  return { socket, sink }
}

test("A03-F-065 ① 표 ok → 낸 표시·대상 기억", async () => {
  const { socket, sink } = await votingPanel()
  assert.equal(await voteVia(2), true)
  assert.deepEqual(socket.sentOf("cast_day_vote").at(-1), { gameId: GAME, dayIndex: 1, targetId: uuidOf(2) })
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, uuidOf(2))
})

test("A03-F-066 ② 기권 ok → 낸 표시·대상 null", async () => {
  const { sink } = await votingPanel()
  await click(abstainButton())
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, null)
})

test("A03-F-067 ③ 실패 → 전에 낸 표 그대로 [지금 동작]", async () => {
  let call = 0
  const { sink } = await votingPanel({
    acks: { cast_day_vote: () => (++call === 1 ? { ok: true } : { ok: false, code: "TARGET_NOT_ALIVE", message: "대상이 살아 있지 않습니다." }) },
  })
  await voteVia(2)
  await voteVia(3)
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, uuidOf(2))
  assert.equal(sink.ctx.dayVoteError?.code, "TARGET_NOT_ALIVE")
})

test("A03-F-068 ④ VOTE_PERSIST_FAILED → 서버 글이 오류에 들어감 [지금 동작]", async () => {
  const { sink } = await votingPanel({
    acks: { cast_day_vote: { ok: false, code: "VOTE_PERSIST_FAILED", message: "투표 저장에 실패했습니다. 다시 시도해 주세요." } },
  })
  await voteVia(2)
  assert.equal(sink.ctx.dayVoteError?.code, "VOTE_PERSIST_FAILED")
  assert.equal(sink.ctx.dayVoteError?.message, "투표 저장에 실패했습니다. 다시 시도해 주세요.")
  assert.equal(sink.ctx.dayVoteHasSubmitted, false)
})

test("A03-F-069 ⑤ 당김(5초) 중에도 다시 보내기 됨", async () => {
  const { socket } = await votingPanel()
  await voteVia(2)
  await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
  assert.equal(await voteVia(3), true, "5초 중에도 다른 카드에 투표 항목이 있음")
  const sent = socket.sentOf("cast_day_vote")
  assert.equal(sent.length, 2)
  assert.equal(sent[1].targetId, uuidOf(3))
})

test("A03-F-070 ⑥ 5초 중 바꾸기 ok → 대상 바뀜", async () => {
  const { socket, sink } = await votingPanel()
  await voteVia(2)
  await fire(socket, "phase_settle_started", settle({ deadline: Date.now() + 5_000 }))
  await voteVia(4)
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, uuidOf(4))
})

test("A03-F-071 ⑦ 판정 뒤 DAY_VOTE_ALREADY_RESOLVED → 실패 상태, 뒤에 온 결과 그대로 [지금 동작]", async () => {
  const { socket, sink } = await votingPanel({
    acks: { cast_day_vote: { ok: false, code: "DAY_VOTE_ALREADY_RESOLVED", message: "이미 판정되었습니다." } },
  })
  await voteVia(2)
  assert.equal(sink.ctx.dayVoteError?.code, "DAY_VOTE_ALREADY_RESOLVED")
  assert.equal(sink.ctx.dayVoteHasSubmitted, false)
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 5 }))
  const state = useInGameStore.getState().state
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.dayVoteResolution?.outcome, "ABSTAIN_MAJORITY")
})

test("A03-F-072 ⑧ 스냅샷에 내 제출 기록이 있으면 그것 먼저 [지금 동작]", async () => {
  const { sink } = await votingPanel()
  useInGameStore.getState().applySessionSnapshot({
    ok: true, gameId: GAME, phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE", participationRevision: 0, selfProgressSeq: 0,
    players: useInGameStore.getState().state.players.map((p) => ({ uuid: p.uuid, nickname: p.nickname, isAlive: true, isConnected: true, themeIndex: p.themeIndex })),
    self: { uuid: uuidOf(0), nickname: "가람", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false, hasSubmittedDayVote: true, dayVoteTargetUuid: uuidOf(5), dayVoteRound: 1 },
  })
  await flush()
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, uuidOf(5))
})

test("A03-F-073 ⑨ 2일 낮 시작 → 1일에 낸 표시 지워짐", async () => {
  const { socket, sink } = await votingPanel()
  await voteVia(2)
  assert.equal(sink.ctx.dayVoteHasSubmitted, true)
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 6, abstain: 5 }))
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await fire(socket, "day_phase_changed", { gameId: GAME, dayIndex: 2, dayPhase: "DAY_VOTE", round: 1, dayPhaseDeadline: Date.now() + 30_000 })
  assert.equal(sink.ctx.dayVoteHasSubmitted, false)
  assert.equal(sink.ctx.dayVoteLastSubmittedTargetId, null)
  assert.equal(sink.ctx.dayVoteControlsEnabled, true)
})

test("A03-F-074 ⑩ 투표 중 내가 죽음 → 낮 표 잠김", async () => {
  const { socket, sink } = await votingPanel()
  assert.equal(sink.ctx.dayVoteControlsEnabled, true)
  await fire(socket, "player_eliminated", {
    gameId: GAME, phase: "DAY", dayIndex: 1, victimUuid: uuidOf(0),
    players: Array.from({ length: 6 }, (_, i) => ({ uuid: uuidOf(i), alive: i !== 0 })),
  })
  assert.equal(sink.ctx.dayVoteControlsEnabled, false)
  assert.equal(abstainButton()?.disabled ?? true, true)
})

test("A03-F-075 ⑪ 토론 → 낮 표 잠김", async () => {
  const { sink } = await votingPanel({ dayPhase: "DAY_DISCUSSION" })
  assert.equal(sink.ctx.dayVoteControlsEnabled, false)
  assert.equal(await voteVia(2), false, "토론 중엔 누를 투표 항목 없음")
})

test("A03-F-076 ⑫ 재판으로 넘어감 → 낮 표 잠김", async () => {
  const { socket, sink } = await votingPanel()
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TRIBUNAL", alive: 6, abstain: 0, target: uuidOf(3), tribunalDeadline: Date.now() + 60_000 }))
  assert.equal(sink.ctx.dayVoteControlsEnabled, false)
  assert.equal(abstainButton() === null, true)
})

