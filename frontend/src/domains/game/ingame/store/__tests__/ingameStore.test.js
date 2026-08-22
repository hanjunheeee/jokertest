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

// ---------------------------------------------------------------------------
// applyDayVoteResolvedToPhase(TIE/ABSTAINED) — 새 NIGHT은 지난 밤의 nightTurnRole을
// 이어받지 않는다
// ---------------------------------------------------------------------------

test("applyDayVoteResolvedToPhase: TIE/ABSTAINED로 NIGHT에 진입하면 지난 밤의 nightTurnRole을 null로 되돌린다", () => {
  seedState({ phase: "DAY", dayIndex: 1, nightTurnRole: "WITCH_HUNTER" })

  useInGameStore.getState().applyDayVoteResolvedToPhase("game-1", 1, { outcome: "TIE" })

  const state = useInGameStore.getState().state
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.nightTurnRole, null)
})

// ---------------------------------------------------------------------------
// applyNightTurnChanged — night_turn_changed 방송 반영
// ---------------------------------------------------------------------------

test("applyNightTurnChanged: gameId/phase/dayIndex가 canonical과 일치하면 nightTurnRole을 갱신한다", () => {
  seedState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER" })

  useInGameStore.getState().applyNightTurnChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(useInGameStore.getState().state.nightTurnRole, "DOCTOR")
})

test("applyNightTurnChanged: nightTurnRole이 null이면(판정 준비 완료) null로 반영한다", () => {
  seedState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "WITCH_HUNTER" })

  useInGameStore.getState().applyNightTurnChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 1, nightTurnRole: null })

  assert.equal(useInGameStore.getState().state.nightTurnRole, null)
})

test("applyNightTurnChanged: 다른 gameId의 방송은 무시되고 store가 전혀 변경되지 않는다", () => {
  const before = seedState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER" })
  const beforeSnapshot = useInGameStore.getState()

  useInGameStore.getState().applyNightTurnChanged({ gameId: "other-game", phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(useInGameStore.getState(), beforeSnapshot)
  assert.equal(useInGameStore.getState().state.nightTurnRole, "JOKER")
  assert.equal(before.nightTurnRole, "JOKER")
})

test("applyNightTurnChanged: 다른(stale) dayIndex의 방송은 무시된다", () => {
  seedState({ phase: "NIGHT", dayIndex: 2, nightTurnRole: "JOKER" })
  const beforeSnapshot = useInGameStore.getState()

  useInGameStore.getState().applyNightTurnChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(useInGameStore.getState(), beforeSnapshot)
})

test("applyNightTurnChanged: 현재 phase가 NIGHT가 아니면(이미 DAY로 전이됨) 늦게 도착한 방송은 무시된다", () => {
  seedState({ phase: "DAY", dayIndex: 2, nightTurnRole: null })
  const beforeSnapshot = useInGameStore.getState()

  useInGameStore.getState().applyNightTurnChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(useInGameStore.getState(), beforeSnapshot)
})

test("applyNightTurnChanged: 같은 값으로의 갱신은 참조를 그대로 보존하는 no-op이다", () => {
  seedState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })
  const beforeSnapshot = useInGameStore.getState()

  useInGameStore.getState().applyNightTurnChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(useInGameStore.getState(), beforeSnapshot)
})

// ---------------------------------------------------------------------------
// nightPrivateResult — GUARD/WITCH_HUNTER 본인에게만 오는 개인 조사 결과
//
// 핵심 계약: night_result_applied(DAY 전이)로는 절대 지워지지 않는다. 지워지는 곳은 정확히
// 세 곳뿐이다 — 오버레이 확인·NIGHT 재진입·gameId 변경.
// ---------------------------------------------------------------------------

const GUARD_RESULT = Object.freeze({
  gameId: "game-1",
  dayIndex: 1,
  actionType: "INVESTIGATE",
  targetId: "p2",
  team: "CITIZEN",
})

// seedState는 nightPrivateResult를 건드리지 않으므로(다른 테스트와의 누수를 막기 위해)
// 여기서 명시적으로 초기화한 뒤 원하는 값을 주입한다.
function seedPrivateResultState(overrides = {}, payload = GUARD_RESULT) {
  seedState({
    phase: "NIGHT",
    dayIndex: 1,
    players: [
      { uuid: "p1", nickname: "P1", alive: true },
      { uuid: "p2", nickname: "P2", alive: true },
      { uuid: "p3", nickname: "P3", alive: true },
    ],
    ...overrides,
  })
  useInGameStore.setState({ nightPrivateResult: null })
  if (payload) useInGameStore.getState().setNightPrivateResult(payload)
  return useInGameStore.getState().nightPrivateResult
}

test("setNightPrivateResult: 유효한 payload를 얕은 복사로 보관한다(호출부가 원본을 바꿔도 흔들리지 않는다)", () => {
  const mutable = { ...GUARD_RESULT }
  seedPrivateResultState({}, mutable)

  const stored = useInGameStore.getState().nightPrivateResult
  assert.deepEqual(stored, GUARD_RESULT)
  assert.notEqual(stored, mutable)

  mutable.team = "JOKER"
  assert.equal(useInGameStore.getState().nightPrivateResult.team, "CITIZEN")
})

// [테스트 이름, 무시되어야 하는 payload]
const ignoredPrivateResults = [
  ["payload가 null", null],
  ["payload가 배열", [GUARD_RESULT]],
  ["다른 gameId", { ...GUARD_RESULT, gameId: "other-game" }],
  ["dayIndex가 정수가 아님", { ...GUARD_RESULT, dayIndex: "1" }],
  ["알 수 없는 actionType", { ...GUARD_RESULT, actionType: "KILL" }],
  ["targetId가 빈 문자열", { ...GUARD_RESULT, targetId: "" }],
]

for (const [name, payload] of ignoredPrivateResults) {
  test(`setNightPrivateResult: ${name}이면 참조를 그대로 보존하는 no-op이다`, () => {
    seedPrivateResultState({}, null)
    const beforeSnapshot = useInGameStore.getState()

    useInGameStore.getState().setNightPrivateResult(payload)

    assert.equal(useInGameStore.getState(), beforeSnapshot)
    assert.equal(useInGameStore.getState().nightPrivateResult, null)
  })
}

test("applyNightResultAppliedPayload(DAY 전이) 후에도 개인 조사 결과는 그대로 유지된다", () => {
  seedPrivateResultState({ phase: "NIGHT", dayIndex: 1 })

  useInGameStore.getState().applyNightResultAppliedPayload({
    gameId: "game-1",
    phase: "DAY",
    dayIndex: 2,
    victimUuid: "p3",
    players: [
      { uuid: "p1", alive: true },
      { uuid: "p2", alive: true },
      { uuid: "p3", alive: false },
    ],
  })

  assert.equal(useInGameStore.getState().state.phase, "DAY")
  assert.deepEqual(useInGameStore.getState().nightPrivateResult, GUARD_RESULT)
})

test("applyNightTurnChanged(같은 밤의 턴 변경)는 개인 조사 결과를 지우지 않는다", () => {
  seedPrivateResultState({ phase: "NIGHT", dayIndex: 1, nightTurnRole: "GUARD" })

  useInGameStore
    .getState()
    .applyNightTurnChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 1, nightTurnRole: "WITCH_HUNTER" })

  assert.equal(useInGameStore.getState().state.nightTurnRole, "WITCH_HUNTER")
  assert.deepEqual(useInGameStore.getState().nightPrivateResult, GUARD_RESULT)
})

test("applyDayVoteResolvedToPhase(TIE)로 NIGHT에 재진입하면 개인 조사 결과가 비워진다", () => {
  seedPrivateResultState({ phase: "DAY", dayIndex: 2 })

  useInGameStore.getState().applyDayVoteResolvedToPhase("game-1", 2, { outcome: "TIE" })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("applyPhaseChanged(legacy ROLE_REVEAL→NIGHT)로 NIGHT에 진입하면 개인 조사 결과가 비워진다", () => {
  seedPrivateResultState({ phase: "ROLE_REVEAL", dayIndex: 0 })

  useInGameStore.getState().applyPhaseChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 0 })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("applyTribunalResolved(TRIBUNAL→NIGHT)로 NIGHT에 재진입하면 개인 조사 결과가 비워진다", () => {
  seedPrivateResultState({ phase: "TRIBUNAL", dayIndex: 2, tribunal: { defendantUuid: "p3" } })

  useInGameStore.getState().applyTribunalResolved({
    gameId: "game-1",
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: "p3",
    outcome: "NOT_GUILTY",
    counts: { guilty: 1, notGuilty: 2 },
    executedUuid: null,
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("applySessionSnapshot이 NIGHT으로 하이드레이션하면 개인 조사 결과가 비워진다(서버가 재전송하지 않으므로)", () => {
  seedPrivateResultState({
    phase: "DAY",
    dayIndex: 1,
    players: [
      { uuid: "p1", nickname: "P1" },
      { uuid: "p2", nickname: "P2" },
      { uuid: "p3", nickname: "P3" },
    ],
    self: { uuid: "p1", nickname: "P1", role: "GUARD" },
  })

  useInGameStore.getState().applySessionSnapshot({
    ok: true,
    gameId: "game-1",
    phase: "NIGHT",
    dayIndex: 1,
    players: snapshotPlayers(),
    self: { uuid: "p1", nickname: "P1", role: "GUARD", team: "CITIZEN", hasActedThisPhase: false },
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("applySessionSnapshot이 이미 NIGHT인 상태를 다시 반영하는 것은 개인 조사 결과를 지우지 않는다", () => {
  seedPrivateResultState({
    phase: "NIGHT",
    dayIndex: 1,
    players: [
      { uuid: "p1", nickname: "P1" },
      { uuid: "p2", nickname: "P2" },
      { uuid: "p3", nickname: "P3" },
    ],
    self: { uuid: "p1", nickname: "P1", role: "GUARD" },
  })

  useInGameStore.getState().applySessionSnapshot({
    ok: true,
    gameId: "game-1",
    phase: "NIGHT",
    dayIndex: 1,
    players: snapshotPlayers(),
    self: { uuid: "p1", nickname: "P1", role: "GUARD", team: "CITIZEN", hasActedThisPhase: false },
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.deepEqual(useInGameStore.getState().nightPrivateResult, GUARD_RESULT)
})

test("setGamePayload(새 게임)와 clearGame은 개인 조사 결과를 비운다", () => {
  seedPrivateResultState()

  useInGameStore.getState().setGamePayload({
    gameId: "game-2",
    state: { id: "game-2", phase: "ROLE_REVEAL", dayIndex: 0, players: [{ uuid: "p1", nickname: "P1" }] },
  })
  assert.equal(useInGameStore.getState().nightPrivateResult, null)

  seedPrivateResultState()
  useInGameStore.getState().clearGame()
  assert.equal(useInGameStore.getState().nightPrivateResult, null)
})

test("clearNightPrivateResult: 값이 있으면 비우고, 이미 비어 있으면 참조를 보존하는 no-op이다", () => {
  seedPrivateResultState()

  useInGameStore.getState().clearNightPrivateResult()
  assert.equal(useInGameStore.getState().nightPrivateResult, null)

  const beforeSnapshot = useInGameStore.getState()
  useInGameStore.getState().clearNightPrivateResult()
  assert.equal(useInGameStore.getState(), beforeSnapshot)
})
