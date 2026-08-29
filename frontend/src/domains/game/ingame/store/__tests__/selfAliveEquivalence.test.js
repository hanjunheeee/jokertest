import test from "node:test"
import assert from "node:assert/strict"
import { useInGameStore } from "../ingameStore.js"
import { selectInGameSelfAlive } from "../../utils/selectInGameSelfAlive.js"

// ---------------------------------------------------------------------------
// AC-01 · 이벤트 순차 적용 결과와 session snapshot 적용 결과의 self 생존 상태 동등성
//
// 같은 세션·같은 시점을 두 경로로 만든다.
//   (a) 이벤트 경로: game_started → 낮 → 재판 처형 → 밤 사망 → 2일차 낮
//   (b) 스냅샷 경로: 같은 세션에 그 시점의 get_session_snapshot 응답을 얹기
// 두 결과를 selectInGameSelfAlive 하나로 판정해 반환값이 같은지 본다 — 비교 기준을 store
// 내부 구조 전체가 아니라 "지금 나는 살아있는가" 한 값으로 좁혀, 어긋남이 생기면 그 값에서
// 곧바로 드러나게 한다.
// ---------------------------------------------------------------------------

const GAME_ID = "game-1"

// 1일차 재판에서 u3이 처형되고, 그 밤에 u2가 사망한다 — 2일차 낮의 canonical 생존 상태.
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
    // allies는 JOKER 전용 own-property 계약이다(applySessionSnapshotPure와 동일한 정책).
    ...(entry.role === "JOKER" ? { allies: [] } : {}),
  }
}

/** game_started 직후 상태로 store를 초기화한다 — 두 경로가 같은 세션에서 출발하게 하는 기준선. */
function seedStartedSession(selfUuid) {
  useInGameStore.setState({ gameId: null, state: null, error: null, snapshotSeq: 0 })
  useInGameStore.getState().setGamePayload({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase: "ROLE_REVEAL",
      dayIndex: 0,
      // themeIndex는 game_started에서만 내려오는 표시 색상이다 — 스냅샷 경로가 이 값을
      // 이어받는지까지 같은 기준선 위에서 확인한다.
      players: ROSTER.map((player, index) => ({
        uuid: player.uuid,
        nickname: player.nickname,
        themeIndex: index,
      })),
      self: selfPayloadFor(selfUuid),
    },
  })
}

/** 1일차 낮 → 재판 처형 → 밤 사망 → 2일차 낮 투표까지 canonical 이벤트를 순서대로 적용한다. */
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
    // DAY 분기 payload의 생존 키는 alive다(parseNightResultAppliedPayload의 정규화 결과).
    players: ROSTER.map((player) => ({ uuid: player.uuid, alive: DAY_TWO_ALIVE_BY_UUID[player.uuid] })),
  })
  store.applyDayPhaseChanged({ gameId: GAME_ID, dayIndex: 2, dayPhase: "DAY_VOTE" })
}

/** 같은 시점(2일차 낮 투표)의 get_session_snapshot 응답을 만든다 — 생존 키는 isAlive다. */
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

    // 두 경로가 실제로 같은 시점까지 진행했는지 먼저 확인한다 — 어느 한쪽이 거부(no-op)됐다면
    // 아래 동등성은 우연히 성립할 수 있다.
    assert.equal(eventState.phase, "DAY")
    assert.equal(eventState.dayIndex, 2)
    assert.equal(eventState.dayPhase, "DAY_VOTE")
    assert.equal(snapshotState.phase, "DAY")
    assert.equal(snapshotState.dayIndex, 2)
    assert.equal(snapshotState.dayPhase, "DAY_VOTE")
    assert.equal(useInGameStore.getState().snapshotSeq, 1)

    // 판정 불가(null)로 양쪽이 나란히 어긋나는 것을 동등하다고 부르지 않도록 기대값까지 고정한다.
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

// ---------------------------------------------------------------------------
// ENDED 경로 — night_result_applied의 ENDED 분기는 players[].isAlive를, DAY 분기는
// players[].alive를 읽는다(의도된 비대칭). 그 비대칭이 스냅샷 경로와 어긋나지 않는지 본다.
// ---------------------------------------------------------------------------

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
      // ENDED 분기 payload의 생존 키는 isAlive다.
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
