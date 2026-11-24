// 대기방 끊김 반영 시험(화면 상태): 손님 빠짐·방장 바뀜 알림, 다시 붙으면 방 물음, 15초 넘어 붙으면 방 없음·안이면 그대로, 방 없음 답 350ms×8 재확인, 끊긴 채 20초면 나가기
// 목록 A09-끊김-나가기-탈주.md A09-F-169~171·178~179·283~287, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a09-departure/room-reconnect.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import * as K from "./a09Kit.mjs"

const { useRoom } = await import("../../src/domains/game/matching/hooks/room/useRoom.js")
const {
  EMPTY_ROOM_MAX_RETRIES, EMPTY_ROOM_RETRY_MS, MATCHING_DISCONNECT_EXIT_MS,
} = await import("../../src/domains/game/matching/constants/roomTiming.js")

test.afterEach(() => K.reset())

// 대기방 훅만 쓰는 작은 화면 (방 삭제·판 시작 신호는 모음)
const NOOP = () => {}
function RoomProbe({ api, onRoomDeleted = NOOP }) {
  api.current = useRoom({ onRoomDeleted, onGameStarted: NOOP })
  return K.h("p", null, api.current.isRoomVerified ? "확인됨" : "확인 전")
}
async function openRoom({ n = 6, me = 0, onRoomDeleted = NOOP } = {}) {
  const room = K.roomOf({ n })
  const seated = K.sitInRoom({ room, me })
  const api = { current: null }
  await K.renderRoutes({ path: "/game-matching", element: K.h(RoomProbe, { api, onRoomDeleted }) })
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

// 클라에 방이 있는데 서버가 방 없음이면 바로 안 비우고 350ms마다 8번 다시 물은 뒤 비움 (방 만든 직후 서버가 늦는 때를 버팀)
// 그 재확인을 가짜 시계로 넘김
async function passEmptyRetries() {
  for (let i = 0; i < EMPTY_ROOM_MAX_RETRIES; i += 1) {
    await K.tick(EMPTY_ROOM_RETRY_MS)
    await K.flush()
  }
}

test("A09-F-178 8명 방 15초 지난 뒤 다시 붙음 → get_current_room 방 없음 → 방 스토어 비움", async () => {
  const { fake, roomAnswer } = await openRoom({ n: 8, me: 4 })
  roomAnswer.current = { ok: true, room: null }
  mock.timers.enable({ apis: ["setTimeout"] })
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.flush(10)
  await passEmptyRetries()
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

test("A09-F-283 6명 방 다시 붙음 → 방 없음 답 → 350ms마다 다시 물어 8번까지(첫 물음 + 8번), 다 물을 때까지 방 그대로", async () => {
  const { fake, roomAnswer } = await openRoom({ n: 6, me: 2 })
  roomAnswer.current = { ok: true, room: null }
  mock.timers.enable({ apis: ["setTimeout"] })
  const before = fake.sentOf("get_current_room").length
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.flush(10)
  assert.equal(fake.sentOf("get_current_room").length, before + 1)
  for (let i = 1; i <= EMPTY_ROOM_MAX_RETRIES; i += 1) {
    assert.equal(K.useMatchingStore.getState().isInRoom, true, `${i}번째 재확인 전에 방이 비워짐`)
    await K.tick(EMPTY_ROOM_RETRY_MS)
    await K.flush()
    assert.equal(fake.sentOf("get_current_room").length, before + 1 + i)
  }
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
  // 다 물은 뒤엔 더 안 물음
  await K.tick(EMPTY_ROOM_RETRY_MS * 3)
  await K.flush()
  assert.equal(fake.sentOf("get_current_room").length, before + 1 + EMPTY_ROOM_MAX_RETRIES)
})

test("A09-F-284 6명 방 다시 붙음 → 방 없음 답 2번 뒤 서버가 그 방을 돌려줌 → 방 안 비우고 확인됨", async () => {
  const { room, fake, roomAnswer, api } = await openRoom({ n: 6, me: 1 })
  roomAnswer.current = { ok: true, room: null }
  mock.timers.enable({ apis: ["setTimeout"] })
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.flush(10)
  await K.tick(EMPTY_ROOM_RETRY_MS)
  await K.flush()
  roomAnswer.current = { ok: true, room }
  await K.tick(EMPTY_ROOM_RETRY_MS)
  await K.flush()
  assert.equal(K.useMatchingStore.getState().roomId, room.roomId)
  assert.equal(K.useMatchingStore.getState().players.length, 6)
  assert.equal(api.current.isRoomVerified, true)
})

test("A09-F-285 5명 방 끊긴 채 20초(MATCHING_DISCONNECT_EXIT_MS) → 방 비우고 방 삭제 신호(socket_stale), 그 전엔 방 그대로", async () => {
  const deleted = []
  const { fake } = await openRoom({ n: 5, me: 3, onRoomDeleted: (meta) => deleted.push(meta) })
  mock.timers.enable({ apis: ["setTimeout"] })
  await K.dropConnection(fake)
  await K.tick(MATCHING_DISCONNECT_EXIT_MS - 1)
  assert.equal(K.useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(deleted, [])
  await K.tick(1)
  assert.equal(K.useMatchingStore.getState().isInRoom, false)
  assert.deepEqual(deleted.map((meta) => meta?.reason), ["socket_stale"])
})

test("A09-F-286 5명 방 끊긴 뒤 20초 안에 다시 붙음 → 20초가 지나도 끊김 나가기 안 함", async () => {
  const deleted = []
  const { room, fake } = await openRoom({ n: 5, me: 3, onRoomDeleted: (meta) => deleted.push(meta) })
  mock.timers.enable({ apis: ["setTimeout"] })
  await K.dropConnection(fake)
  await K.tick(MATCHING_DISCONNECT_EXIT_MS - 5_000)
  await K.restoreConnection(fake)
  await K.flush(10)
  await K.tick(10_000)
  await K.flush()
  assert.equal(K.useMatchingStore.getState().roomId, room.roomId)
  assert.equal(deleted.some((meta) => meta?.reason === "socket_stale"), false)
})

test("A09-F-287 방 만든 직후 로컬 믿음 20초 안(markLocalRoomTrust) → 다시 붙어 방 없음 답이 8번 재확인 뒤에도 와도 방 안 비움", async () => {
  const deleted = []
  const { room, fake, roomAnswer } = await openRoom({ n: 6, me: 0, onRoomDeleted: (meta) => deleted.push(meta) })
  K.RTL.act(() => { K.useMatchingStore.getState().markLocalRoomTrust() })
  roomAnswer.current = { ok: true, room: null }
  mock.timers.enable({ apis: ["setTimeout"] })
  await K.dropConnection(fake)
  await K.restoreConnection(fake)
  await K.flush(10)
  await passEmptyRetries()
  assert.equal(K.useMatchingStore.getState().roomId, room.roomId)
  assert.equal(K.useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(deleted, [])
})
