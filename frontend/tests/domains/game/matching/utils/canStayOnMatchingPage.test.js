import assert from "node:assert/strict"
import test from "node:test"
import { canStayOnMatchingPage } from "../../../../../src/domains/game/matching/utils/canStayOnMatchingPage.js"

test("파티 재입장 대기 중이면 방이 없어도 대기방에 머문다", () => {
  assert.equal(canStayOnMatchingPage({
    awaiting: true,
    isInRoom: false,
    roomId: null,
    players: [],
    myUuid: "me",
  }), true)
})

test("방에 내 자리가 없으면 대기방에 머물 수 없다", () => {
  assert.equal(canStayOnMatchingPage({
    awaiting: false,
    isInRoom: true,
    roomId: "room-1",
    players: [{ uuid: "other" }],
    myUuid: "me",
  }), false)
})

test("방에 내가 앉아 있으면 대기방에 머문다", () => {
  assert.equal(canStayOnMatchingPage({
    awaiting: false,
    isInRoom: true,
    roomId: "room-1",
    players: [{ uuid: "me" }],
    myUuid: "me",
  }), true)
})

test("결과 화면 직후 로컬 신뢰 구간이면 플레이어 목록이 아직 비어도 대기방에 머문다", () => {
  assert.equal(canStayOnMatchingPage({
    awaiting: false,
    isInRoom: true,
    roomId: "room-1",
    players: [],
    myUuid: "me",
    roomLocalTrustUntil: Date.now() + 60_000,
  }), true)
})