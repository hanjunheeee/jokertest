import test from "node:test"
import assert from "node:assert/strict"
import { readInGameReceiptScope, useInGameStore } from "../ingameStore.js"

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

// --- dayPhase(낮 하위 구간) ---

test("applyPhaseChanged: 첫 DAY 진입은 dayPhase를 DAY_DISCUSSION으로 세팅한다", () => {
  seedState()
  useInGameStore.getState().applyPhaseChanged({ gameId: "game-1", phase: "DAY", dayIndex: 1 })

  const after = useInGameStore.getState()
  assert.equal(after.state.phase, "DAY")
  assert.equal(after.state.dayPhase, "DAY_DISCUSSION")
})

test("applyPhaseChanged: legacy first-night 경로는 dayPhase를 null로 둔다(낮이 아니다)", () => {
  seedState()
  useInGameStore.getState().applyPhaseChanged({ gameId: "game-1", phase: "NIGHT", dayIndex: 0 })

  assert.equal(useInGameStore.getState().state.dayPhase, null)
})

test("applyNightResultAppliedPayload: 밤→낮 전이도 dayPhase를 DAY_DISCUSSION으로 되돌린다(이전 낮의 투표가 이월되지 않는다)", () => {
  seedNightState({ dayPhase: "DAY_VOTE" })
  useInGameStore.getState().applyNightResultAppliedPayload(nonTerminalNightPayload())

  const after = useInGameStore.getState()
  assert.equal(after.state.phase, "DAY")
  assert.equal(after.state.dayPhase, "DAY_DISCUSSION")
})

test("applyNightResultAppliedPayload: 종료(ENDED) payload는 dayPhase를 null로 비운다", () => {
  seedNightState({ dayPhase: "DAY_VOTE" })
  useInGameStore.getState().applyNightResultAppliedPayload(terminalNightPayload())

  assert.equal(useInGameStore.getState().state.dayPhase, null)
})

function seedDayDiscussionState(overrides = {}) {
  return seedState({
    phase: "DAY",
    dayIndex: 1,
    dayPhase: "DAY_DISCUSSION",
    players: [
      { uuid: "p1", nickname: "P1", alive: true },
      { uuid: "p2", nickname: "P2", alive: true },
    ],
    ...overrides,
  })
}

function dayPhaseChangedPayload(overrides = {}) {
  return { gameId: "game-1", dayIndex: 1, dayPhase: "DAY_VOTE", round: 1, ...overrides }
}

// [테스트 이름, store를 세팅하는 함수, applyDayPhaseChanged에 넘길 값] — 전부 참조 보존 no-op이어야 한다.
const ignoredDayPhaseCases = [
  ["parsed가 null이면 무시된다", () => seedDayDiscussionState(), null],
  ["parsed가 배열이면 무시된다", () => seedDayDiscussionState(), ["game-1", "DAY_VOTE"]],
  ["gameId가 다르면 무시된다", () => seedDayDiscussionState(), dayPhaseChangedPayload({ gameId: "game-other" })],
  ["gameId가 문자열이 아니면 무시된다", () => seedDayDiscussionState(), dayPhaseChangedPayload({ gameId: 1 })],
  ["dayIndex가 다르면 무시된다", () => seedDayDiscussionState(), dayPhaseChangedPayload({ dayIndex: 2 })],
  ["dayIndex가 정수가 아니면 무시된다", () => seedDayDiscussionState(), dayPhaseChangedPayload({ dayIndex: "1" })],
  ["dayPhase가 DAY_VOTE가 아니면 무시된다", () => seedDayDiscussionState(), dayPhaseChangedPayload({ dayPhase: "DAY_DISCUSSION" })],
  [
    "phase가 DAY가 아니면 무시된다(낮 밖으로 새어 나가지 않는다)",
    () => seedState({ phase: "NIGHT", dayIndex: 1 }),
    dayPhaseChangedPayload(),
  ],
  [
    "phase가 TRIBUNAL이면 무시된다",
    () => seedState({ phase: "TRIBUNAL", dayIndex: 1 }),
    dayPhaseChangedPayload(),
  ],
  [
    "이미 DAY_VOTE면 중복 방송은 무시된다",
    () => seedDayDiscussionState({ dayPhase: "DAY_VOTE" }),
    dayPhaseChangedPayload(),
  ],
  [
    "현재 state가 없으면 무시된다",
    () => useInGameStore.setState({ gameId: "game-1", state: null, error: null }),
    dayPhaseChangedPayload(),
  ],
]

for (const [label, setup, parsed] of ignoredDayPhaseCases) {
  test(`applyDayPhaseChanged: ${label} — store/game state 참조가 유지된다`, () => {
    setup()
    const storeBefore = useInGameStore.getState()
    const gameStateBefore = storeBefore.state

    assert.doesNotThrow(() => useInGameStore.getState().applyDayPhaseChanged(parsed))

    const storeAfter = useInGameStore.getState()
    assert.equal(storeAfter, storeBefore)
    assert.equal(storeAfter.state, gameStateBefore)
  })
}

test("applyDayPhaseChanged: 정상 전이는 dayPhase만 바꾸고 phase/dayIndex/players/self를 보존한다", () => {
  const seeded = seedDayDiscussionState()
  const storeBefore = useInGameStore.getState()

  useInGameStore.getState().applyDayPhaseChanged(dayPhaseChangedPayload())

  const storeAfter = useInGameStore.getState()
  assert.notEqual(storeAfter, storeBefore)
  assert.notEqual(storeAfter.state, seeded)
  assert.equal(storeAfter.state.dayPhase, "DAY_VOTE")
  assert.equal(storeAfter.state.phase, "DAY")
  assert.equal(storeAfter.state.dayIndex, seeded.dayIndex)
  assert.deepEqual(storeAfter.state.players, seeded.players)
  assert.deepEqual(storeAfter.state.self, seeded.self)
})

test("applyDayVoteResolvedToPhase: TRIBUNAL/NIGHT 전이는 dayPhase를 null로 되돌린다", () => {
  seedDayDiscussionState({ dayPhase: "DAY_VOTE" })
  useInGameStore.getState().applyDayVoteResolvedToPhase("game-1", 1, { outcome: "TRIBUNAL", defendantUuid: "p2" })
  assert.equal(useInGameStore.getState().state.phase, "TRIBUNAL")
  assert.equal(useInGameStore.getState().state.dayPhase, null)

  seedDayDiscussionState({ dayPhase: "DAY_VOTE" })
  useInGameStore.getState().applyDayVoteResolvedToPhase("game-1", 1, { outcome: "ABSTAINED" })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(useInGameStore.getState().state.dayPhase, null)
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
  // F-21(AC-03/AC-06): 스냅샷 복원은 생존과 **참여**를 분리해 되살린다 — 사망했지만 아직
  // 참여 중인 참가자와 빠진 참가자를 새로고침 뒤에도 구별할 수 있어야 하기 때문이다(그 값이
  // 없으면 추방 목록과 보드 사망 표시가 갈라진다). 값을 싣지 않은 스냅샷은 "참여 중"이다.
  assert.deepEqual(after.state.players, [
    { uuid: "p1", nickname: "P1", alive: true, isConnected: true, isParticipating: true },
    { uuid: "p2", nickname: "P2", alive: true, isConnected: true, isParticipating: true },
    { uuid: "p3", nickname: "P3", alive: true, isConnected: true, isParticipating: true },
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
    validSnapshotResponse({
      phase: "DAY",
      dayIndex: 1,
      dayPhase: "DAY_DISCUSSION",
      nightResult: { dayIndex: 1, victimUuid: "phantom" },
    }),
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
// F-23(AC-05 보수) · commitWithReceipt — **수신 증거가 지금도 현재 범위인가**
//
// 공개 사망·재판 결과는 그대로 승패(winResult)를 실을 수 있다. 그런데 그 커밋 경로는 예전에
// 넘겨받은 수신 범위를 "누가 받았는지"의 기록으로만 쓰고, **커밋하는 그 순간에도 그 범위가
// 현재인지**는 묻지 않았다 — 캡처 뒤 내 소속이나 판이 바뀌어도 그대로 반영됐다.
//
// 아래 두 시험은 그 경계를 양쪽에서 고정한다: 현재 범위의 증거는 예전과 똑같이 커밋되고,
// 지나간 범위의 같은 증거는 store를 한 글자도 바꾸지 않는다.
// ---------------------------------------------------------------------------

/** 본인(p1)이 소속 식별자를 갖는 진행 중 세션. 소속 축이 실제로 움직일 수 있어야 한다. */
function seedSeatedState({ membershipId = "mem-a", phase = "DAY", dayIndex = 1 } = {}) {
  return seedState({
    phase,
    dayIndex,
    players: [
      { uuid: "p1", nickname: "P1", alive: true, membershipId },
      { uuid: "p2", nickname: "P2", alive: true, membershipId: "mem-b" },
    ],
    self: { uuid: "p1", nickname: "P1", role: "CITIZEN" },
  })
}

/** parsePlayerEliminatedPayload가 통과시킨 뒤의 값과 같은 모양(끊김 사망이 승패를 확정한 경우). */
function parsedTerminalElimination() {
  return {
    gameId: "game-1",
    phase: "ENDED",
    dayIndex: 1,
    victimUuid: "p2",
    players: [{ uuid: "p1", alive: true }, { uuid: "p2", alive: false }],
    terminal: true,
    winResult: { winner: "JOKER" },
  }
}

test("commitWithReceipt: 현재 범위에서 캡처한 수신 증거는 예전과 똑같이 커밋된다", () => {
  seedSeatedState()
  const receipt = readInGameReceiptScope({ accountId: "p1", identityGeneration: 0 })

  useInGameStore.getState().applyPlayerEliminated(parsedTerminalElimination(), receipt)

  const after = useInGameStore.getState().state
  assert.equal(after.phase, "ENDED")
  assert.deepEqual(after.winResult, { winner: "JOKER" })
  assert.equal(after.players.find((p) => p.uuid === "p2").alive, false)
})

test("commitWithReceipt: 소속이 교체된 뒤 도착한 같은 수신 증거는 거절되어 store가 전혀 변경되지 않는다", () => {
  seedSeatedState({ membershipId: "mem-a" })
  const receipt = readInGameReceiptScope({ accountId: "p1", identityGeneration: 0 })

  // 같은 판·같은 계정이지만 내 자리가 바뀌었다(이탈→재입장). 캡처한 증거는 여기서 지나간다.
  seedSeatedState({ membershipId: "mem-after" })

  const before = useInGameStore.getState()
  const stateBefore = before.state
  let notifyCount = 0
  const unsubscribe = useInGameStore.subscribe(() => { notifyCount += 1 })

  useInGameStore.getState().applyPlayerEliminated(parsedTerminalElimination(), receipt)

  unsubscribe()

  assert.equal(useInGameStore.getState(), before, "지난 범위의 증거가 store 최상위 참조를 바꿨다")
  assert.equal(useInGameStore.getState().state, stateBefore, "지난 범위의 증거가 game state를 바꿨다")
  assert.equal(notifyCount, 0, "거절된 커밋이 구독자를 깨웠다")
  assert.equal(stateBefore.phase, "DAY")
  assert.equal(stateBefore.winResult ?? null, null, "지난 범위의 증거가 종료 결과를 실었다")
})

test("commitWithReceipt: 같은 자리로 되돌아온 A→B→A 뒤에도 그 사이의 수신 증거는 거절되고, 새 증거는 정상 커밋된다", () => {
  // 이 시험이 따로 있는 이유: 값 비교만으로는 이 구간이 드러나지 않는다. 이탈→재입장을 지나면
  // 소속 식별자는 원래 값으로 **돌아오므로**, 캡처 당시와 커밋 시점의 membershipId·gameId·
  // 계정이 전부 같다. 그 사이에 실제로 두 번 전이했다는 사실을 아는 값은 전이 세대뿐이다.
  seedSeatedState({ membershipId: "mem-a" })
  const staleReceipt = readInGameReceiptScope({ accountId: "p1", identityGeneration: 0 })

  seedSeatedState({ membershipId: "mem-b" }) // 이탈(다른 자리)
  seedSeatedState({ membershipId: "mem-a" }) // 재입장 — 값은 캡처 당시와 똑같아졌다

  const current = readInGameReceiptScope({ accountId: "p1", identityGeneration: 0 })
  assert.equal(current.membershipId, staleReceipt.membershipId, "전제: 소속 식별자 값은 되돌아와 있어야 한다")
  assert.equal(current.gameId, staleReceipt.gameId, "전제: 판도 그대로여야 한다")
  assert.notEqual(current.membershipEpoch, staleReceipt.membershipEpoch, "전제: 전이 세대만이 두 범위를 가른다")

  const before = useInGameStore.getState()
  useInGameStore.getState().applyPlayerEliminated(parsedTerminalElimination(), staleReceipt)
  assert.equal(useInGameStore.getState(), before, "왕복 이전에 캡처된 증거가 그대로 커밋됐다")
  assert.equal(useInGameStore.getState().state.winResult ?? null, null)

  // 같은 사건이라도 **지금 자리에서** 캡처한 증거는 그대로 커밋된다(영구 차단이 아니다).
  useInGameStore.getState().applyPlayerEliminated(parsedTerminalElimination(), current)
  assert.equal(useInGameStore.getState().state.phase, "ENDED", "현재 범위의 증거까지 막혔다")
  assert.deepEqual(useInGameStore.getState().state.winResult, { winner: "JOKER" })
})
