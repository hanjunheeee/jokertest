// 설정 저장 결과 시험(가짜 소켓): 정원 줄이기 거절 글, 버전 충돌이면 최신 방, 답 잃으면 결과 다시 묻기, 방장 아님 글, 안 바뀜
// 목록 A01a "화면 PC" A01-F-089~093, 7명 방(방장 + 손님 6)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, cleanup, waitFor, act } = await import("@testing-library/react")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { buildRoomSettingsFormState } = await import("../../src/domains/game/setup/utils/roomSettingsForm.js")
const H = await import("./a01a-helpers.mjs")

const ROOM = H.roomOf({ n: 7, settingsVersion: 2, ready: ["guest-1", "guest-2"] })

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs({ confirm: false })
})
test.afterEach(() => cleanup())

const waitVerified = () => waitFor(() => assert.equal(screen.getByTestId("sync").textContent, "확인됨"))

// 지금 방 설정으로 만든 폼에 정원만 바꿈
const formWithMax = (maxPlayers) => {
  const form = buildRoomSettingsFormState({ accessType: ROOM.accessType, settings: ROOM.settings })
  return { ...form, ranges: { ...form.ranges, "max-players": maxPlayers } }
}

async function verifiedHost(saveAnswer) {
  const r = H.renderRoomHook({ room: ROOM })
  r.socket.answer("update_room_settings", saveAnswer)
  await waitVerified()
  return r
}

test("A01-F-089 답 MAX_PLAYERS_BELOW_OCCUPANCY → 결과 글 그 글, 스토어 설정 옛 값", async () => {
  const message = "현재 인원(7명)보다 적은 정원으로는 변경할 수 없습니다."
  const { api } = await verifiedHost({ ok: false, code: "MAX_PLAYERS_BELOW_OCCUPANCY", message })
  await act(() => api.current.saveRoomSettings(formWithMax(5)))
  assert.equal(screen.getByTestId("settings-error").textContent, message)
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 10)
})

test("A01-F-090 답 SETTINGS_VERSION_CONFLICT + room → 스토어가 그 최신 방으로", async () => {
  const latest = H.roomOf({ n: 7, settingsVersion: 5, settings: { maxPlayers: 9 } })
  const { api } = await verifiedHost({
    ok: false,
    code: "SETTINGS_VERSION_CONFLICT",
    message: "설정이 이미 변경되었습니다. 최신 설정을 불러온 뒤 다시 시도해주세요.",
    room: latest,
  })
  await act(() => api.current.saveRoomSettings(formWithMax(8)))
  const s = useMatchingStore.getState()
  assert.equal(s.settingsVersion, 5)
  assert.equal(s.settings.maxPlayers, 9)
})

test("A01-F-091 [지금 동작] 저장 답 잃음 → get_room_settings_update_result 보냄, APPLIED 받으면 반영", async () => {
  const { api, socket } = await verifiedHost(H.LOST)
  await act(() => api.current.saveRoomSettings(formWithMax(8)))
  const saved = socket.sentOf("update_room_settings")[0]
  const applied = H.roomOf({ n: 7, settingsVersion: 3, settings: { maxPlayers: 8 } })
  socket.answer("get_room_settings_update_result", { ok: true, status: "APPLIED", settingsVersion: 3, room: applied })
  await act(() => api.current.verifyRoomSettingsResult())
  assert.deepEqual(socket.sentOf("get_room_settings_update_result"), [{ roomId: "room-1", requestId: saved.requestId }])
  const s = useMatchingStore.getState()
  assert.equal(s.settingsVersion, 3)
  assert.equal(s.settings.maxPlayers, 8)
})

test("A01-F-092 답 NOT_HOST → 결과 글 '방장만 설정을 변경할 수 있습니다.'", async () => {
  const { api } = await verifiedHost({ ok: false, code: "NOT_HOST", message: "방장만 설정을 변경할 수 있습니다." })
  await act(() => api.current.saveRoomSettings(formWithMax(8)))
  assert.equal(screen.getByTestId("settings-error").textContent, "방장만 설정을 변경할 수 있습니다.")
})

test("A01-F-093 답 changed:false → 스토어 준비 표시 그대로", async () => {
  const { api } = await verifiedHost({ ok: true, changed: false, settingsVersion: 2 })
  await act(() => api.current.saveRoomSettings(formWithMax(10)))
  const ready = useMatchingStore.getState().players.filter((p) => p.isReady).map((p) => p.uuid)
  assert.deepEqual(ready, ["guest-1", "guest-2"])
  assert.equal(useMatchingStore.getState().settingsVersion, 2)
})
