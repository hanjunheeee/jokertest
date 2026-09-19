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
    // F-23(AC-05/AC-06): 기존 네 축이 전부 같은 채로 지나갈 수 있는 세 전이를 덮는 축이다.
    requestIdentityGeneration: 3,
    currentIdentityGeneration: 3,
    requestMembershipId: "mem-1",
    currentMembershipId: "mem-1",
    requestSocketId: "sock-1",
    currentSocketId: "sock-1",
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

// ── F-23(AC-05/AC-06): 기존 네 축이 전부 같은 채로 지나가는 세 전이 ──────────────
//
// 아래 세 경우는 uuid·gameId·socket 객체·epoch가 모두 그대로다. 각 축을 하나씩만 바꿔
// 독립적으로 stale이 되는지 확인한다(다른 축에 얹혀 통과하지 않는다).

test("계정 A→B→A: uuid는 원래대로 돌아와도 인증 전이 세대가 다르면 true를 반환한다", () => {
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({
      requestAuthUuid: "user-a", currentAuthUuid: "user-a", currentIdentityGeneration: 5,
    })),
    true,
  )
})

test("같은 판에서 소속만 교체되면(이탈→재입장) true를 반환한다", () => {
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({ currentMembershipId: "mem-2" })),
    true,
  )
})

test("빈 store bootstrap처럼 소속이 양쪽 모두 null이면 그 축으로는 stale이 되지 않는다", () => {
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({
      requestMembershipId: null, currentMembershipId: null,
    })),
    false,
  )
})

test("같은 Socket 객체가 재연결되어 id만 바뀌면 true를 반환한다 — 객체 동일성 검사만으로는 잡히지 않는다", () => {
  const socket = { connected: true }
  assert.equal(
    isStaleSessionSnapshotAckResponse(freshArgs({
      requestSocket: socket, currentSocket: socket,
      requestSocketId: "sock-1", currentSocketId: "sock-2",
    })),
    true,
  )
})

test("새 축을 전혀 주지 않는 옛 호출부는 그대로 통과한다(양쪽 모두 undefined)", () => {
  const socket = { connected: true }
  assert.equal(
    isStaleSessionSnapshotAckResponse({
      mounted: true,
      requestEpochVersion: 1, currentEpochVersion: 1,
      requestGameId: "game-1", currentGameId: "game-1",
      requestAuthUuid: "user-a", currentAuthUuid: "user-a",
      requestSocket: socket, currentSocket: socket,
    }),
    false,
  )
})
