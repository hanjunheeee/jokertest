import test from "node:test"
import assert from "node:assert/strict"
import { useInGameStore } from "../ingameStore.js"
import { selectInGameNightTurnRole } from "../../utils/selectInGameNightTurnRole.js"

// payload 검증 자체는 parseNightTurnStartedPayload의 테스트가 다룬다 — 여기서는 검증을 통과한
// 값이 store에 어떻게 반영되고 언제 참조 보존 no-op이 되는지만 본다.

const GAME_ID = "game-1"
const DEADLINE = 1_700_000_030_000

/** 밤(NIGHT)에 들어와 있는 canonical state를 세팅한다. */
function seedNight({ dayIndex = 1, ...overrides } = {}) {
  const state = {
    id: GAME_ID,
    phase: "NIGHT",
    dayIndex,
    dayPhase: null,
    players: [
      { uuid: "u1", nickname: "A", alive: true },
      { uuid: "u2", nickname: "B", alive: false },
    ],
    self: { uuid: "u1", nickname: "A", role: "CITIZEN" },
    ...overrides,
  }
  useInGameStore.setState({ gameId: GAME_ID, state, error: null })
  return state
}

function startedPayload(overrides = {}) {
  return { gameId: GAME_ID, dayIndex: 1, role: "DOCTOR", deadline: DEADLINE, ...overrides }
}

function endedPayload(overrides = {}) {
  return { gameId: GAME_ID, dayIndex: 1, role: "DOCTOR", ...overrides }
}

// ── applyNightTurnStarted ───────────────────────────────────────────────────────

// 전부 "무시되어야 하는" 입력이다 — store 최상위 참조와 game state 참조가 그대로 유지된다.
const ignoredApplies = [
  ["parsed가 undefined면", () => seedNight(), undefined],
  ["parsed가 null이면", () => seedNight(), null],
  ["parsed가 배열이면", () => seedNight(), [GAME_ID, 1, "DOCTOR"]],
  ["gameId가 비어 있으면", () => seedNight(), startedPayload({ gameId: "" })],
  ["다른 게임의 턴이면", () => seedNight(), startedPayload({ gameId: "game-other" })],
  ["현재 state가 없으면", () => useInGameStore.setState({ gameId: GAME_ID, state: null, error: null }), startedPayload()],
  ["DAY이지만 dayIndex가 다르면", () => seedNight({ phase: "DAY", dayPhase: "DAY_DISCUSSION", dayIndex: 2 }), startedPayload({ dayIndex: 1 })],
  ["밤이 아니면(TRIBUNAL)", () => seedNight({ phase: "TRIBUNAL" }), startedPayload()],
  ["밤이 아니면(ENDED)", () => seedNight({ phase: "ENDED" }), startedPayload()],
  ["다른 밤의 턴이면", () => seedNight({ dayIndex: 2 }), startedPayload({ dayIndex: 1 })],
  ["role이 비어 있으면", () => seedNight(), startedPayload({ role: "" })],
  ["deadline이 유효하지 않으면", () => seedNight(), startedPayload({ deadline: 0 })],
]

for (const [label, setup, parsed] of ignoredApplies) {
  test(`applyNightTurnStarted: ${label} 무시된다 — store/game state 참조가 유지된다`, () => {
    setup()
    const storeBefore = useInGameStore.getState()
    const stateBefore = storeBefore.state

    useInGameStore.getState().applyNightTurnStarted(parsed)

    const storeAfter = useInGameStore.getState()
    assert.equal(storeAfter, storeBefore)
    assert.equal(storeAfter.state, stateBefore)
  })
}

test("applyNightTurnStarted: DAY여도 dayIndex가 같으면 턴 시계를 받는다(day_vote_resolved 레이스)", () => {
  seedNight({ phase: "DAY", dayPhase: "DAY_VOTE", dayIndex: 1 })
  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "JOKER" }))

  const { state } = useInGameStore.getState()
  assert.equal(state.phase, "DAY")
  assert.equal(state.nightTurnRole, "JOKER")
  assert.equal(state.nightTurnDeadline, DEADLINE)
})

test("applyNightTurnStarted: 유효한 턴은 nightTurnRole/nightTurnDeadline에 반영된다", () => {
  seedNight()
  useInGameStore.getState().applyNightTurnStarted(startedPayload())

  const { state } = useInGameStore.getState()
  assert.equal(state.nightTurnRole, "DOCTOR")
  assert.equal(state.nightTurnDeadline, DEADLINE)
  // 다른 canonical 필드는 건드리지 않는다 — 역할 턴은 밤 안의 하위 전이다.
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.dayIndex, 1)
})

test("applyNightTurnStarted: 반영된 역할이 selectInGameNightTurnRole의 canonical 턴이 된다", () => {
  seedNight()
  assert.equal(selectInGameNightTurnRole(useInGameStore.getState().state), null)

  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "GUARD" }))
  assert.equal(selectInGameNightTurnRole(useInGameStore.getState().state), "GUARD")
})

test("applyNightTurnStarted: 같은 턴의 중복 방송은 참조 보존 no-op이다", () => {
  seedNight()
  useInGameStore.getState().applyNightTurnStarted(startedPayload())
  const stateAfterFirst = useInGameStore.getState().state

  useInGameStore.getState().applyNightTurnStarted(startedPayload())
  assert.equal(useInGameStore.getState().state, stateAfterFirst)
})

test("applyNightTurnStarted: 턴이 실제로 바뀌면 새 참조를 만든다", () => {
  seedNight()
  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "JOKER" }))
  const afterJoker = useInGameStore.getState().state

  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "DOCTOR" }))
  const afterDoctor = useInGameStore.getState().state

  assert.notEqual(afterDoctor, afterJoker)
  assert.equal(afterDoctor.nightTurnRole, "DOCTOR")
})

test("applyNightTurnStarted: 죽은 역할의 턴도 산 역할의 턴과 똑같이 반영된다", () => {
  // u2(DOCTOR 자리)가 죽어 있든 말든 store는 생존을 보지 않는다 — 모든 참가자 화면이 같은
  // canonical 턴을 보고 같은 안내를 연다.
  seedNight()
  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "DOCTOR" }))
  const deadRoleTurn = useInGameStore.getState().state.nightTurnRole

  seedNight()
  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "JOKER" }))
  const aliveRoleTurn = useInGameStore.getState().state.nightTurnRole

  assert.equal(deadRoleTurn, "DOCTOR")
  assert.equal(aliveRoleTurn, "JOKER")
})

test("applyNightTurnEnded: 현재 턴과 일치하면 role/deadline을 함께 비운다", () => {
  seedNight()
  useInGameStore.getState().applyNightTurnStarted(startedPayload())
  useInGameStore.getState().applyNightTurnEnded(endedPayload())

  const { state } = useInGameStore.getState()
  assert.equal(state.nightTurnRole, null)
  assert.equal(state.nightTurnDeadline, null)
  assert.equal(selectInGameNightTurnRole(state), null)
})

for (const [label, payload] of [
  ["다른 게임", endedPayload({ gameId: "other" })],
  ["다른 날짜", endedPayload({ dayIndex: 2 })],
  ["다른 역할", endedPayload({ role: "GUARD" })],
  ["빈 입력", null],
]) {
  test(`applyNightTurnEnded: ${label} 종료 방송은 현재 턴을 지우지 않는다`, () => {
    seedNight()
    useInGameStore.getState().applyNightTurnStarted(startedPayload())
    const before = useInGameStore.getState()
    useInGameStore.getState().applyNightTurnEnded(payload)
    assert.equal(useInGameStore.getState(), before)
  })
}

test("applyNightTurnEnded: 이미 지워진 턴의 중복 종료는 참조 보존 no-op이다", () => {
  seedNight()
  useInGameStore.getState().applyNightTurnStarted(startedPayload())
  useInGameStore.getState().applyNightTurnEnded(endedPayload())
  const before = useInGameStore.getState()
  useInGameStore.getState().applyNightTurnEnded(endedPayload())
  assert.equal(useInGameStore.getState(), before)
})

// ── 밤을 벗어날 때의 정리 ────────────────────────────────────────────────────────

test("밤 결과 적용(NIGHT→DAY)이 역할 턴을 비운다 — 지난 밤의 턴이 다음 밤으로 이월되지 않는다", () => {
  seedNight({ dayIndex: 1 })
  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "WITCH_HUNTER", dayIndex: 1 }))
  assert.equal(useInGameStore.getState().state.nightTurnRole, "WITCH_HUNTER")

  useInGameStore.getState().applyNightResultAppliedPayload({
    gameId: GAME_ID,
    phase: "DAY",
    dayIndex: 2,
    players: [
      { uuid: "u1", alive: true },
      { uuid: "u2", alive: false },
    ],
  })

  const { state } = useInGameStore.getState()
  assert.equal(state.phase, "DAY")
  assert.equal(state.nightTurnRole, null)
  assert.equal(state.nightTurnDeadline, null)
})

test("밤 결과 적용(NIGHT→ENDED)이 역할 턴을 비운다", () => {
  seedNight({ dayIndex: 1 })
  useInGameStore.getState().applyNightTurnStarted(startedPayload({ role: "GUARD", dayIndex: 1 }))

  useInGameStore.getState().applyNightResultAppliedPayload({
    gameId: GAME_ID,
    phase: "ENDED",
    dayIndex: 1,
    players: [
      { uuid: "u1", isAlive: true },
      { uuid: "u2", isAlive: false },
    ],
  })

  const { state } = useInGameStore.getState()
  assert.equal(state.phase, "ENDED")
  assert.equal(state.nightTurnRole, null)
  assert.equal(state.nightTurnDeadline, null)
})

test("낮 투표 판정(DAY→NIGHT)은 역할 턴이 비워진 채로 밤에 들어간다", () => {
  seedNight({ phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE" })
  useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, { outcome: "TIE" })

  const { state } = useInGameStore.getState()
  assert.equal(state.phase, "NIGHT")
  assert.equal(state.nightTurnRole, null)
  assert.equal(state.nightTurnDeadline, null)
  assert.equal(selectInGameNightTurnRole(state), null)
})
