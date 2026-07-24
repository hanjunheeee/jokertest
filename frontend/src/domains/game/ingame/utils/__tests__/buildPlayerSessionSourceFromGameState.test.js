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
    self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: [] },
    ...overrides,
  }
}

test("정상 입력: uuid→id, nickname→name, connected:true, alive:true로 변환된다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  assert.deepEqual(result.sourcePlayers[0], {
    id: "u1",
    name: "호스트",
    connected: true,
    alive: true,
    role: "JOKER",
    team: "JOKER",
  })
  assert.deepEqual(result.sourcePlayers[1], { id: "u2", name: "참가자", connected: true, alive: true })
})

test("self.uuid가 localPlayerId로 그대로 전달된다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  assert.equal(result.localPlayerId, "u1")
})

test("본인 항목에만 role/team이 있고 값이 state.self.role/team과 일치한다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  const self = result.sourcePlayers.find((p) => p.id === "u1")
  assert.equal(self.role, "JOKER")
  assert.equal(self.team, "JOKER")
})

test("본인이 아닌 다른 모든 참가자 항목에는 role/team 키 자체가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  const other = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(Object.hasOwn(other, "role"), false)
  assert.equal(Object.hasOwn(other, "team"), false)
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

test("state.self.role이 허용 목록(5개 역할)에 없는 값이면 EMPTY_RESULT다", () => {
  const typo = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: "Joker", team: "JOKER" } }))
  assert.equal(typo.sourcePlayers, null)

  const nullRole = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: null, team: "JOKER" } }))
  assert.equal(nullRole.sourcePlayers, null)

  const numberRole = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: 1, team: "JOKER" } }))
  assert.equal(numberRole.sourcePlayers, null)
})

test("CITIZEN 역할도 정상 통과한다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u2", nickname: "참가자", role: "CITIZEN", team: "CITIZEN" } }),
  )
  const self = result.sourcePlayers.find((p) => p.id === "u2")
  assert.equal(self.role, "CITIZEN")
  assert.equal(self.team, "CITIZEN")
  assert.equal(result.localPlayerId, "u2")
})

test("DOCTOR/GUARD/WITCH_HUNTER도 CITIZEN과 동일하게 self.role/team으로 정상 통과한다", () => {
  for (const role of ["DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    const result = buildPlayerSessionSourceFromGameState(
      validState({ self: { uuid: "u2", nickname: "참가자", role, team: "CITIZEN" } }),
    )
    const self = result.sourcePlayers.find((p) => p.id === "u2")
    assert.equal(self.role, role)
    assert.equal(self.team, "CITIZEN")
    assert.equal(result.localPlayerId, "u2")
  }
})

test("role과 team이 각각은 허용 목록 안에 있어도 서로 대응하지 않는 조합이면 EMPTY_RESULT다", () => {
  const jokerWithCitizenTeam = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", role: "JOKER", team: "CITIZEN" } }),
  )
  assert.equal(jokerWithCitizenTeam.sourcePlayers, null)

  const doctorWithJokerTeam = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u2", nickname: "참가자", role: "DOCTOR", team: "JOKER" } }),
  )
  assert.equal(doctorWithJokerTeam.sourcePlayers, null)

  const missingTeam = buildPlayerSessionSourceFromGameState(validState({ self: { uuid: "u1", role: "JOKER" } }))
  assert.equal(missingTeam.sourcePlayers, null)
})

test("self.role이 JOKER인데 allies own-property가 없으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER" } }),
  )
  assert.equal(result.sourcePlayers, null)
  assert.equal(result.localPlayerId, null)
})

test("self.role이 JOKER가 아닌데 allies가 존재하면(빈 배열이어도) EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u2", nickname: "참가자", role: "CITIZEN", team: "CITIZEN", allies: [] } }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("self.allies가 배열이 아니면 EMPTY_RESULT다", () => {
  for (const badAllies of ["u2", {}, null, 1]) {
    const result = buildPlayerSessionSourceFromGameState(
      validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: badAllies } }),
    )
    assert.equal(result.sourcePlayers, null)
  }
})

test("self.allies가 배열이어도 원소가 문자열이 아니거나 빈 문자열이면 EMPTY_RESULT다", () => {
  for (const badAllies of [[1], [""]]) {
    const result = buildPlayerSessionSourceFromGameState(
      validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: badAllies } }),
    )
    assert.equal(result.sourcePlayers, null)
  }
})

test("self.allies에 players 목록에 없는 uuid가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["not-in-list"] } }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("self.allies에 자기 자신의 uuid가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({ self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u1"] } }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("self.allies에 중복 uuid가 있으면 EMPTY_RESULT다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트" },
        { uuid: "u2", nickname: "참가자" },
        { uuid: "u3", nickname: "참가자2" },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u2", "u2"] },
    }),
  )
  assert.equal(result.sourcePlayers, null)
})

test("allies:[]인 정상 케이스는 통과하고 어떤 항목에도 isAlly가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(validState())
  for (const player of result.sourcePlayers) {
    assert.equal(Object.hasOwn(player, "isAlly"), false)
  }
})

test("allies에 있는 uuid의 sourcePlayers 항목에는 isAlly:true가 붙고, 없는 항목엔 키 자체가 없다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트" },
        { uuid: "u2", nickname: "동료" },
        { uuid: "u3", nickname: "시민" },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u2"] },
    }),
  )
  const ally = result.sourcePlayers.find((p) => p.id === "u2")
  const citizen = result.sourcePlayers.find((p) => p.id === "u3")
  const self = result.sourcePlayers.find((p) => p.id === "u1")
  assert.equal(ally.isAlly, true)
  assert.equal(Object.hasOwn(citizen, "isAlly"), false)
  assert.equal(Object.hasOwn(self, "isAlly"), false)
})

test("동료가 2명 이상이면 각 동료 uuid 모두에 isAlly:true가 붙는다", () => {
  const result = buildPlayerSessionSourceFromGameState(
    validState({
      players: [
        { uuid: "u1", nickname: "호스트" },
        { uuid: "u2", nickname: "동료B" },
        { uuid: "u3", nickname: "동료C" },
        { uuid: "u4", nickname: "시민" },
      ],
      self: { uuid: "u1", nickname: "호스트", role: "JOKER", team: "JOKER", allies: ["u2", "u3"] },
    }),
  )
  assert.equal(result.sourcePlayers.find((p) => p.id === "u2").isAlly, true)
  assert.equal(result.sourcePlayers.find((p) => p.id === "u3").isAlly, true)
  assert.equal(Object.hasOwn(result.sourcePlayers.find((p) => p.id === "u4"), "isAlly"), false)
})
