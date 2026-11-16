// 시작 요청 시험(가짜 소켓): 연결 없음·방 확인 전·8초 응답 없음·서버 거절 글·글 없는 실패·방 다시 확인·시작 중 다시 누름·성공
// 목록 A01a "화면 PC" A01-F-075~088, 5명 방(방장 + 손님 4)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { screen, cleanup, waitFor, act } = await import("@testing-library/react")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const H = await import("./a01a-helpers.mjs")

// 5명 방, 설정 버전 2
const ROOM = H.roomOf({ n: 5, settingsVersion: 2 })

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs({ confirm: false })
})
test.afterEach(() => {
  cleanup()
  mock.timers.reset()
})

const blockedText = () => screen.getByTestId("blocked").textContent
const waitVerified = () => waitFor(() => assert.equal(screen.getByTestId("sync").textContent, "확인됨"))

// 방 확인까지 끝난 방장 화면
async function verifiedHost(startAnswer) {
  const r = H.renderRoomHook({ room: ROOM })
  if (startAnswer !== undefined) r.socket.answer("start_game", startAnswer)
  await waitVerified()
  return r
}

test("A01-F-075 연결 없음 → 막힘 글 '서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.', start_game 안 보냄", async () => {
  const socket = H.useFakeSocket({ connected: false })
  const { api } = H.renderRoomHook({ room: ROOM, socket })
  await act(() => api.current.startGame())
  assert.equal(blockedText(), "서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
  assert.equal(socket.sentOf("start_game").length, 0)
})

test("A01-F-076 방 확인 안 끝남 → '현재 방 상태를 확인하고 있습니다…', 안 보냄", async () => {
  const { api, socket } = H.renderRoomHook({ room: ROOM, verify: false })
  await act(() => api.current.startGame())
  assert.match(blockedText(), /^현재 방 상태를 확인하고 있습니다/)
  assert.equal(socket.sentOf("start_game").length, 0)
})

test("A01-F-077 8초 응답 없음: 7.9초엔 글 없음, 8초 지나면 '게임 시작 요청이 응답하지 않습니다…'", async () => {
  const { api } = await verifiedHost(H.NO_ANSWER)
  mock.timers.enable({ apis: ["setTimeout"] })
  await act(async () => { api.current.startGame() })
  await act(async () => { mock.timers.tick(7_900) })
  assert.equal(blockedText(), "")
  // 가짜 시계가 켜진 동안 waitFor는 못 씀 (그 안쪽 시계도 멈춤) → 틱 뒤 몇 번 더 비우고 바로 봄
  await act(async () => { mock.timers.tick(100) })
  await act(async () => { await Promise.resolve() })
  assert.match(blockedText(), /^게임 시작 요청이 응답하지 않습니다/)
})

// 서버 거절 글 그대로 (서버 시험에서 본 글)
const REJECTS = [
  ["A01-F-078", "MIN_PLAYERS_NOT_MET", "게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다."],
  ["A01-F-079", "INVALID_ROLE_COMPOSITION", "설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요."],
  ["A01-F-080", "PLAYERS_NOT_READY", "아직 준비하지 않은 참가자가 있습니다."],
  ["A01-F-081", "ADMISSION_IN_PROGRESS", "입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요."],
  ["A01-F-082", "PARTICIPANT_UNAVAILABLE", "일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요."],
  ["A01-F-083", "MAINTENANCE", "서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요."],
  ["A01-F-084", "NOT_HOST", "방장만 게임을 시작할 수 있습니다."],
]

for (const [no, code, message] of REJECTS) {
  test(`${no} 답 ${code} → 막힘 글 = 답 message`, async () => {
    const { api, socket } = await verifiedHost({ ok: false, code, message })
    await act(() => api.current.startGame())
    assert.equal(blockedText(), message)
    assert.deepEqual(socket.sentOf("start_game"), [{ roomId: "room-1", expectedSettingsVersion: 2 }])
  })
}

test("A01-F-085 답 { ok:false }만 → '게임을 시작할 수 없습니다.'", async () => {
  const { api } = await verifiedHost({ ok: false })
  await act(() => api.current.startGame())
  assert.equal(blockedText(), "게임을 시작할 수 없습니다.")
})

test("A01-F-086 답 ROOM_STATE_CHANGED → get_current_room 다시 보내 방을 새로 받음", async () => {
  const { api, socket } = await verifiedHost({
    ok: false,
    code: "ROOM_STATE_CHANGED",
    message: "방 상태가 바뀌어 게임을 시작하지 못했습니다. 다시 시도해주세요.",
  })
  const asksBefore = socket.sentOf("get_current_room").length
  // 서버 쪽 방은 그사이 설정 버전 3이 됨
  H.answerCurrentRoom(socket, H.roomOf({ n: 5, settingsVersion: 3, settings: { maxPlayers: 8 } }))
  await act(() => api.current.startGame())
  await waitFor(() => assert.equal(useMatchingStore.getState().settingsVersion, 3))
  assert.equal(socket.sentOf("get_current_room").length, asksBefore + 1)
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 8)
})

test("A01-F-087 답 오기 전 두 번째 누름 → 가짜 서버가 받은 start_game 1개", async () => {
  const later = H.deferred()
  const { api, socket } = await verifiedHost(() => later.promise)
  await act(async () => {
    api.current.startGame()
  })
  await act(async () => {
    api.current.startGame()
  })
  assert.equal(socket.sentOf("start_game").length, 1)
  await act(async () => later.resolve({ ok: true, gameId: "g-1" }))
})

test("A01-F-088 답 { ok:true, gameId } → 막힘 글 없음", async () => {
  const { api } = await verifiedHost({ ok: true, gameId: "g-1" })
  await act(() => api.current.startGame())
  assert.equal(blockedText(), "")
})
