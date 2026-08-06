import test from "node:test"
import assert from "node:assert/strict"
import { resolveInGameRoleRevealAllies } from "../resolveInGameRoleRevealAllies.js"

const PLAYERS = [
  { uuid: "p1", nickname: "Alice" },
  { uuid: "p2", nickname: "Bob" },
  { uuid: "p3", nickname: "Carol" },
]

test("resolveInGameRoleRevealAllies: allies가 null/undefined/빈 배열이면 빈 배열을 반환한다", () => {
  assert.deepEqual(resolveInGameRoleRevealAllies(null, PLAYERS), [])
  assert.deepEqual(resolveInGameRoleRevealAllies(undefined, PLAYERS), [])
  assert.deepEqual(resolveInGameRoleRevealAllies([], PLAYERS), [])
})

test("resolveInGameRoleRevealAllies: players가 배열이 아니면 빈 배열을 반환한다", () => {
  assert.deepEqual(resolveInGameRoleRevealAllies(["p1"], null), [])
})

test("resolveInGameRoleRevealAllies: ally uuid를 players의 nickname과 매칭해 {uuid, nickname} 목록을 만든다", () => {
  const result = resolveInGameRoleRevealAllies(["p2", "p3"], PLAYERS)
  assert.deepEqual(result, [
    { uuid: "p2", nickname: "Bob" },
    { uuid: "p3", nickname: "Carol" },
  ])
})

test("resolveInGameRoleRevealAllies: roster에 없는 uuid는 조용히 걸러낸다(오염된 payload 방어)", () => {
  const result = resolveInGameRoleRevealAllies(["p2", "unknown-uuid"], PLAYERS)
  assert.deepEqual(result, [{ uuid: "p2", nickname: "Bob" }])
})
