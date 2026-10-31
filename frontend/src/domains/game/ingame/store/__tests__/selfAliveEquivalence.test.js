import test from "node:test"
import assert from "node:assert/strict"
import { useInGameStore } from "../ingameStore.js"
import { selectInGameSelfAlive } from "../../utils/selectInGameSelfAlive.js"

const GAME_ID = "game-1"

const EXECUTED_UUID = "u3"
const NIGHT_VICTIM_UUID = "u2"
const DAY_TWO_ALIVE_BY_UUID = { u1: true, u2: false, u3: false, u4: true }

const ROSTER = [
  { uuid: "u1", nickname: "A", role: "CITIZEN", team: "CITIZEN" },
  { uuid: "u2", nickname: "B", role: "DOCTOR", team: "CITIZEN" },
  { uuid: "u3", nickname: "C", role: "GUARD", team: "CITIZEN" },
  { uuid: "u4", nickname: "D", role: "JOKER", team: "JOKER" },
]

function selfPayloadFor(uuid) {
  const entry = ROSTER.find((player) => player.uuid === uuid)
  return {
    uuid: entry.uuid,
    nickname: entry.nickname,
    role: entry.role,
    team: entry.team,
    hasActedThisPhase: false,
    ...(entry.role === "JOKER" ? { allies: [] } : {}),
  }
}

function seedStartedSession(selfUuid) {
  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  useInGameStore.getState().setGamePayload({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase: "ROLE_REVEAL",
      dayIndex: 0,
      players: ROSTER.map((player, index) => ({
        uuid: player.uuid,
        nickname: player.nickname,
        themeIndex: index,
      })),
      self: selfPayloadFor(selfUuid),
    },
  })
}

function applyDayTwoEventSequence() {
  const store = useInGameStore.getState()

  store.applyPhaseChanged({ gameId: GAME_ID, phase: "DAY", dayIndex: 1 })
  store.applyDayPhaseChanged({ gameId: GAME_ID, dayIndex: 1, dayPhase: "DAY_VOTE" })
  store.applyDayVoteResolvedToPhase(GAME_ID, 1, { outcome: "TRIBUNAL", defendantUuid: EXECUTED_UUID })
  store.applyTribunalResolved({
    gameId: GAME_ID,
    dayIndex: 1,
    phase: "NIGHT",
    defendantUuid: EXECUTED_UUID,
    outcome: "GUILTY",
    counts: { guilty: 3, notGuilty: 1 },
    executedUuid: EXECUTED_UUID,
  })
  store.applyNightResultAppliedPayload({
    gameId: GAME_ID,
    phase: "DAY",
    dayIndex: 2,
    victimUuid: NIGHT_VICTIM_UUID,
    players: ROSTER.map((player) => ({ uuid: player.uuid, alive: DAY_TWO_ALIVE_BY_UUID[player.uuid] })),
  })
  store.applyDayPhaseChanged({ gameId: GAME_ID, dayIndex: 2, dayPhase: "DAY_VOTE" })
}

function dayTwoSnapshotResponse(selfUuid) {
  return {
    ok: true,
    gameId: GAME_ID,
    phase: "DAY",
    dayIndex: 2,
    dayPhase: "DAY_VOTE",
    players: ROSTER.map((player) => ({
      uuid: player.uuid,
      nickname: player.nickname,
      isAlive: DAY_TWO_ALIVE_BY_UUID[player.uuid],
      isConnected: true,
    })),
    self: selfPayloadFor(selfUuid),
  }
}

for (const { uuid, nickname } of ROSTER) {
  test(`self 생존 동등성: ${nickname}(${uuid})의 2일차 낮 생존 상태는 이벤트 경로와 스냅샷 경로가 같다`, () => {
    seedStartedSession(uuid)
    applyDayTwoEventSequence()
    const eventState = useInGameStore.getState().state
    const eventAlive = selectInGameSelfAlive(eventState)

    seedStartedSession(uuid)
    useInGameStore.getState().applySessionSnapshot(dayTwoSnapshotResponse(uuid))
    const snapshotState = useInGameStore.getState().state
    const snapshotAlive = selectInGameSelfAlive(snapshotState)

    assert.equal(eventState.phase, "DAY")
    assert.equal(eventState.dayIndex, 2)
    assert.equal(eventState.dayPhase, "DAY_VOTE")
    assert.equal(snapshotState.phase, "DAY")
    assert.equal(snapshotState.dayIndex, 2)
    assert.equal(snapshotState.dayPhase, "DAY_VOTE")
    assert.equal(useInGameStore.getState().snapshotSeq, 1)

    assert.equal(eventAlive, DAY_TWO_ALIVE_BY_UUID[uuid])
    assert.equal(snapshotAlive, eventAlive)
  })
}

test("self 생존 동등성: roster 전원의 alive도 두 경로가 같다(self 한 명만 우연히 맞는 경우 배제)", () => {
  seedStartedSession("u1")
  applyDayTwoEventSequence()
  const eventPlayers = useInGameStore.getState().state.players.map((p) => [p.uuid, p.alive])

  seedStartedSession("u1")
  useInGameStore.getState().applySessionSnapshot(dayTwoSnapshotResponse("u1"))
  const snapshotPlayers = useInGameStore.getState().state.players.map((p) => [p.uuid, p.alive])

  assert.deepEqual(Object.fromEntries(eventPlayers), DAY_TWO_ALIVE_BY_UUID)
  assert.deepEqual(Object.fromEntries(snapshotPlayers), Object.fromEntries(eventPlayers))
})

const ENDED_ALIVE_BY_UUID = { u1: true, u2: false, u3: false, u4: false }

test("self 생존 동등성: 밤 직후 종료(ENDED)에서도 이벤트 경로와 스냅샷 경로의 self 생존이 같다", () => {
  for (const { uuid } of ROSTER) {
    seedStartedSession(uuid)
    useInGameStore.getState().applyPhaseChanged({ gameId: GAME_ID, phase: "DAY", dayIndex: 1 })
    useInGameStore.getState().applyNightResultAppliedPayload({
      gameId: GAME_ID,
      phase: "ENDED",
      dayIndex: 1,
      victimUuid: NIGHT_VICTIM_UUID,
      players: ROSTER.map((player) => ({ uuid: player.uuid, isAlive: ENDED_ALIVE_BY_UUID[player.uuid] })),
      winResult: { winner: "CITIZEN" },
    })
    const eventAlive = selectInGameSelfAlive(useInGameStore.getState().state)

    seedStartedSession(uuid)
    useInGameStore.getState().applySessionSnapshot({
      ok: true,
      gameId: GAME_ID,
      phase: "ENDED",
      dayIndex: 1,
      players: ROSTER.map((player) => ({
        uuid: player.uuid,
        nickname: player.nickname,
        isAlive: ENDED_ALIVE_BY_UUID[player.uuid],
        isConnected: true,
      })),
      self: selfPayloadFor(uuid),
      winResult: { winner: "CITIZEN" },
    })
    const snapshotAlive = selectInGameSelfAlive(useInGameStore.getState().state)

    assert.equal(eventAlive, ENDED_ALIVE_BY_UUID[uuid], `이벤트 경로 ${uuid}`)
    assert.equal(snapshotAlive, eventAlive, `스냅샷 경로 ${uuid}`)
  }
})
