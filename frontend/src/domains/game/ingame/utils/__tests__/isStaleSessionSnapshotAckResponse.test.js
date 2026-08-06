import test from "node:test"
import assert from "node:assert/strict"
import { isStaleSessionSnapshotAckResponse } from "../isStaleSessionSnapshotAckResponse.js"

function freshArgs(overrides = {}) {
  const socket = { connected: true }
  return {
    mounted: true,
    requestEpochVersion: 1,
    currentEpochVersion: 1,
    requestGameId: "game-1",
    currentGameId: "game-1",
    requestAuthUuid: "user-a",
    currentAuthUuid: "user-a",
    requestSocket: socket,
    currentSocket: socket,
    ...overrides,
  }
}

test("모든 조건이 최신이고 mounted면 false를 반환한다", () => {
  assert.equal(isStaleSessionSnapshotAckResponse(freshArgs()), false)
})

test("mounted:false면 true를 반환한다", () => {
  assert.equal(isStaleSessionSnapshotAckResponse(freshArgs({ mounted: false })), true)
})

test("requestEpochVersion과 currentEpochVersion이 다르면(더 새 요청/재연결로 세대가 지남) true를 반환한다", () => {
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({ currentEpochVersion: 2 })),
    true,
  )
})

test("requestGameId와 currentGameId가 다르면(그 사이 다른 게임으로 전환) true를 반환한다", () => {
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({ currentGameId: "game-2" })),
    true,
  )
})

test("requestAuthUuid와 currentAuthUuid가 다르면(그 사이 인증 계정이 전환) true를 반환한다", () => {
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({ currentAuthUuid: "user-b" })),
    true,
  )
})

test("requestSocket과 currentSocket이 다르면(socket 인스턴스가 교체) true를 반환한다 — 다른 필드는 모두 최신이어도 socket 참조는 epoch version과 별개로 독립 검사된다", () => {
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({ currentSocket: { connected: true } })),
    true,
  )
})
