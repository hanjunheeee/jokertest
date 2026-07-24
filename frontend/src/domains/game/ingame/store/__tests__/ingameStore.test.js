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
