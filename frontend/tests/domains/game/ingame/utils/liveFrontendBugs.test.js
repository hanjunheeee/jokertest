import test from "node:test"
import assert from "node:assert/strict"
import { buildNightActionTargets } from "../../../../../src/domains/game/ingame/utils/actionTargets.js"
import { buildDayVoteTargets } from "../../../../../src/domains/game/ingame/utils/actionTargets.js"
import { parseDayVoteResolvedPayload, computeDayVoteResolveAckPatch } from "../../../../../src/domains/game/ingame/hooks/useInGameActionPanel.js"
import { bootstrapSessionSnapshotPure } from "../../../../../src/domains/game/ingame/utils/snapshot/applySnapshot.js"
import { useInGameStore } from "../../../../../src/domains/game/ingame/store/ingameStore.js"
import { getPlayerDisplayName } from "../../../../../src/domains/game/ingame/utils/getPlayerDisplayName.js"

const players = ["p1", "p2", "p3", "p4", "p5"].map((id) => ({
  id, uuid: id, nickname: id.toUpperCase(), status: "alive", alive: true,
}))
// 재투표 삭제 뒤 동점 판정: 서버는 옛 칸(round 1·빈 제외 명단)을 계속 실어 보냄 (사용자 결정 2026-11-09)
const tie = {
  gameId: "live-regression", dayIndex: 2, phase: "NIGHT", round: 1,
  outcome: "TIE", tribunalTargetUuid: null, publicVoteCount: 5,
  publicAbstainCount: 1, excludedUuids: [], revoteExcludedUuids: [],
}
const revote = { ...tie, phase: "DAY", outcome: "REVOTE", revoteExcludedUuids: ["p2", "p3"] }
function snapshot() {
  return {
    ok: true, gameId: tie.gameId, phase: "TRIBUNAL", dayIndex: 2,
    players: players.map((p) => ({ uuid: p.id, nickname: p.nickname, isAlive: true, isConnected: true })),
    self: { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    dayVoteResolution: { round: 1, outcome: "TRIBUNAL", tribunalTargetUuid: "p2",
      publicVoteCount: 5, publicAbstainCount: 1, revoteExcludedUuids: [] },
    tribunal: { defendantUuid: "p2", resolved: false },
  }
}
test("BUG-082: WH can target dead players; other roles cannot", () => {
  const targets = [...players, { id: "dead", nickname: "Dead", status: "dead" }]
  const wh = buildNightActionTargets(targets, { localPlayerId: "p1", role: "WITCH_HUNTER" })
  assert.equal(wh.find((p) => p.id === "dead").selectable, true)
  assert.equal(wh.find((p) => p.id === "p2").selectable, false)
  const doctor = buildNightActionTargets(targets, { localPlayerId: "p1", role: "DOCTOR", selfTargetAllowed: true })
  assert.equal(doctor.find((p) => p.id === "dead").selectable, false)
  assert.equal(doctor.find((p) => p.id === "p1").selectable, true)
})
test("재투표 삭제: 동점 판정은 옛 빈 칸이 실려도 받고 바로 밤, 요청 응답도 끝남(resolved)", () => {
  const parsed = parseDayVoteResolvedPayload({ payload: tie, gameId: tie.gameId, dayIndex: 2 })
  assert.equal(parsed.outcome, "TIE")
  assert.equal(parsed.phase, "NIGHT")
  assert.equal(Object.hasOwn(parsed, "revoteExcludedUuids"), false)
  assert.equal(computeDayVoteResolveAckPatch({ ok: true, outcome: "TIE" }).status, "resolved")
})
test("재투표 삭제: REVOTE 판정 방송은 안 받음 (서버가 더는 안 보냄)", () => {
  assert.equal(parseDayVoteResolvedPayload({ payload: revote, gameId: revote.gameId, dayIndex: 2 }), null)
})
test("재투표 삭제: 스토어는 REVOTE를 무시하고 동점이면 밤으로", () => {
  useInGameStore.setState({ gameId: tie.gameId, state: { phase: "DAY", dayIndex: 2,
    dayPhase: "DAY_VOTE", players, self: { uuid: "p1", hasActedThisPhase: true } } })
  const before = useInGameStore.getState().state
  useInGameStore.getState().applyDayVoteResolvedToPhase(tie.gameId, 2, revote)
  assert.equal(useInGameStore.getState().state, before)
  useInGameStore.getState().applyDayVoteResolvedToPhase(tie.gameId, 2, tie)
  const state = useInGameStore.getState().state
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.dayVoteResolution.outcome, "TIE")
  assert.equal(Object.hasOwn(state, "dayVoteExcludedUuids"), false)
})
test("재투표 삭제: 스냅샷은 옛 빈 제외 칸이 와도 받고 투표 번호는 1, 제외 명단 칸은 안 만듦", () => {
  const patch = bootstrapSessionSnapshotPure(snapshot())
  assert.ok(patch)
  assert.equal(patch.state.dayVoteRound, 1)
  assert.equal(Object.hasOwn(patch.state, "dayVoteExcludedUuids"), false)
  assert.equal(patch.state.dayVoteResolution.outcome, "TRIBUNAL")
})
test("낮 투표 대상은 산 다른 사람 전부 (재투표 제외 없음)", () => {
  assert.deepEqual(buildDayVoteTargets(players, { localPlayerId: "p1" }).map((p) => p.id), ["p2", "p3", "p4", "p5"])
})
test("BUG-080: defendant display resolves the public nickname, not raw UUID", () => {
  assert.equal(getPlayerDisplayName(players, "p3"), "P3")
  assert.equal(getPlayerDisplayName(players, "missing-private-id"), "알 수 없는 참가자")
  assert.equal(getPlayerDisplayName(players, null), "없음")
})
test("다음 낮이면 지난 판정이 지워지고 투표 번호는 1", () => {
  useInGameStore.setState(bootstrapSessionSnapshotPure(snapshot()))
  useInGameStore.setState((current) => ({ state: { ...current.state, phase: "NIGHT", tribunal: null } }))
  useInGameStore.getState().applyNightResultAppliedPayload({ gameId: tie.gameId,
    phase: "DAY", dayIndex: 3, players: players.map((p) => ({ uuid: p.uuid, alive: true })) })
  const state = useInGameStore.getState().state
  assert.equal(state.dayIndex, 3)
  assert.equal(state.dayVoteRound, 1)
  assert.equal(Object.hasOwn(state, "dayVoteExcludedUuids"), false)
  assert.equal(state.dayVoteResolution, null)
})
