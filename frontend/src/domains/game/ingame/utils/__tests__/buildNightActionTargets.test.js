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
    assert.deepEqual(Object.keys(player).sort(), ["alive", "connected", "id", "name"])
  }
})

test("name은 원본 player.nickname 값이다", () => {
  const [result] = buildNightActionTargets(
    [{ id: "u1", nickname: "닉네임A", status: INGAME_PLAYER_STATUS.ALIVE }],
    { localPlayerId: "other", selfTargetAllowed: true },
  )
  assert.equal(result.name, "닉네임A")
})

test("players가 배열이 아니거나 없으면 빈 배열을 반환한다", () => {
  assert.deepEqual(buildNightActionTargets(null, { localPlayerId: "u1", selfTargetAllowed: true }), [])
  assert.deepEqual(buildNightActionTargets(undefined, { localPlayerId: "u1", selfTargetAllowed: true }), [])
  assert.deepEqual(buildNightActionTargets({}, { localPlayerId: "u1", selfTargetAllowed: true }), [])
})
