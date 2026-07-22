import test from "node:test"
import assert from "node:assert/strict"
import { buildPlayerSessionSourceFromGameState } from "../buildPlayerSessionSourceFromGameState.js"

function validState(overrides = {}) {
  return {
    id: "game-1",
    phase: "ROLE_REVEAL",
    dayIndex: 0,
    players: [
      { uuid: "u1", nickname: "호스트" },
      { uuid: "u2", nickname: "참가자" },
    ],
    self: { uuid: "u1", nickname: "호스트", role: "JOKER" },
    ...overrides,
  }
}

test("정상 입력: uuid→id, nickname→name, connected:true, alive:true로 변환된다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  assert.deepEqual(result.sourcePlayers[0], { id: "u1", name: "호스트", connected: true, alive: true, role: "JOKER" })
  assert.deepEqual(result.sourcePlayers[1], { id: "u2", name: "참가자", connected: true, alive: true })
})

test("self.uuid가 localPlayerId로 그대로 전달된다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  assert.equal(result.localPlayerId, "u1")
})

test("본인 항목에만 role이 있고 값이 state.self.role과 일치한다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  const self = result.sourcePlayers.find((p) => p.id === "u1")
  assert.equal(self.role, "JOKER")
})

test("본인이 아닌 다른 모든 참가자 항목에는 role 키 자체가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  const other = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(Object.hasOwn(other, "role"), false)
})

test("입력 state(및 하위 players, self)가 호출 전후로 변형되지 않는다", () => {
  const state = validState()
  const before = JSON.parse(JSON.stringify(state))
  buildPlayerSessionSourceFromGameState(state)
  assert.deepEqual(state, before)
})

test("state가 null/undefined이면 안전한 fallback을 반환한다", () => {
  assert.deepEqual(buildPlayerSessionSourceFromGameState(null), { sourcePlayers: null, localPlayerId: null })
  assert.deepEqual(buildPlayerSessionSourceFromGameState(undefined), { sourcePlayers: null, localPlayerId: null })
})

test("state.players가 배열이 아니면 안전한 fallback을 반환한다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState({ players: "not-an-array" }))
  assert.equal(result.sourcePlayers, null)
  assert.equal(result.localPlayerId, null)
})

test("players 원소가 객체가 아니거나 uuid가 없거나 빈 문자열이면 목록 전체가 fallback된다", () => {
  const notObject = buildPlayerSessionSourceFromGameState(validState({ players: ["not-object", { uuid: "u2", nickname: "B" }] }))
  assert.equal(notObject.sourcePlayers, null)

  const missingUuid = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ nickname: "A" }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(missingUuid.sourcePlayers, null)

  const emptyUuid = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "", nickname: "A" }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(emptyUuid.sourcePlayers, null)
})

test("players 원소의 nickname이 문자열이 아니면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "u1", nickname: 123 }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("players 원소의 nickname이 공백뿐인 문자열이면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "u1", nickname: "   " }, { uuid: "u2", nickname: "B" }] }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("players에 uuid가 중복된 원소가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ players: [{ uuid: "u1", nickname: "A" }, { uuid: "u1", nickname: "B" }] }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("state.self가 없거나 self.uuid가 players 목록에 없으면 EMPTY_RESULT다", () => {
  const noSelf = buildPlayerSessionSourceFromGameState(validState({ self: null }))
  assert.equal(noSelf.sourcePlayers, null)
  assert.equal(noSelf.localPlayerId, null)

  const unknownSelf = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "not-in-list", role: "JOKER" } }))
  assert.equal(unknownSelf.sourcePlayers, null)
  assert.equal(unknownSelf.localPlayerId, null)
})

test("state.self.role이 허용 목록(JOKER/CITIZEN)에 없는 값이면 EMPTY_RESULT다", () => {
  const typo = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: "Joker" } }))
  assert.equal(typo.sourcePlayers, null)

  const nullRole = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: null } }))
  assert.equal(nullRole.sourcePlayers, null)

  const numberRole = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: 1 } }))
  assert.equal(numberRole.sourcePlayers, null)
})

test("CITIZEN 역할도 정상 통과한다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u2", nickname: "참가자", role: "CITIZEN" } }))
  const self = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(self.role, "CITIZEN")
  assert.equal(result.localPlayerId, "u2")
})
