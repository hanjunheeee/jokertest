import test from "node:test"
import assert from "node:assert/strict"
import { useInGameStore } from "../ingameStore.js"

function seedState(overrides = {}) {
  const state = {
    id: "game-1",
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players: [{ uuid: "u1", nickname: "A" }],
    self: { uuid: "u1", nickname: "A", role: "CITIZEN" },
    ...overrides,
  }
  useInGameStore.setState({ gameId: "game-1", state, error: null })
  return state
}

// [테스트 이름, store를 세팅하는 함수, applyPhaseChanged에 넘길 payload]
// 전부 "무시되어야 하는" 입력이다 — 무시란 예외 없이 조용히 넘어가고, store의 최상위
// 참조와 그 안의 game state 참조가 호출 전후로 완전히 동일하게 유지된다는 뜻이다.
const ignoredCases = [
  ["payload가 undefined면 무시되고 예외가 없다", () => seedState(), undefined],
  ["payload가 null이면 무시되고 예외가 없다", () => seedState(), null],
  ["payload가 배열이면 무시된다", () => seedState(), ["game-1", "NIGHT", 0]],
  ["현재 gameId와 같지만 phase가 없으면 무시된다", () => seedState(), { gameId: "game-1", dayIndex: 0 }],
  ["현재 gameId와 같지만 dayIndex가 없으면 무시된다", () => seedState(), { gameId: "game-1", phase: "NIGHT" }],
  ["phase가 NIGHT가 아니면 무시된다", () => seedState(), { gameId: "game-1", phase: "DAY", dayIndex: 0 }],
  ["dayIndex가 0이 아니면 무시된다", () => seedState(), { gameId: "game-1", phase: "NIGHT", dayIndex: 1 }],
  [
    "현재 state가 없으면 무시된다",
    () => useInGameStore.setState({ gameId: "game-1", state: null, error: null }),
    { gameId: "game-1", phase: "NIGHT", dayIndex: 0 },
  ],
  [
    "현재 phase가 ROLE_REVEAL이 아니면 무시된다",
    () => seedState({ phase: "NIGHT" }),
    { gameId: "game-1", phase: "NIGHT", dayIndex: 0 },
  ],
  [
    "다른 gameId면 무시된다",
    () => seedState(),
    { gameId: "game-other", phase: "NIGHT", dayIndex: 0 },
  ],
]

for (const [label, setup, payload] of ignoredCases) {
  test(`applyPhaseChanged: ${label} — store/game state 참조가 유지된다`, () => {
    setup()
    const storeBefore = useInGameStore.getState()
    const gameStateBefore = storeBefore.state

    assert.doesNotThrow(() => useInGameStore.getState().applyPhaseChanged(payload))

    const storeAfter = useInGameStore.getState()
    assert.equal(storeAfter, storeBefore) // 전체 store state 객체 참조 유지
    assert.equal(storeAfter.state, gameStateBefore) // game state 참조 유지
  })
}

test("applyPhaseChanged: 올바른 {gameId, phase:'NIGHT', dayIndex:0}만 반영하며 players/self/기타 필드를 보존한다", () => {
  const seeded = seedState()
  const storeBefore = useInGameStore.getState()

  useInGameStore.getState().applyPhaseChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 0 })

  const storeAfter = useInGameStore.getState()
  assert.notEqual(storeAfter, storeBefore) // 반영된 경우엔 최상위 참조가 새로 생긴다
  assert.notEqual(storeAfter.state, seeded) // game state 참조도 새로 생긴다
  assert.equal(storeAfter.state.phase, "NIGHT")
  assert.equal(storeAfter.state.dayIndex, 0)
  assert.equal(storeAfter.state.id, seeded.id)
  assert.deepEqual(storeAfter.state.players, seeded.players)
  assert.deepEqual(storeAfter.state.self, seeded.self)
})

// --- applyNightResultAppliedPayload ---

function seedNightState(overrides = {}) {
  return seedState({
    phase: "NIGHT",
    dayIndex: 2,
    players: [
      { uuid: "p1", nickname: "P1", alive: true },
      { uuid: "p2", nickname: "P2", alive: true },
      { uuid: "p3", nickname: "P3", alive: true },
    ],
    ...overrides,
  })
}

function terminalNightPayload(overrides = {}) {
  return {
    gameId: "game-1",
    phase: "ENDED",
    dayIndex: 2,
    victimUuid: "p1",
    winResult: { winner: "CITIZEN" },
    players: [
      { uuid: "p1", isAlive: false },
      { uuid: "p2", isAlive: true },
      { uuid: "p3", isAlive: true },
    ],
    ...overrides,
  }
}

function nonTerminalNightPayload(overrides = {}) {
  return {
    gameId: "game-1",
    phase: "DAY",
    dayIndex: 3,
    victimUuid: "p1",
    players: [
      { uuid: "p1", alive: false },
      { uuid: "p2", alive: true },
      { uuid: "p3", alive: true },
    ],
    ...overrides,
  }
}

test("applyNightResultAppliedPayload: 종료(ENDED) payload는 phase를 ENDED로 바꾸고 winResult·생존 상태를 반영한다", () => {
  seedNightState()
  useInGameStore.getState().applyNightResultAppliedPayload(terminalNightPayload())

  const after = useInGameStore.getState()
  assert.equal(after.state.phase, "ENDED")
  assert.deepEqual(after.state.winResult, { winner: "CITIZEN" })
  assert.equal(after.state.players.find((p) => p.uuid === "p1").alive, false)
  assert.equal(after.state.players.find((p) => p.uuid === "p2").alive, true)
  assert.equal(after.state.players.find((p) => p.uuid === "p3").alive, true)
})

test("applyNightResultAppliedPayload: 종료 payload의 players 스냅샷은 canonical 생존 상태로 치환되고, payload에 없는 uuid는 기존 값을 유지한다", () => {
  seedNightState()
  useInGameStore.getState().applyNightResultAppliedPayload(
    terminalNightPayload({
      players: [
        { uuid: "p1", isAlive: false },
        { uuid: "p2", isAlive: false },
        // p3는 의도적으로 생략 — 기존 alive:true가 유지되어야 한다.
      ],
    }),
  )

  const players = useInGameStore.getState().state.players
  assert.equal(players.find((p) => p.uuid === "p1").alive, false)
  assert.equal(players.find((p) => p.uuid === "p2").alive, false)
  assert.equal(players.find((p) => p.uuid === "p3").alive, true)
})

test("applyNightResultAppliedPayload: ENDED 확정 이후 어떤 payload도 상태를 되돌리지 못한다(잠금)", () => {
  seedNightState()
  useInGameStore.getState().applyNightResultAppliedPayload(terminalNightPayload())
  const lockedState = useInGameStore.getState().state

  useInGameStore.getState().applyNightResultAppliedPayload(nonTerminalNightPayload({ dayIndex: 4 }))
  assert.equal(useInGameStore.getState().state, lockedState)

  useInGameStore
    .getState()
    .applyNightResultAppliedPayload(terminalNightPayload({ dayIndex: 5, winResult: { winner: "JOKER" } }))
  assert.equal(useInGameStore.getState().state, lockedState)
})

test("applyNightResultAppliedPayload: 구조 불량 종료 payload는 상태를 바꾸지 않는다", () => {
  seedNightState()
  const before = useInGameStore.getState()

  useInGameStore.getState().applyNightResultAppliedPayload(terminalNightPayload({ dayIndex: "not-a-number" }))
  assert.equal(useInGameStore.getState(), before)

  useInGameStore.getState().applyNightResultAppliedPayload(terminalNightPayload({ players: "not-array" }))
  assert.equal(useInGameStore.getState(), before)

  useInGameStore.getState().applyNightResultAppliedPayload(terminalNightPayload({ gameId: "other-game" }))
  assert.equal(useInGameStore.getState(), before)
})

test("applyNightResultAppliedPayload: dayIndex가 현재보다 과거인 종료 payload는(stale) 상태를 바꾸지 않는다", () => {
  seedNightState({ dayIndex: 3 })
  const before = useInGameStore.getState()

  useInGameStore.getState().applyNightResultAppliedPayload(terminalNightPayload({ dayIndex: 2 }))
  assert.equal(useInGameStore.getState(), before)
})

test("applyNightResultAppliedPayload: 비종료 결과는 기존처럼 DAY로 전이하고 생존 상태를 반영한다(회귀)", () => {
  seedNightState()
  useInGameStore.getState().applyNightResultAppliedPayload(nonTerminalNightPayload())

  const after = useInGameStore.getState()
  assert.equal(after.state.phase, "DAY")
  assert.equal(after.state.dayIndex, 3)
  assert.equal(after.state.players.find((p) => p.uuid === "p1").alive, false)
  assert.equal(after.state.players.find((p) => p.uuid === "p2").alive, true)
})

test("applyNightResultAppliedPayload: 비종료 결과의 dayIndex가 현재 이하이면(stale) 상태를 바꾸지 않는다", () => {
  seedNightState()
  const before = useInGameStore.getState()

  useInGameStore.getState().applyNightResultAppliedPayload(nonTerminalNightPayload({ dayIndex: 2 }))
  assert.equal(useInGameStore.getState(), before)
})

// --- applySessionSnapshot ---

function seedSnapshotState(overrides = {}) {
  return seedState({
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players: [
      { uuid: "p1", nickname: "P1" },
      { uuid: "p2", nickname: "P2" },
      { uuid: "p3", nickname: "P3" },
    ],
    self: { uuid: "p1", nickname: "P1", role: "CITIZEN" },
    ...overrides,
  })
}

function snapshotPlayers() {
  return [
    { uuid: "p1", nickname: "P1", isAlive: true, isConnected: true },
    { uuid: "p2", nickname: "P2", isAlive: true, isConnected: true },
    { uuid: "p3", nickname: "P3", isAlive: true, isConnected: true },
  ]
}

function validSnapshotResponse(overrides = {}) {
  return {
    ok: true,
    gameId: "game-1",
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players: snapshotPlayers(),
    self: { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
    ...overrides,
  }
}

// store-wiring 수준 거부 레시피: useInGameStore.getState()는 액션 함수를 담고 있어
// structuredClone이 던지므로, 참조 동일성·구독 알림 횟수는 살아있는 참조로 직접 확인하고
// deep equality는 직렬화 가능한 {gameId, state, error} 투영만 별도로 clone해 비교한다.
function assertSnapshotRejected(response) {
  const before = useInGameStore.getState()
  const preCall = structuredClone({ gameId: before.gameId, state: before.state, error: before.error })

  let notifyCount = 0
  const unsubscribe = useInGameStore.subscribe(() => {
    notifyCount += 1
  })

  useInGameStore.getState().applySessionSnapshot(response)

  unsubscribe()

  assert.equal(useInGameStore.getState(), before)
  assert.equal(notifyCount, 0)
  const after = useInGameStore.getState()
  assert.deepStrictEqual({ gameId: after.gameId, state: after.state, error: after.error }, preCall)
}

test("applySessionSnapshot: 유효한 스냅샷은 정확히 한 번의 상태 전이로 store 전체({gameId,state,error})를 갱신한다", () => {
  seedSnapshotState()
  const before = useInGameStore.getState()

  let notifyCount = 0
  const unsubscribe = useInGameStore.subscribe(() => {
    notifyCount += 1
  })

  useInGameStore.getState().applySessionSnapshot(validSnapshotResponse())

  unsubscribe()

  const after = useInGameStore.getState()
  assert.notEqual(after, before)
  assert.equal(notifyCount, 1)
  assert.equal(after.gameId, "game-1")
  assert.equal(after.error, null)
  assert.equal(after.state.phase, "ROLE_REVEAL")
  assert.equal(after.state.dayIndex, 0)
  assert.deepEqual(after.state.players, [
    { uuid: "p1", nickname: "P1", alive: true, isConnected: true },
    { uuid: "p2", nickname: "P2", alive: true, isConnected: true },
    { uuid: "p3", nickname: "P3", alive: true, isConnected: true },
  ])
  assert.deepEqual(after.state.self, {
    uuid: "p1",
    nickname: "P1",
    role: "CITIZEN",
    team: "CITIZEN",
    hasActedThisPhase: false,
  })
})

test("applySessionSnapshot: response.ok가 true가 아니면 store가 전혀 변경되지 않고 구독자도 호출되지 않는다", () => {
  seedSnapshotState()
  assertSnapshotRejected(validSnapshotResponse({ ok: false }))
})

test("applySessionSnapshot: roster에 없는 uuid를 참조하면(nightResult.victimUuid) store가 전혀 변경되지 않는다", () => {
  seedSnapshotState({ phase: "NIGHT", dayIndex: 1 })
  assertSnapshotRejected(
    validSnapshotResponse({ phase: "DAY", dayIndex: 1, nightResult: { dayIndex: 1, victimUuid: "phantom" } }),
  )
})

test("applySessionSnapshot: 비-JOKER인데 allies own-property가 있으면 store가 전혀 변경되지 않는다", () => {
  seedSnapshotState()
  assertSnapshotRejected(
    validSnapshotResponse({
      self: { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false, allies: [] },
    }),
  )
})

test("applySessionSnapshot: roster 인원 구성이 기존 세션과 다르면(누락) store가 전혀 변경되지 않는다", () => {
  seedSnapshotState()
  assertSnapshotRejected(validSnapshotResponse({ players: snapshotPlayers().slice(0, 2) }))
})

test("applySessionSnapshot: gameId가 양쪽 다 문자열이 아니면 신원 일치로 인정되지 않아 store가 전혀 변경되지 않는다", () => {
  seedSnapshotState()
  useInGameStore.setState({ gameId: true })
  assertSnapshotRejected(validSnapshotResponse({ gameId: true }))
})

test("applySessionSnapshot: dayVoteResolution/tribunal outcome이 서로 모순되면 store가 전혀 변경되지 않는다", () => {
  seedSnapshotState({ phase: "DAY", dayIndex: 1 })
  assertSnapshotRejected(
    validSnapshotResponse({
      phase: "TRIBUNAL",
      dayIndex: 1,
      dayVoteResolution: { outcome: "TIE", tribunalTargetUuid: null, publicVoteCount: 1, publicAbstainCount: 1 },
      tribunal: { defendantUuid: "p2", resolved: false },
    }),
  )
})
