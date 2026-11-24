// 방 값 맞추기(normalizeRoomPayload) 시험: 서버·방 만들기 답의 칸 이름 차이(roomId/id, roomCode/code)를 setRoom 모양으로 맞춤, 틀린 값은 null
// 목록 A01-F-750~754 (방 스토어 setRoom·방 다시 넣기가 씀), 돌리기(frontend): node --experimental-test-module-mocks --test tests/domains/game/matching/utils/normalizeRoomPayload.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { normalizeRoomPayload } from "../../../../../src/domains/game/matching/utils/normalizeRoomPayload.js"

test("A01-F-750 서버 방 값(roomId·roomCode) → 같은 값으로, 빠진 칸은 기본값(명단 [], canStart false, 나머지 null)", () => {
  assert.deepEqual(normalizeRoomPayload({ roomId: "room-1", roomCode: "AB12CD", hostUuid: "host" }), {
    roomId: "room-1",
    roomCode: "AB12CD",
    players: [],
    hostUuid: "host",
    canStart: false,
    accessType: null,
    settings: null,
    settingsVersion: null,
    roomInstanceId: null,
    bootEpoch: null,
  })
})

test("A01-F-751 방 만들기 답 모양(id·code) → roomId·roomCode로 바꿔 담음", () => {
  const players = [{ uuid: "me" }]
  const room = normalizeRoomPayload({ id: "room-9", code: "ZZ99", players, canStart: true, accessType: "code", settingsVersion: 3 })
  assert.equal(room.roomId, "room-9")
  assert.equal(room.roomCode, "ZZ99")
  assert.equal(room.players, players)
  assert.equal(room.canStart, true)
  assert.equal(room.accessType, "code")
  assert.equal(room.settingsVersion, 3)
})

test("A01-F-752 roomId와 id가 같이 오면 roomId를 씀", () => {
  assert.equal(normalizeRoomPayload({ roomId: "room-a", id: "room-b" }).roomId, "room-a")
})

test("A01-F-753 방 id가 없거나 빈 글·글이 아님 / 값이 객체가 아님 → null", () => {
  for (const raw of [null, undefined, "room-1", 7, {}, { roomId: "" }, { id: 12 }, { roomCode: "AB12" }]) {
    assert.equal(normalizeRoomPayload(raw), null, JSON.stringify(raw))
  }
})

test("A01-F-754 명단이 배열이 아님 → 빈 명단, canStart는 true일 때만 true, 방 코드가 글이 아니면 null", () => {
  const room = normalizeRoomPayload({ roomId: "room-1", players: { uuid: "x" }, canStart: "yes", roomCode: 1234 })
  assert.deepEqual(room.players, [])
  assert.equal(room.canStart, false)
  assert.equal(room.roomCode, null)
})
