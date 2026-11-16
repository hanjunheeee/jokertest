// 설정 바뀐 뒤 대기방 시험(대기방 화면 전체 + 가짜 소켓): 준비 단추·준비 표시 풀림, 자리 칸은 앉은 사람만큼·숫자는 앉은 수/정원, 바뀐 버전으로 준비·시작
// 목록 A01a "화면 PC" A01-F-197~207·205-2, 5~6명 방
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, fireEvent, cleanup, waitFor, act } = await import("@testing-library/react")
const H = await import("./a01a-helpers.mjs")

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs({ confirm: false })
})
test.afterEach(() => cleanup())

const waitVerified = () => waitFor(() => assert.equal(H.buttonNamed("초대코드 공유").disabled, false))
const readySeats = () => H.seatImages().filter((img) => img.alt === "준비 완료한 참가자").length

// 서버가 보내는 설정 바뀜 알림 (명단 전원 준비 풀림)
const settingsUpdated = (room, { settingsVersion, settings = {} }) => ({
  roomId: room.roomId,
  settingsVersion,
  accessType: room.accessType,
  settings: { ...room.settings, ...settings },
  players: room.players.map((p) => ({ ...p, isReady: false })),
  canStart: false,
  hostUuid: room.hostUuid,
})

test("A01-F-197 준비한 손님 화면에 room_settings_updated → 단추 '준비완료'(준비 취소 아님)", async () => {
  const room = H.roomOf({ n: 5, settingsVersion: 2, ready: ["guest-1"] })
  const { socket } = H.renderMatchingPage({ room, me: "guest-1" })
  await waitVerified()
  assert.ok(screen.getByRole("button", { name: "준비취소" }))
  act(() => socket.serverSays("room_settings_updated", settingsUpdated(room, { settingsVersion: 3, settings: { maxPlayers: 8 } })))
  assert.ok(screen.getByRole("button", { name: "준비완료" }))
  assert.ok(H.buttonNamed("준비취소") === null)
})

test("A01-F-198 6명 중 5명 준비 표시 → 알림 뒤 준비 표시 0", async () => {
  const room = H.roomOf({ n: 6, settingsVersion: 2, ready: ["guest-1", "guest-2", "guest-3", "guest-4", "guest-5"] })
  const { socket } = H.renderMatchingPage({ room })
  await waitVerified()
  assert.equal(readySeats(), 5)
  act(() => socket.serverSays("room_settings_updated", settingsUpdated(room, { settingsVersion: 3, settings: { dayVoteTime: 90 } })))
  assert.equal(readySeats(), 0)
})

// 화면에 보이는 "앉은 수/정원" 글 → 예: "5/8" (없으면 null)
const capacityText = () => screen.queryByTestId("matching-party-capacity")?.querySelector('[aria-hidden="true"]')?.textContent ?? null

// 정원 5~10 방(5명 앉음) → 자리 칸은 앉은 사람만큼(5), 숫자는 "5/정원" (결정: 칸은 그대로 두고 앉은 수/정원 숫자를 보임)
const SEAT_NOS = ["A01-F-199", "A01-F-200", "A01-F-201", "A01-F-202", "A01-F-203", "A01-F-204"]
for (const [i, maxPlayers] of [5, 6, 7, 8, 9, 10].entries()) {
  test(`${SEAT_NOS[i]} 정원 ${maxPlayers} 방, 5명 앉음 → 자리 칸 5, 숫자 "5/${maxPlayers}"`, async () => {
    H.renderMatchingPage({ room: H.roomOf({ n: 5, settings: { maxPlayers } }) })
    await waitVerified()
    assert.equal(H.seatImages().length, 5)
    assert.equal(capacityText(), `5/${maxPlayers}`)
    // 읽어 주는 글은 풀어서
    assert.ok(screen.getByTestId("matching-party-capacity").textContent.includes(`앉은 사람 5명, 정원 ${maxPlayers}명`))
  })
}

test("A01-F-205 정원 10 → 8 알림 → 자리 칸 5 그대로, 숫자 \"5/10\" → \"5/8\"", async () => {
  const room = H.roomOf({ n: 5, settingsVersion: 2, settings: { maxPlayers: 10 } })
  const { socket } = H.renderMatchingPage({ room })
  await waitVerified()
  assert.equal(capacityText(), "5/10")
  act(() => socket.serverSays("room_settings_updated", settingsUpdated(room, { settingsVersion: 3, settings: { maxPlayers: 8 } })))
  assert.equal(H.seatImages().length, 5)
  assert.equal(capacityText(), "5/8")
})

test("A01-F-205-2 사람이 들어오면 앉은 수만 늘어남: 5/8 → player_joined_room → 6/8", async () => {
  const room = H.roomOf({ n: 5, settings: { maxPlayers: 8 } })
  const { socket } = H.renderMatchingPage({ room })
  await waitVerified()
  assert.equal(capacityText(), "5/8")
  act(() => socket.serverSays("player_joined_room", {
    roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch: room.bootEpoch,
    player: { uuid: "new-1", nickname: "새사람", isReady: false, membershipId: "m-new-1" },
  }))
  assert.equal(H.seatImages().length, 6)
  assert.equal(capacityText(), "6/8")
})

test("A01-F-206 알림(버전 3) 뒤 '준비완료' → 받은 set_ready 버전 3", async () => {
  const room = H.roomOf({ n: 5, settingsVersion: 2 })
  const { socket } = H.renderMatchingPage({ room, me: "guest-1" })
  socket.answer("set_ready", { ok: true, isReady: true, roomId: "room-1", settingsVersion: 3, canStart: false })
  await waitVerified()
  act(() => socket.serverSays("room_settings_updated", settingsUpdated(room, { settingsVersion: 3, settings: { maxPlayers: 8 } })))
  fireEvent.click(screen.getByRole("button", { name: "준비완료" }))
  await waitFor(() => assert.equal(socket.sentOf("set_ready").length, 1))
  assert.equal(socket.sentOf("set_ready")[0].expectedSettingsVersion, 3)
})

test("A01-F-207 ROOM_STATE_CHANGED 뒤 방 다시 받음 → 다시 '게임시작' → 받은 start_game 버전이 새 버전", async () => {
  // 시작을 누르려면 전원 준비여야 함 (준비 안 된 사람이 있으면 단추가 꺼짐)
  const everyone = ["host", "guest-1", "guest-2", "guest-3", "guest-4"]
  const room = H.roomOf({ n: 5, settingsVersion: 2, ready: everyone, canStart: true })
  const { socket } = H.renderMatchingPage({ room })
  socket.answer("start_game", (payload, count) => (count === 1
    ? { ok: false, code: "ROOM_STATE_CHANGED", message: "방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요." }
    : { ok: true, gameId: "g-1" }))
  await waitVerified()
  // 서버 쪽 방은 그사이 버전 4
  H.answerCurrentRoom(socket, H.roomOf({ n: 5, settingsVersion: 4, ready: everyone, canStart: true }))
  fireEvent.click(screen.getByRole("button", { name: "게임시작" }))
  await waitFor(() => assert.ok(screen.getByRole("alert")))
  // 막힘 창 닫고 다시 시작
  fireEvent.click(screen.getByRole("button", { name: "확인" }))
  await waitFor(() => assert.equal(H.buttonNamed("게임시작")?.disabled, false))
  await waitFor(() => assert.equal(socket.sentOf("get_current_room").length >= 2, true))
  fireEvent.click(screen.getByRole("button", { name: "게임시작" }))
  await waitFor(() => assert.equal(socket.sentOf("start_game").length, 2))
  assert.equal(socket.sentOf("start_game")[0].expectedSettingsVersion, 2)
  assert.equal(socket.sentOf("start_game")[1].expectedSettingsVersion, 4)
})
