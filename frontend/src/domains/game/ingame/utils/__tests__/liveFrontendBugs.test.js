import test from "node:test"
import assert from "node:assert/strict"
import { buildNightActionTargets } from "../buildNightActionTargets.js"
import { buildDayVoteTargets } from "../buildDayVoteTargets.js"
import { parseDayVoteResolvedPayload, computeDayVoteResolveAckPatch } from "../../hooks/useInGameActionPanel.js"
import { bootstrapSessionSnapshotPure } from "../../store/applySessionSnapshot.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { getPlayerDisplayName } from "../getPlayerDisplayName.js"

const players = ["p1", "p2", "p3", "p4", "p5"].map((id) => ({
  id, uuid: id, nickname: id.toUpperCase(), status: "alive", alive: true,
}))
const revote = {
  gameId: "live-regression", dayIndex: 2, phase: "DAY", round: 1,
  outcome: "REVOTE", tribunalTargetUuid: null, publicVoteCount: 5,
  publicAbstainCount: 1, revoteExcludedUuids: ["p2", "p3"],
}
function snapshot() {
  return {
    ok: true, gameId: revote.gameId, phase: "DAY", dayIndex: 2, dayPhase: "DAY_VOTE",
    players: players.map((p) => ({ uuid: p.id, nickname: p.nickname, isAlive: true, isConnected: true })),
    self: { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    dayVoteResolution: { round: 1, outcome: "REVOTE", tribunalTargetUuid: null,
      publicVoteCount: 5, publicAbstainCount: 1, revoteExcludedUuids: ["p2", "p3"] },
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
test("BUG-083: parse REVOTE and retain round/excluded candidates", () => {
  const parsed = parseDayVoteResolvedPayload({ payload: revote, gameId: revote.gameId, dayIndex: 2 })
  assert.deepEqual(parsed, revote)
  assert.notEqual(parsed.revoteExcludedUuids, revote.revoteExcludedUuids)
  assert.equal(computeDayVoteResolveAckPatch({ ok: true, outcome: "REVOTE" }).status, "idle")
})
test("BUG-083: excluded candidates cannot receive a second-round vote", () => {
  const targets = buildDayVoteTargets(players, { localPlayerId: "p1", excludedUuids: ["p2", "p3"] })
  assert.deepEqual(targets.map((p) => p.id), ["p4", "p5"])
})
test("BUG-083: second round is kept; duplicate first-round resolution is ignored", () => {
  useInGameStore.setState({ gameId: revote.gameId, state: { phase: "DAY", dayIndex: 2,
    dayPhase: "DAY_VOTE", players, self: { uuid: "p1", hasActedThisPhase: true } } })
  const apply = () => useInGameStore.getState().applyDayVoteResolvedToPhase(revote.gameId, 2, revote)
  apply()
  const state = useInGameStore.getState().state
  assert.equal(state.dayVoteRound, 2)
  assert.equal(state.phase, "DAY")
  assert.equal(state.self.hasActedThisPhase, false)
  assert.deepEqual(state.dayVoteExcludedUuids, ["p2", "p3"])
  apply()
  assert.equal(useInGameStore.getState().state, state)
  useInGameStore.getState().applyDayVoteResolvedToPhase(revote.gameId, 2, {
    outcome: "TRIBUNAL", defendantUuid: "p4", round: 2,
  })
  assert.equal(useInGameStore.getState().state.tribunal.defendantUuid, "p4")
  assert.equal(useInGameStore.getState().state.dayVoteResolution.outcome, "TRIBUNAL")
})
test("BUG-084: reload bootstraps REVOTE with the same eligible targets", () => {
  const patch = bootstrapSessionSnapshotPure(snapshot())
  assert.ok(patch)
  assert.equal(patch.state.dayVoteRound, 2)
  assert.deepEqual(patch.state.dayVoteExcludedUuids, ["p2", "p3"])
  assert.deepEqual(buildDayVoteTargets(players, { localPlayerId: "p1", excludedUuids: patch.state.dayVoteExcludedUuids }).map((p) => p.id), ["p4", "p5"])
})
test("REVOTE rejects malformed round, duplicate/unknown excluded candidates and wrong phase", () => {
  for (const override of [{ round: 0 }, { round: 2 }, { round: null }, { round: "1" }, { phase: "NIGHT" },
    { revoteExcludedUuids: [] }, { revoteExcludedUuids: ["p2", "p2"] }]) {
    assert.equal(parseDayVoteResolvedPayload({ payload: { ...revote, ...override }, gameId: revote.gameId, dayIndex: 2 }), null)
  }
  const invalid = snapshot()
  invalid.dayVoteResolution.revoteExcludedUuids = ["p2", "unknown"]
  assert.equal(bootstrapSessionSnapshotPure(invalid), null)
})
test("BUG-080: defendant display resolves the public nickname, not raw UUID", () => {
  assert.equal(getPlayerDisplayName(players, "p3"), "P3")
  assert.equal(getPlayerDisplayName(players, "missing-private-id"), "알 수 없는 참가자")
  assert.equal(getPlayerDisplayName(players, null), "없음")
})
test("second-round exclusions and resolution are cleared on the next day", () => {
  useInGameStore.setState(bootstrapSessionSnapshotPure(snapshot()))
  useInGameStore.getState().applyNightResultAppliedPayload({ gameId: revote.gameId,
    phase: "DAY", dayIndex: 3, players: players.map((p) => ({ uuid: p.uuid, alive: true })) })
  const state = useInGameStore.getState().state
  assert.equal(state.dayVoteRound, 1)
  assert.deepEqual(state.dayVoteExcludedUuids, [])
  assert.equal(state.dayVoteResolution, null)
})
