// FE-003: 단계가 바뀌면 "이번 단계에 이미 함" 표시가 풀림
// FE-017: 스냅샷으로 새 밤에 들어가면 지난 밤 개인 결과 비움
// known 3장 phaseActions.js:124 vs voteActions.js:84: 동표·기권 판정 전에 받아 둔 밤 차례를 안 지움
import test from "node:test"
import assert from "node:assert/strict"
import { useInGameStore } from "../../../../../src/domains/game/ingame/store/ingameStore.js"

const GAME_ID = "game-reset"
const PLAYERS = [
  { uuid: "u1", nickname: "A", alive: true, isConnected: true },
  { uuid: "u2", nickname: "B", alive: true, isConnected: true },
]

function seed(overrides = {}) {
  useInGameStore.getState().clearGame()
  useInGameStore.setState({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase: "DAY",
      dayIndex: 1,
      dayPhase: "DAY_DISCUSSION",
      players: PLAYERS.map((p) => ({ ...p })),
      self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: true },
      ...overrides,
    },
    error: null,
  })
}

const acted = () => useInGameStore.getState().state.self.hasActedThisPhase

test("FE-003: 토론→투표로 바뀌면 이미 함 표시가 풀린다", () => {
  seed()
  useInGameStore.getState().applyDayPhaseChanged({ gameId: GAME_ID, dayIndex: 1, dayPhase: "DAY_VOTE", round: 1 })
  assert.equal(useInGameStore.getState().state.dayPhase, "DAY_VOTE")
  assert.equal(acted(), false)
})

test("FE-003: 낮 투표 동표로 밤에 들어가면 이미 함 표시가 풀린다", () => {
  seed({ dayPhase: "DAY_VOTE" })
  useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, { outcome: "TIE" })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(acted(), false)
})

test("FE-003: 재판 판정으로 밤에 들어가면 이미 함 표시가 풀린다", () => {
  seed({ phase: "TRIBUNAL", dayPhase: null, tribunal: { defendantUuid: "u2" } })
  useInGameStore.getState().applyTribunalResolved({
    gameId: GAME_ID, dayIndex: 1, phase: "NIGHT", defendantUuid: "u2",
    outcome: "NOT_GUILTY", counts: { guilty: 0, notGuilty: 2 }, executedUuid: null,
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(acted(), false)
})

test("FE-003: 밤 결과로 다음 낮이 되면 이미 함 표시가 풀린다", () => {
  seed({ phase: "NIGHT", dayPhase: null })
  useInGameStore.getState().applyNightResultAppliedPayload({
    gameId: GAME_ID, phase: "DAY", dayIndex: 2, victimUuid: null,
    players: PLAYERS.map((p) => ({ uuid: p.uuid, alive: true })),
  })
  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.equal(acted(), false)
})

test("FE-017: 스냅샷으로 새 밤에 들어가면 지난 밤 개인 결과를 비운다", () => {
  seed({ phase: "DAY", dayPhase: "DAY_VOTE", self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false } })
  useInGameStore.setState({ nightPrivateResult: { gameId: GAME_ID, dayIndex: 0, kind: "INVESTIGATE" } })
  useInGameStore.getState().applySessionSnapshot({
    ok: true,
    gameId: GAME_ID,
    phase: "NIGHT",
    dayIndex: 1,
    players: PLAYERS.map((p) => ({ uuid: p.uuid, nickname: p.nickname, isAlive: true, isConnected: true })),
    self: { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("known 3장: 동표 판정 전에 받아 둔 밤 첫 차례를 지우지 않는다", () => {
  seed({ dayPhase: "DAY_VOTE" })
  useInGameStore.getState().applyNightTurnStarted({ gameId: GAME_ID, dayIndex: 1, role: "DOCTOR", deadline: 1_700_000_030_000 })
  assert.equal(useInGameStore.getState().state.nightTurnRole, "DOCTOR")
  useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, { outcome: "ABSTAINED" })
  const { state } = useInGameStore.getState()
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.nightTurnRole, "DOCTOR")
  assert.equal(state.nightTurnDeadline, 1_700_000_030_000)
})
