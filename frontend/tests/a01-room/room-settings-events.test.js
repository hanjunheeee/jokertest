// 설정 바뀜 받기 시험(가짜 소켓): room_settings_updated 알림 → 대기방 스토어 설정·버전·준비 풀림, 옛 버전 무시, 손님 내 준비 풀림
// 목록 A01a "화면 PC" A01-F-072~074, 5명 방
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, cleanup, waitFor, act } = await import("@testing-library/react")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const H = await import("./a01a-helpers.mjs")

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs({ confirm: false })
})
test.afterEach(() => cleanup())

const waitVerified = () => waitFor(() => assert.equal(screen.getByTestId("sync").textContent, "확인됨"))

// 서버가 보내는 설정 바뀜 알림 (명단은 전원 준비 풀림)
const settingsUpdated = (room, { settingsVersion, settings }) => ({
  roomId: room.roomId,
  settingsVersion,
  accessType: room.accessType,
  settings: { ...room.settings, ...settings },
  players: room.players.map((p) => ({ ...p, isReady: false })),
  canStart: false,
  hostUuid: room.hostUuid,
})

test("A01-F-072 설정 바뀜 알림(버전 3·정원 8·전원 준비 풀림) → 스토어 설정·버전·준비 꺼짐·canStart false", async () => {
  const room = H.roomOf({ n: 5, settingsVersion: 2, ready: ["guest-1", "guest-2", "guest-3", "guest-4"], canStart: false })
  const { socket } = H.renderRoomHook({ room })
  await waitVerified()
  act(() => socket.serverSays("room_settings_updated", settingsUpdated(room, { settingsVersion: 3, settings: { maxPlayers: 8 } })))
  const s = useMatchingStore.getState()
  assert.equal(s.settingsVersion, 3)
  assert.equal(s.settings.maxPlayers, 8)
  assert.equal(s.players.filter((p) => p.isReady).length, 0)
  assert.equal(s.canStart, false)
})

test("A01-F-073 [지금 동작] 버전 3인 스토어에 버전 2 알림 → 그대로", async () => {
  const room = H.roomOf({ n: 5, settingsVersion: 3, ready: ["guest-1"] })
  const { socket } = H.renderRoomHook({ room })
  await waitVerified()
  act(() => socket.serverSays("room_settings_updated", settingsUpdated(room, { settingsVersion: 2, settings: { maxPlayers: 6 } })))
  const s = useMatchingStore.getState()
  assert.equal(s.settingsVersion, 3)
  assert.equal(s.settings.maxPlayers, 10)
  assert.equal(s.players.find((p) => p.uuid === "guest-1").isReady, true)
})

test("A01-F-074 준비한 손님 화면에 알림 → 내 준비 꺼짐", async () => {
  const room = H.roomOf({ n: 5, settingsVersion: 2, ready: ["guest-1"] })
  const { socket } = H.renderRoomHook({ room, me: "guest-1" })
  await waitVerified()
  act(() => socket.serverSays("room_settings_updated", settingsUpdated(room, { settingsVersion: 3, settings: { dayDiscussionTime: 90 } })))
  const me = useMatchingStore.getState().players.find((p) => p.uuid === "guest-1")
  assert.equal(me.isReady, false)
})
