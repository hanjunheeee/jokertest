import test from "node:test"
import assert from "node:assert/strict"
import { isStaleRoleRevealAckResponse } from "../isStaleRoleRevealAckResponse.js"

function freshArgs(overrides = {}) {
  const socket = { connected: true }
  return {
    mounted: true,
    requestVersion: 1,
    currentVersion: 1,
    requestSocket: socket,
    currentSocket: socket,
    requestGameId: "game-1",
    currentGameId: "game-1",
    ...overrides,
  }
}

test("모든 조건이 최신이면 false를 반환한다", () => {
  assert.equal(isStaleRoleRevealAckResponse(freshArgs()), false)
})

test("mounted:false면 true를 반환한다", () => {
  assert.equal(isStaleRoleRevealAckResponse(freshArgs({ mounted: false })), true)
})

test("requestVersion과 currentVersion이 다르면(무효화됨) true를 반환한다", () => {
  assert.equal(isStaleRoleRevealAckResponse(freshArgs({ currentVersion: 2 })), true)
})

test("requestSocket과 currentSocket이 다르면(재연결로 소켓 객체 교체) true를 반환한다", () => {
  assert.equal(
    isStaleRoleRevealAckResponse(freshArgs({ currentSocket: { connected: true } })),
    true,
  )
})

test("requestSocket.connected가 false면 true를 반환한다", () => {
  const socket = { connected: false }
  assert.equal(
    isStaleRoleRevealAckResponse(freshArgs({ requestSocket: socket, currentSocket: socket })),
    true,
  )
})

test("currentGameId와 requestGameId가 다르면(그 사이 다른 게임으로 전환) true를 반환한다", () => {
  assert.equal(isStaleRoleRevealAckResponse(freshArgs({ currentGameId: "game-2" })), true)
})
