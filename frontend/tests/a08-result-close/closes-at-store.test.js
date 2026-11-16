// 결과 화면 닫힘 시각 받기 시험: 판 끝 알림 세 가지(밤 결과·재판 결과·탈락 알림)·스냅샷에서 resultClosesAt을 판 상태에 담음, 판이 안 끝났으면 없음
// 목록 docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md A08-F-006~011 (화면 상태)
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "../a07-result/resultKit.mjs"

test.afterEach(K.resetAll)

// 판 알림 받기만 붙인 화면 (판 화면은 자리 글)
const listen = () => K.renderAt("/ingame", K.h("p", null, "판 화면 (시험 자리)"))
const closesAtNow = () => K.useInGameStore.getState().state?.resultClosesAt ?? null

// 서버가 정한 닫힘 시각 (판 끝 시각 + 180초, 초 단위로 딱 떨어지게)
const closesAtOf = () => Math.floor(Date.now() / 1000) * 1000 + 180_000

test("A08-F-006 6명 판: 끝난 night_result_applied → 판 상태 resultClosesAt = 받은 값", async () => {
  const sock = K.installFakeSocket()
  // 광대 2, 5번은 앞서 죽음 → 이 밤 4번 죽음 → 2:2 광대 승
  const g = K.liveGame({ n: 6, me: 2, roles: ["JOKER", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN", "CITIZEN"], dead: [5], phase: "NIGHT", dayIndex: 1 })
  await listen()
  g.seats[4].alive = false
  const resultClosesAt = closesAtOf()
  await sock.serverSays("night_result_applied", {
    gameId: g.gameId, phase: "ENDED", dayIndex: 1,
    players: g.seats.map((s) => ({ uuid: s.uuid, isAlive: s.alive })),
    victimUuid: g.seats[4].uuid,
    deathReveals: [{ victimUuid: g.seats[4].uuid, source: "JOKER" }],
    doctorSaved: false,
    winResult: K.winResultOf(g.seats, "JOKER", 1),
    resultClosesAt,
  })
  assert.equal(K.useInGameStore.getState().state.phase, "ENDED")
  assert.equal(closesAtNow(), resultClosesAt)
})

test("A08-F-007 7명 판: 끝난 tribunal_vote_resolved → 판 상태 resultClosesAt = 받은 값", async () => {
  const sock = K.installFakeSocket()
  const g = K.liveGame({ n: 7, me: 1, phase: "DAY", dayIndex: 1 })
  // 재판 중 판으로 다시 넣음 (피고 = 0번 광대)
  K.useInGameStore.getState().clearGame()
  K.useInGameStore.getState().bootstrapSessionSnapshot(K.liveSnapshotOf({
    gameId: g.gameId, seats: g.seats, me: 1, phase: "TRIBUNAL", dayIndex: 1,
    over: {
      tribunalDeadline: Date.now() + 60_000,
      dayVoteResolution: { round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: g.seats[0].uuid, publicVoteCount: 7, publicAbstainCount: 0, revoteExcludedUuids: [] },
      tribunal: { defendantUuid: g.seats[0].uuid, resolved: false },
      progress: { kind: "TRIBUNAL", doneCount: 0, requiredCount: 6 },
      self: { uuid: g.meUuid, nickname: g.seats[1].nickname, role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false, hasSubmittedTribunalVote: false },
    },
  }), null)
  assert.equal(K.useInGameStore.getState().state.phase, "TRIBUNAL")
  await listen()
  g.seats[0].alive = false
  const resultClosesAt = closesAtOf()
  // 지금 서버가 보내는 모양 그대로 (표 수·처형된 사람 직업 칸 포함)
  await sock.serverSays("tribunal_vote_resolved", {
    gameId: g.gameId, dayIndex: 1, phase: "ENDED",
    defendantUuid: g.seats[0].uuid, outcome: "GUILTY", counts: { guilty: 5, notGuilty: 1 },
    executedUuid: g.seats[0].uuid, executedRole: "JOKER",
    players: g.seats.map((s) => ({ uuid: s.uuid, isAlive: s.alive })),
    winResult: K.winResultOf(g.seats, "CITIZEN", 1),
    resultClosesAt,
  })
  assert.equal(K.useInGameStore.getState().state.phase, "ENDED")
  assert.equal(closesAtNow(), resultClosesAt)
})

// 산 사람이 나가서 승부가 남 / 안 남 (서버 player_eliminated 모양)
function eliminatedPayload(g, victim, { ended, resultClosesAt }) {
  g.seats[victim].alive = false
  return {
    gameId: g.gameId,
    phase: ended ? "ENDED" : "DAY",
    dayIndex: 1,
    players: g.seats.map((s) => ({ uuid: s.uuid, alive: s.alive })),
    victimUuid: g.seats[victim].uuid,
    ...(ended ? { winResult: K.winResultOf(g.seats, "CITIZEN", g.seats.map((s, i) => (i === victim ? 0 : 1))), resultClosesAt } : {}),
  }
}

test("A08-F-008 8명 판: 끝난 player_eliminated(광대가 나감) → 판 상태 resultClosesAt = 받은 값", async () => {
  const sock = K.installFakeSocket()
  const g = K.liveGame({ n: 8, me: 3, phase: "DAY", dayIndex: 1 })
  await listen()
  const resultClosesAt = closesAtOf()
  await sock.serverSays("player_eliminated", eliminatedPayload(g, 0, { ended: true, resultClosesAt }))
  assert.equal(K.useInGameStore.getState().state.phase, "ENDED")
  assert.equal(closesAtNow(), resultClosesAt)
})

test("A08-F-009 10명 판: 승부 안 난 player_eliminated → resultClosesAt null", async () => {
  const sock = K.installFakeSocket()
  const g = K.liveGame({ n: 10, me: 3, phase: "DAY", dayIndex: 1 })
  await listen()
  await sock.serverSays("player_eliminated", eliminatedPayload(g, 5, { ended: false }))
  // 알림은 받아 5번이 죽은 것으로 바뀜 (받지도 않은 게 아님)
  const victim = K.useInGameStore.getState().state.players.find((p) => p.uuid === g.seats[5].uuid)
  assert.equal(victim.alive, false)
  assert.notEqual(K.useInGameStore.getState().state.phase, "ENDED")
  assert.equal(closesAtNow(), null)
})

test("A08-F-010 5명 판: 끝난 판 스냅샷 → 판 상태 resultClosesAt = 스냅샷 값", () => {
  const resultClosesAt = closesAtOf()
  K.endedGame({ n: 5, me: 1, resultClosesAt })
  assert.equal(closesAtNow(), resultClosesAt)
})

test("A08-F-011 6명 판: 낮 단계 스냅샷 → resultClosesAt null", () => {
  K.liveGame({ n: 6, me: 2, phase: "DAY", dayIndex: 1 })
  assert.equal(K.useInGameStore.getState().state.phase, "DAY")
  assert.equal(closesAtNow(), null)
})
