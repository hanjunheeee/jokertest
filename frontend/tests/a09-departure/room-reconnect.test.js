// 대기방 끊김 반영 시험(화면 상태): 손님 빠짐·방장 바뀜 알림, 다시 붙으면 방 물음, 15초 넘어 붙으면 방 없음·안이면 그대로
// 목록 A09-끊김-나가기-탈주.md A09-F-169~171·178~179, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/room-reconnect.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { useRoom } = await import("../../src/domains/game/matching/hooks/room/useRoom.js")

test.afterEach(() => K.reset())

// 대기방 훅만 쓰는 작은 화면 (방 삭제·판 시작 신호는 모음)
const NOOP = () => {}
function RoomProbe({ api }) {
  api.current = useRoom({ onRoomDeleted: NOOP, onGameStarted: NOOP })
  return K.h("p", null, api.current.isRoomVerified ? "확인됨" : "확인 전")
}
async function openRoom({ n = 6, me = 0 } = {}) {
  const room = K.roomOf({ n })
  const seated = K.sitInRoom({ room, me })
  const api = { current: null }
  await K.renderRoutes({ path: "/game-matching", element: K.h(RoomProbe, { api }) })
  await K.waitUntil(() => api.current?.isRoomVerified === true, { what: "방 확인" })
  return { room, api, ...seated }
}
const roomUuids = () => K.useMatchingStore.getState().players.map((p) => p.uuid).join(",")

test("A09-F-169 6명 방 손님 3번이 끊겨 15초 → player_left_room → 명단에서 빠짐", async () => {
  const { room, fake } = await openRoom({ n: 6 })
  await K.RTL.act(async () => { fake.fire("player_left_room", { uuid: room.players[3].uuid, canStart: false, roomId: room.roomId }) })
  await K.flush()
  assert.equal(roomUuids().includes(room.players[3].uuid), false)
  assert.equal(K.useMatchingStore.getState().players.length, 5)
})

test("A09-F-170 7명 방 방장 끊겨 15초 → host_changed 1번으로 → 방장 표시 1번", async () => {
  const { room, fake } = await openRoom({ n: 7, me: 2 })
  await K.RTL.act(async () => {
    fake.fire("player_left_room", { uuid: room.players[0].uuid, canStart: false, roomId: room.roomId })
    fake.fire("host_changed", { hostUuid: room.players[1].uuid, canStart: false, roomId: room.roomId, settingsVersion: room.settingsVersion })
  })
  await K.flush()
  assert.equal(K.useMatchingStore.getState().hostUuid, room.players[1].uuid)
})

test("A09-F-171 5명 방 내가 끊겼다 다시 붙음 → get_current_room 다시 물음", async () => {
  const { fake } = await openRoom({ n: 5, me: 1 })
  const before = fake.sentOf("get_current_room").length
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.flush()
  assert.equal(fake.sentOf("get_current_room").length, before + 1)
})

test("A09-F-178 8명 방 15초 지난 뒤 다시 붙음 → get_current_room 방 없음 → 방 스토어 비움", async () => {
  const { fake, roomAnswer } = await openRoom({ n: 8, me: 4 })
  roomAnswer.current = { ok: true, room: null }
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.flush(10)
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
  assert.equal(K.useMatchingStore.getState().roomId, null)
})

test("A09-F-179 6명 방 15초 안에 다시 붙음 → get_current_room 그 방 → 방 그대로", async () => {
  const { room, fake } = await openRoom({ n: 6, me: 3 })
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.flush(10)
  assert.equal(K.useMatchingStore.getState().roomId, room.roomId)
  assert.equal(K.useMatchingStore.getState().players.length, 6)
})
