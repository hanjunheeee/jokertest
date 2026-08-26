import test from "node:test"
import assert from "node:assert/strict"
import { buildNightActionTargets } from "../buildNightActionTargets.js"
import { INGAME_PLAYER_STATUS } from "../../constants/board/status/ingamePlayerStatus.js"

function makePlayers() {
  return [
    { id: "u1", nickname: "A", status: INGAME_PLAYER_STATUS.ALIVE, role: "DOCTOR", team: "CITIZEN" },
    { id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.ALIVE },
    { id: "u3", nickname: "C", status: INGAME_PLAYER_STATUS.ALIVE },
    { id: "u4", nickname: "D", status: INGAME_PLAYER_STATUS.ALIVE },
  ]
}

test("selfTargetAllowed:true면 자기 자신을 포함해 전원을 반환한다", () => {
  const result = buildNightActionTargets(makePlayers(), { localPlayerId: "u1", selfTargetAllowed: true })
  assert.deepEqual(
    result.map((p) => p.id),
    ["u1", "u2", "u3", "u4"],
  )
})

test("selfTargetAllowed:false면 자기 자신(localPlayerId)만 제외한다", () => {
  const result = buildNightActionTargets(makePlayers(), { localPlayerId: "u1", selfTargetAllowed: false })
  assert.deepEqual(
    result.map((p) => p.id),
    ["u2", "u3", "u4"],
  )
})

test("status가 alive면 alive:true, connected:true다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u1", nickname: "A", status: INGAME_PLAYER_STATUS.ALIVE }],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result.alive, true)
  assert.equal(result.connected, true)
})

test("status가 dead면 alive:false, connected:true다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u1", nickname: "A", status: INGAME_PLAYER_STATUS.DEAD }],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result.alive, false)
  assert.equal(result.connected, true)
})

test("status가 disconnected면 connected:false, alive:true다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u1", nickname: "A", status: INGAME_PLAYER_STATUS.DISCONNECTED }],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result.alive, true)
  assert.equal(result.connected, false)
})

test("반환된 id는 원본 player.id(서버 uuid)와 정확히 같다 — 제출 시 targetId로 쓰이므로 회귀 방지", () => {
  const players = makePlayers()
  const result = buildNightActionTargets(players, { localPlayerId: "u1", selfTargetAllowed: true })
  for (const [index, player] of players.entries()) {
    assert.equal(result[index].id, player.id)
  }
})

test("입력에 role/team이 있어도(본인 항목) 결과 객체에는 role/team 키 자체가 없다", () => {
  const result = buildNightActionTargets(makePlayers(), { localPlayerId: "u1", selfTargetAllowed: true })
  for (const player of result) {
    assert.equal(Object.hasOwn(player, "role"), false)
    assert.equal(Object.hasOwn(player, "team"), false)
    assert.deepEqual(Object.keys(player).sort(), ["alive", "connected", "id", "name", "selectable"])
  }
})

test("isAlly:true인 항목은 name에 '· 동료 JOKER' 접미사가 붙고 selectable:false다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.ALIVE, isAlly: true }],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result.name, "B · 동료 JOKER")
  assert.equal(result.selectable, false)
})

test("isAlly가 없거나 false인 항목은 name이 원래 nickname 그대로고 selectable:true다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.ALIVE }],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result.name, "B")
  assert.equal(result.selectable, true)
})

test("동료가 2명 이상이면 각각 자신의 닉네임으로 구분되는 접미사 문자열을 갖는다", () => {
  const result = buildNightActionTargets(
    [
      { id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.ALIVE, isAlly: true },
      { id: "u3", nickname: "C", status: INGAME_PLAYER_STATUS.ALIVE, isAlly: true },
    ],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result[0].name, "B · 동료 JOKER")
  assert.equal(result[1].name, "C · 동료 JOKER")
  assert.notEqual(result[0].name, result[1].name)
})

test("동료 JOKER 항목은 selfTargetAllowed:false여도 목록에서 제거되지 않는다(본인만 필터링 대상)", () => {
  const result = buildNightActionTargets(
    [{ id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.ALIVE, isAlly: true }],
    { localPlayerId: "other", selfTargetAllowed: false },
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].selectable, false)
})

test("입력 순서가 출력 순서에 그대로 반영된다(동료도 재배치되지 않는다)", () => {
  const players = [
    { id: "u1", nickname: "A", status: INGAME_PLAYER_STATUS.ALIVE, isAlly: true },
    { id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.ALIVE },
    { id: "u3", nickname: "C", status: INGAME_PLAYER_STATUS.ALIVE, isAlly: true },
  ]
  const result = buildNightActionTargets(players, { localPlayerId: "other", selfTargetAllowed: true })
  assert.deepEqual(
    result.map((p) => p.id),
    ["u1", "u2", "u3"],
  )
})

test("name은 원본 player.nickname 값이다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u1", nickname: "닉네임A", status: INGAME_PLAYER_STATUS.ALIVE }],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result.name, "닉네임A")
})

// ---------------------------------------------------------------------------
// deadTargetsOnly — 마녀사냥꾼(사망자만 지목) 전용 옵션
// ---------------------------------------------------------------------------

function makeMixedPlayers() {
  return [
    { id: "u1", nickname: "A", status: INGAME_PLAYER_STATUS.ALIVE },
    { id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.DEAD },
    { id: "u3", nickname: "C", status: INGAME_PLAYER_STATUS.ALIVE },
    { id: "u4", nickname: "D", status: INGAME_PLAYER_STATUS.DEAD },
  ]
}

test("deadTargetsOnly:true면 사망자만 selectable:true이고 생존자는 selectable:false다", () => {
  const result = buildNightActionTargets(makeMixedPlayers(), {
    localPlayerId: "other",
    selfTargetAllowed: false,
    deadTargetsOnly: true,
  })
  assert.deepEqual(
    result.map((p) => [p.id, p.selectable]),
    [
      ["u1", false],
      ["u2", true],
      ["u3", false],
      ["u4", true],
    ],
  )
})

test("deadTargetsOnly:true여도 생존자를 목록에서 지우지 않는다(길이·순서는 기본 경로와 동일)", () => {
  const players = makeMixedPlayers()
  const deadOnly = buildNightActionTargets(players, { localPlayerId: "other", deadTargetsOnly: true })
  const base = buildNightActionTargets(players, { localPlayerId: "other", deadTargetsOnly: false })
  assert.deepEqual(deadOnly.map((p) => p.id), base.map((p) => p.id))
  assert.equal(deadOnly.length, players.length)
})

test("deadTargetsOnly:true여도 동료 JOKER는 사망자든 아니든 selectable:false다(동료 규칙이 우선)", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u2", nickname: "B", status: INGAME_PLAYER_STATUS.DEAD, isAlly: true }],
    { localPlayerId: "other", selfTargetAllowed: true, deadTargetsOnly: true },
  )
  assert.equal(result.selectable, false)
})

test("deadTargetsOnly:true에서 disconnected는 살아있는 것으로 보므로 selectable:false, connected:false다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u1", nickname: "A", status: INGAME_PLAYER_STATUS.DISCONNECTED }],
    { localPlayerId: "other", selfTargetAllowed: true, deadTargetsOnly: true },
  )
  assert.equal(result.alive, true)
  assert.equal(result.connected, false)
  assert.equal(result.selectable, false)
})

test("deadTargetsOnly를 주지 않으면(다른 역할 턴) 생존자만 selectable:true다", () => {
  const result = buildNightActionTargets(makeMixedPlayers(), { localPlayerId: "other" })
  assert.deepEqual(
    result.map((p) => [p.id, p.selectable]),
    [
      ["u1", true],
      ["u2", false],
      ["u3", true],
      ["u4", false],
    ],
  )
})

test("deadTargetsOnly는 반환 키 집합을 바꾸지 않는다(다섯 키 그대로)", () => {
  const result = buildNightActionTargets(makeMixedPlayers(), {
    localPlayerId: "other",
    deadTargetsOnly: true,
  })
  for (const player of result) {
    assert.deepEqual(Object.keys(player).sort(), ["alive", "connected", "id", "name", "selectable"])
  }
})

test("players가 배열이 아니거나 없으면 빈 배열을 반환한다", () => {
  assert.deepEqual(buildNightActionTargets(null, { localPlayerId: "u1", selfTargetAllowed: true }), [])
  assert.deepEqual(buildNightActionTargets(undefined, { localPlayerId: "u1", selfTargetAllowed: true }), [])
  assert.deepEqual(buildNightActionTargets({}, { localPlayerId: "u1", selfTargetAllowed: true }), [])
})
