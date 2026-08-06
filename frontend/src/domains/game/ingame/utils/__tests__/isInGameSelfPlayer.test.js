import test from "node:test"
import assert from "node:assert/strict"
import { isInGameSelfPlayer } from "../isInGameSelfPlayer.js"

test("isInGameSelfPlayer: playerId가 localPlayerId와 같으면 true다", () => {
  assert.equal(isInGameSelfPlayer("uuid-1", "uuid-1"), true)
})

test("isInGameSelfPlayer: playerId가 localPlayerId와 다르면 false다", () => {
  assert.equal(isInGameSelfPlayer("uuid-1", "uuid-2"), false)
})

test("isInGameSelfPlayer: playerId/localPlayerId가 비어있거나 없으면 false다", () => {
  assert.equal(isInGameSelfPlayer("", "uuid-1"), false)
  assert.equal(isInGameSelfPlayer(null, "uuid-1"), false)
  assert.equal(isInGameSelfPlayer(undefined, undefined), false)
  assert.equal(isInGameSelfPlayer("uuid-1", null), false)
})

test("isInGameSelfPlayer: 닉네임이 같은 참가자가 여럿이어도 uuid가 일치하는 한 명만 본인으로 판정한다", () => {
  const localPlayerId = "uuid-2"
  const roster = [
    { id: "uuid-1", nickname: "같은닉네임" },
    { id: "uuid-2", nickname: "같은닉네임" },
    { id: "uuid-3", nickname: "같은닉네임" },
  ]

  const selfFlags = roster.map((player) => isInGameSelfPlayer(player.id, localPlayerId))

  assert.deepEqual(selfFlags, [false, true, false])
})
