// 방 만들기 요청 흐름 시험(가짜 소켓): 성공하면 대기방으로, 거절 글 그대로 알림, 연타·소켓 없음·답 잃음·화면 떠남·만드는 중 표시
// 목록 A01a "화면 PC" A01-F-061~071
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, cleanup, waitFor, act } = await import("@testing-library/react")
const { useNavigate } = await import("react-router-dom")
const { useCreateRoom } = await import("../../src/domains/game/setup/hooks/useCreateRoom.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const H = await import("./a01a-helpers.mjs")

// 방 만들기 값 (처음 값 그대로)
const SETTINGS = { accessType: "open", maxPlayers: 10, jokerCount: 2, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90, roleCompositionMode: "auto" }
// 서버가 돌려주는 방 (방장 혼자)
const ROOM = H.roomOf({ n: 1, roomId: "room-new" })

test.beforeEach(() => {
  H.resetAll()
  H.catchDialogs()
  H.signIn("host")
})
test.afterEach(() => cleanup())

// 훅을 쓰는 작은 화면: 만드는 중이면 "만드는 중" 글, api.createGame으로 만들기
function CreateProbe({ api }) {
  const navigate = useNavigate()
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration)
  const { isCreating, createGame } = useCreateRoom({ navigate, accountId, identityGeneration })
  api.createGame = createGame
  return React.createElement("p", null, isCreating ? "만드는 중" : "쉼")
}

const renderProbe = () => {
  const api = {}
  const view = H.renderAt("/game-setup", React.createElement(CreateProbe, { api }))
  return { api, ...view }
}

test("A01-F-061 create_room 답 { ok:true, room } → 대기방 스토어에 그 방, 화면 /game-matching", async () => {
  const socket = H.useFakeSocket()
  socket.answer("create_room", { ok: true, room: ROOM })
  const { api, where } = renderProbe()
  await act(() => api.createGame(SETTINGS))
  await waitFor(() => assert.equal(where.path, "/game-matching"))
  const store = useMatchingStore.getState()
  assert.equal(store.isInRoom, true)
  assert.equal(store.roomId, "room-new")
  assert.deepEqual(socket.sentOf("create_room"), [SETTINGS])
})

// 서버 거절 글 → 알림 글 그대로, 대기방 안 감
const REJECT_CASES = [
  ["A01-F-062", "점검", { ok: false, code: "MAINTENANCE", message: "서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요." }],
  ["A01-F-063", "탈주 대기", { ok: false, code: "DESERTION_COOLDOWN", message: "탈주로 4분 59초 뒤에 참여할 수 있습니다.", retryAfterMs: 299000 }],
  ["A01-F-064", "정원 값", { ok: false, code: "INVALID_REQUEST", message: "최대 플레이어 수가 올바르지 않습니다." }],
  ["A01-F-065", "이미 방 있음", { ok: false, code: "ALREADY_IN_ROOM", message: "이미 참여 중인 방이 있습니다." }],
]

for (const [no, name, answer] of REJECT_CASES) {
  test(`${no} 거절(${name}) → 알림 글 = '${answer.message}', 대기방 안 감`, async () => {
    const socket = H.useFakeSocket()
    socket.answer("create_room", answer)
    const { api, where } = renderProbe()
    await act(() => api.createGame(SETTINGS))
    await waitFor(() => assert.deepEqual(H.alerts, [answer.message]))
    assert.equal(useMatchingStore.getState().isInRoom, false)
    assert.equal(where.path, "/game-setup")
  })
}

test("A01-F-066 만들기 두 번 빠르게 → 가짜 서버가 받은 create_room 1개", async () => {
  const socket = H.useFakeSocket()
  const later = H.deferred()
  socket.answer("create_room", () => later.promise)
  const { api } = renderProbe()
  await act(async () => {
    api.createGame(SETTINGS)
    api.createGame(SETTINGS)
  })
  assert.equal(socket.sentOf("create_room").length, 1)
  await act(async () => later.resolve({ ok: true, room: ROOM }))
})

test("A01-F-067 [지금 동작] 소켓 없음 → 연결 문제 알림 글, 안 보냄", async () => {
  const { api } = renderProbe()
  await act(() => api.createGame(SETTINGS))
  assert.deepEqual(H.alerts, ["네트워크 상태를 확인한 뒤 다시 시도해주세요."])
  assert.equal(useMatchingStore.getState().isInRoom, false)
})

test("A01-F-068 [지금 동작] create_room 답 잃음 → get_current_room 물어 방 있으면 대기방으로", async () => {
  const socket = H.useFakeSocket()
  socket.answer("create_room", H.LOST)
  socket.answer("get_current_room", { ok: true, room: ROOM })
  const { api, where } = renderProbe()
  await act(() => api.createGame(SETTINGS))
  await waitFor(() => assert.equal(where.path, "/game-matching"))
  assert.equal(socket.sentOf("get_current_room").length >= 1, true)
  assert.equal(useMatchingStore.getState().roomId, "room-new")
})

test("A01-F-069 [지금 동작] 답 잃고 찾아도 방 없음 → 연결 문제 알림", async () => {
  const socket = H.useFakeSocket()
  socket.answer("create_room", H.LOST)
  socket.answer("get_current_room", { ok: true, room: null })
  const { api, where } = renderProbe()
  await act(() => api.createGame(SETTINGS))
  await waitFor(() => assert.deepEqual(H.alerts, ["네트워크 상태를 확인한 뒤 다시 시도해주세요."]))
  assert.equal(useMatchingStore.getState().isInRoom, false)
  assert.equal(where.path, "/game-setup")
})

test("A01-F-070 [지금 동작] 답 오기 전 화면 닫힘 → 방 안 넣고 leave_room 보냄", async () => {
  const socket = H.useFakeSocket()
  const later = H.deferred()
  socket.answer("create_room", () => later.promise)
  const { api, unmount } = renderProbe()
  let pending
  act(() => { pending = api.createGame(SETTINGS) })
  unmount()
  later.resolve({ ok: true, room: ROOM })
  await pending
  assert.equal(socket.sentOf("leave_room").length, 1)
  assert.equal(useMatchingStore.getState().isInRoom, false)
})

test("A01-F-071 보낸 뒤 만드는 중 켜짐, 답 받은 뒤 꺼짐", async () => {
  const socket = H.useFakeSocket()
  const later = H.deferred()
  socket.answer("create_room", () => later.promise)
  const { api } = renderProbe()
  assert.ok(screen.getByText("쉼"))
  let pending
  act(() => { pending = api.createGame(SETTINGS) })
  await waitFor(() => assert.ok(screen.getByText("만드는 중")))
  await act(async () => {
    later.resolve({ ok: false, code: "INVALID_REQUEST", message: "잘못된 요청입니다." })
    await pending
  })
  assert.ok(screen.getByText("쉼"))
})
