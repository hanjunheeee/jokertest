// PC·공용 버그 수정 검증 시험: 미연결 유령 입장 방지·재연결 방 만들기 복구·방장 삭제 중복 알림 방지·appConfirm 통일·인게임 이동 중복 방지·추적 게이트
// 관련 단일 단위 시험으로 1·2·3·5·6번 수정을 한 번에 검증함
import test from "node:test"
import assert from "node:assert/strict"
import { dom } from "../helpers/domSetup.mjs"

const React = await import("react")
const { renderHook, render, screen, fireEvent, act, cleanup, waitFor } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route, useLocation, useNavigate } = await import("react-router-dom")
const { setSocket } = await import("../../src/shared/socket/socketClient.js")
const { setAppConfirmHandler } = await import("../../src/shared/utils/appConfirm.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { useMatchingStore } = await import("../../src/domains/game/matching/store/matchingStore.js")
const { useInGameStore } = await import("../../src/domains/game/ingame/store/ingameStore.js")
const { useRoomCodeJoin } = await import("../../src/domains/game/mode/hooks/useRoomCodeJoin.js")
const { usePublicRoomJoin } = await import("../../src/domains/game/mode/hooks/usePublicRoomJoin.js")
const { useCreateRoom } = await import("../../src/domains/game/setup/hooks/useCreateRoom.js")
const { default: GameSetupPage } = await import("../../src/domains/game/setup/pages/GameSetupPage.jsx")
const { useMatchingPage } = await import("../../src/domains/game/matching/hooks/useMatchingPage.js")
const { useRoom } = await import("../../src/domains/game/matching/hooks/room/useRoom.js")
const { ROOM_MESSAGES } = await import("../../src/domains/game/matching/constants/roomMessages.js")
const {
  navigateToInGameFromMatching,
  resetInGameNavigationDedupe,
} = await import("../../src/domains/game/matching/utils/navigateToInGame.js")
const { registerMatchingRouterNavigate } = await import("../../src/domains/game/matching/utils/matchingRouterNavigate.js")
const {
  traceMatchingFlow,
  registerMatchingFlowSocket,
} = await import("../../src/domains/game/matching/debug/matchingFlowTrace.js")
const { useLobbyMenuNav } = await import("../../src/domains/lobby/hooks/useLobbyMenuNav.js")
const { signIn, resetAll, roomOf, installDialogs, installFakeFetch, createFakeSocket, flush } =
  await import("./a01b-helpers.mjs")

const h = React.createElement

// socket.io처럼 미연결 중 emit 호출을 sendBuffer에 쌓았다가 connect 때 내보내는 가짜 소켓 만들기
function createBufferingSocket({ id = "buf-1", connected = false } = {}) {
  const listeners = new Map()
  const sendBuffer = []
  const sent = []

  const on = (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(fn)
    return socket
  }
  const off = (event, fn) => {
    if (fn === undefined) listeners.delete(event)
    else listeners.get(event)?.delete(fn)
    return socket
  }
  const once = (event, fn) => {
    const wrapped = (...args) => {
      off(event, wrapped)
      fn(...args)
    }
    return on(event, wrapped)
  }
  const socket = {
    id,
    connected,
    sendBuffer,
    sent,
    on,
    once,
    off,
    emit(event, payload) {
      if (socket.connected) sent.push({ event, payload })
      else sendBuffer.push({ event, payload })
      return socket
    },
    sentOf(event) {
      return sent.filter((item) => item.event === event).map((item) => item.payload)
    },
    becomeConnected() {
      socket.connected = true
      // 실제 socket.io-client처럼 sendBuffer 먼저 비운 뒤 connect 이벤트 발사
      for (const packet of sendBuffer.splice(0)) sent.push(packet)
      for (const fn of [...(listeners.get("connect") ?? [])]) fn()
    },
  }
  return socket
}

test.afterEach(() => {
  cleanup()
  resetAll()
  setAppConfirmHandler(null)
  resetInGameNavigationDedupe()
  registerMatchingRouterNavigate(null)
  window.history.replaceState(null, "", "/")
})

test("W2-1D 미연결 소켓 코드 입장 → 8초 안에 연결되면 1번 전송, 8초 타임아웃 뒤 늦게 연결되면 유령 입장 0번", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const dialogs = installDialogs(dom)
  const sock = createBufferingSocket({ connected: false })
  setSocket(sock)

  const view = renderHook(() => useRoomCodeJoin())

  // 미연결 상태에서 입장 시도: sendBuffer에 쌓이지 않음
  act(() => view.result.current.startJoin({ roomCode: "ABC234" }))
  assert.equal(sock.sendBuffer.length, 0, "sendBuffer에 쌓이면 안 됨")
  assert.equal(sock.sentOf("join_room_by_code").length, 0)
  assert.equal(view.result.current.isJoining, true)

  // 8초 타임아웃 만료
  act(() => t.mock.timers.tick(8000))
  assert.equal(view.result.current.isJoining, false)
  assert.deepEqual(dialogs.alerts, ["서버 응답이 없습니다. 잠시 후 다시 시도해주세요."])

  // 12초 시점에 뒤늦게 소켓 연결됨 → 유령 입장이 절대 나가지 않음
  act(() => sock.becomeConnected())
  assert.equal(sock.sentOf("join_room_by_code").length, 0, "타임아웃 뒤 유령 코드 입장 0번")

  // 다시 미연결로 두고 이번에는 2초 만에 연결되면 정상 전송
  sock.connected = false
  act(() => view.result.current.startJoin({ roomCode: "XYZ789" }))
  act(() => t.mock.timers.tick(2000))
  act(() => sock.becomeConnected())
  assert.deepEqual(sock.sentOf("join_room_by_code"), [{ roomCode: "XYZ789" }])
})

test("W2-1E 미연결 소켓 공개 방 입장 → 8초 타임아웃 또는 언마운트 뒤 연결돼도 유령 입장 0번, 시간 안 연결은 1번 전송", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  installDialogs(dom)
  const sock = createBufferingSocket({ connected: false })
  setSocket(sock)
  const disposedRef = { current: false }

  const view = renderHook(() => usePublicRoomJoin(disposedRef))
  act(() => view.result.current.joinPublicRoom("room-ghost"))
  assert.equal(sock.sendBuffer.length, 0)
  assert.equal(sock.sentOf("join_public_room").length, 0)

  // 8초 타임아웃 뒤 소켓 연결 → 유령 입장 0번
  act(() => t.mock.timers.tick(8000))
  assert.equal(view.result.current.isJoining, false)
  act(() => sock.becomeConnected())
  assert.equal(sock.sentOf("join_public_room").length, 0, "타임아웃 뒤 유령 공개방 입장 0번")

  // 미연결 중 다시 누르고 바로 언마운트한 뒤 연결돼도 유령 입장 0번
  sock.connected = false
  act(() => view.result.current.joinPublicRoom("room-unmount"))
  view.unmount()
  act(() => sock.becomeConnected())
  assert.equal(sock.sentOf("join_public_room").length, 0, "언마운트 뒤 유령 공개방 입장 0번")

  // 새 훅에서 미연결 중 누르고 1초 만에 연결되면 정상 전송 1번
  sock.connected = false
  const view2 = renderHook(() => usePublicRoomJoin({ current: false }))
  act(() => view2.result.current.joinPublicRoom("room-ok"))
  act(() => t.mock.timers.tick(1000))
  act(() => sock.becomeConnected())
  assert.deepEqual(sock.sentOf("join_public_room"), [{ roomId: "room-ok" }])
})

test("W2-2 방 만들기 도중 소켓 재연결(socket.id 변경) + 서버에 방 없음 → 무응답 멈춤 없이 네트워크 오류 안내", async () => {
  signIn("host", "방장")
  const dialogs = installDialogs(dom)
  let rejectCreate
  const sock = createFakeSocket({ id: "sock-before", connected: true })
  sock.timeout = () => ({
    emitWithAck(event, payload) {
      sock.sent.push({ event, payload })
      if (event === "create_room") {
        return new Promise((_, reject) => { rejectCreate = reject })
      }
      return Promise.resolve({ ok: true, room: null })
    },
  })
  setSocket(sock)

  const where = { path: "/game-setup" }
  const api = {}
  function Probe() {
    const navigate = useNavigate()
    where.path = useLocation().pathname
    const accountId = useAuthStore((s) => s.user?.uuid ?? null)
    const identityGeneration = useAuthStore((s) => s.identityGeneration)
    Object.assign(api, useCreateRoom({ navigate, accountId, identityGeneration }))
    return null
  }
  render(h(MemoryRouter, { initialEntries: ["/game-setup"] }, h(Probe)))

  let pending
  act(() => { pending = api.createGame({ accessType: "open", maxPlayers: 6 }) })
  assert.equal(api.isCreating, true)

  // 요청 도중 소켓이 재연결되어 socket.id가 바뀜, 그 직후 이전 create_room 요청은 끊김 오류로 실패
  sock.id = "sock-reconnected"
  await act(async () => {
    rejectCreate(new Error("socket disconnected"))
    await pending
  })

  assert.equal(api.isCreating, false, "만드는 중 표시 해제됨")
  assert.deepEqual(dialogs.alerts, ["네트워크 상태를 확인한 뒤 다시 시도해주세요."])
  assert.equal(api.createError, "네트워크 상태를 확인한 뒤 다시 시도해주세요.")
  assert.equal(sock.sentOf("get_current_room").length, 1, "재연결된 소켓으로 방 생성 여부 1회 확인")
  assert.equal(where.path, "/game-setup")
})

test("W2-2B 방 만들기 도중 소켓 재연결(socket.id 변경) + 서버에는 방이 이미 생김 → 대기방으로 정상 진입", async () => {
  signIn("host", "방장")
  const dialogs = installDialogs(dom)
  const createdRoom = roomOf({ n: 1, max: 6, roomId: "room-recovered" })
  let rejectCreate
  const sock = createFakeSocket({ id: "sock-1", connected: true })
  sock.timeout = () => ({
    emitWithAck(event, payload) {
      sock.sent.push({ event, payload })
      if (event === "create_room") {
        return new Promise((_, reject) => { rejectCreate = reject })
      }
      return Promise.resolve({ ok: true, room: createdRoom })
    },
  })
  setSocket(sock)

  const where = { path: "/game-setup" }
  const api = {}
  function Probe() {
    const navigate = useNavigate()
    where.path = useLocation().pathname
    const accountId = useAuthStore((s) => s.user?.uuid ?? null)
    const identityGeneration = useAuthStore((s) => s.identityGeneration)
    Object.assign(api, useCreateRoom({ navigate, accountId, identityGeneration }))
    return null
  }
  render(h(MemoryRouter, { initialEntries: ["/game-setup"] }, h(Probe)))

  let pending
  act(() => { pending = api.createGame({ accessType: "open", maxPlayers: 6 }) })
  sock.id = "sock-2"
  await act(async () => {
    rejectCreate(new Error("operation has timed out"))
    await pending
    await flush()
  })

  assert.deepEqual(dialogs.alerts, [])
  assert.equal(useMatchingStore.getState().roomId, "room-recovered")
  assert.equal(where.path, "/game-matching")
})

test("W2-3A 방장이 직접 방 삭제(방송 먼저 도착·ACK 나중 도착 둘 다) → 방장 본인에게 중복 alert 없음", async () => {
  for (const broadcastFirst of [true, false]) {
    signIn("host", "방장")
    const dialogs = installDialogs(dom)
    installFakeFetch()
    const room = roomOf({ n: 3, max: 6 })
    const fake = createFakeSocket()
    setSocket(fake)
    fake.answer("get_current_room", { ok: true, room })
    fake.answer("delete_room", () => {
      if (broadcastFirst) fake.serverSays("room_deleted", { roomId: room.roomId })
      return { ok: true }
    })
    useMatchingStore.getState().setRoom(room)
    window.history.replaceState(null, "", "/game-matching")

    const where = { path: null }
    function Where() { where.path = useLocation().pathname; return null }
    const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/game-matching"] }, h(Where), children)
    const view = renderHook(() => useMatchingPage(), { wrapper })
    await act(async () => { await flush() })

    await act(async () => {
      await view.result.current.deleteRoom()
      if (!broadcastFirst) fake.serverSays("room_deleted", { roomId: room.roomId })
      await flush(10)
    })

    assert.deepEqual(dialogs.confirms, [ROOM_MESSAGES.DELETE_CONFIRM])
    assert.deepEqual(dialogs.alerts, [], `broadcastFirst=${broadcastFirst} 일 때 방장 본인에게 삭제 알림이 뜨면 안 됨`)
    assert.equal(where.path, "/multiplay")

    cleanup()
    resetAll()
  }
})

test("W2-3B 방장이 방 삭제할 때 손님 화면 → 손님에게는 방 삭제 알림 1번 유지", async () => {
  signIn("guest-1", "손님")
  const dialogs = installDialogs(dom)
  installFakeFetch()
  const room = roomOf({ n: 3, max: 6 })
  const fake = createFakeSocket()
  setSocket(fake)
  fake.answer("get_current_room", { ok: true, room })
  useMatchingStore.getState().setRoom(room)

  const where = { path: null }
  function Where() { where.path = useLocation().pathname; return null }
  const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/game-matching"] }, h(Where), children)
  renderHook(() => useMatchingPage(), { wrapper })
  await act(async () => { await flush() })

  await act(async () => {
    fake.serverSays("room_deleted", { roomId: room.roomId })
    await flush()
  })

  assert.deepEqual(dialogs.alerts, [ROOM_MESSAGES.ROOM_DISBANDED])
  assert.equal(where.path, "/multiplay")
})

test("W2-5A useRoomCheck 방 상태 확인 실패 → appConfirm 비동기 핸들러로 확인받고 재시도", async () => {
  signIn("host", "방장")
  const dialogs = installDialogs(dom)
  const room = roomOf({ n: 5, max: 6 })
  const fake = createFakeSocket()
  setSocket(fake)
  let count = 0
  fake.answer("get_current_room", () => {
    count += 1
    return count === 1 ? { ok: false, message: "일시 오류" } : { ok: true, room }
  })
  useMatchingStore.getState().setRoom(room)

  const asked = []
  setAppConfirmHandler(async (msg) => {
    asked.push(msg)
    return true
  })

  const noop = () => {}
  const view = renderHook(() => useRoom({ onRoomDeleted: noop, onGameStarted: noop }))
  await waitFor(() => assert.equal(view.result.current.isRoomVerified, true))
  assert.deepEqual(asked, [ROOM_MESSAGES.CHECK_RETRY])
  assert.deepEqual(dialogs.confirms, [], "핸들러 등록 시 window.confirm 안 부름")
  assert.equal(count, 2)
})

test("W2-5B useGameSetupPage 방 만드는 중 뒤로 가기 → appConfirm 비동기 핸들러로 취소·확인 처리", async () => {
  signIn("host", "방장")
  const dialogs = installDialogs(dom)
  const fake = createFakeSocket()
  setSocket(fake)
  fake.answer("create_room", () => new Promise(() => {}))

  const asked = []
  let nextAnswer = false
  setAppConfirmHandler(async (msg) => {
    asked.push(msg)
    return nextAnswer
  })

  const where = { path: "/game-setup" }
  function Where() { where.path = useLocation().pathname; return null }
  render(h(MemoryRouter, { initialEntries: ["/game-setup"] },
    h(Where),
    h(Routes, null,
      h(Route, { path: "/game-setup", element: h(GameSetupPage) }),
      h(Route, { path: "/multiplay", element: h("p", null, "멀티") }),
    )))

  fireEvent.click(screen.getByRole("button", { name: "게임 만들기" }))
  await waitFor(() => assert.equal(screen.getByRole("button", { name: "게임 만들기" }).disabled, true))

  // 비동기 취소 → /game-setup 유지
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "멀티플레이 선택으로 돌아가기" }))
    await flush()
  })
  assert.equal(asked.length, 1)
  assert.deepEqual(dialogs.confirms, [])
  assert.equal(where.path, "/game-setup")

  // 비동기 확인 → /multiplay 이동
  nextAnswer = true
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "멀티플레이 선택으로 돌아가기" }))
    await flush()
  })
  assert.equal(asked.length, 2)
  assert.equal(where.path, "/multiplay")
})

test("W2-5C useLobbyMenuNav 로그아웃 실패 → appConfirm 비동기 핸들러로 취소·확인 처리", async () => {
  signIn("me", "나")
  const dialogs = installDialogs(dom)
  installFakeFetch({ "POST /auth/logout": { status: 500, body: { success: false } } })

  const asked = []
  let nextAnswer = false
  setAppConfirmHandler(async (msg) => {
    asked.push(msg)
    return nextAnswer
  })

  const where = { path: "/lobby" }
  function Where() { where.path = useLocation().pathname; return null }
  const wrapper = ({ children }) => h(MemoryRouter, { initialEntries: ["/lobby"] }, h(Where), children)
  const view = renderHook(() => useLobbyMenuNav(), { wrapper })

  // 취소 → 로그인 유지
  await act(async () => { await view.result.current.handleMenuClick("exit") })
  assert.equal(asked.length, 1)
  assert.deepEqual(dialogs.confirms, [])
  assert.equal(useAuthStore.getState().isLoggedIn, true)
  assert.equal(where.path, "/lobby")

  // 확인 → 이 기기 로그아웃 후 /login 이동
  nextAnswer = true
  await act(async () => { await view.result.current.handleMenuClick("exit") })
  assert.equal(asked.length, 2)
  assert.equal(useAuthStore.getState().isLoggedIn, false)
  assert.equal(where.path, "/login")
})

test("W2-6A navigateToInGameFromMatching → 같은 gameId로 /ingame 전환 뒤 재호출돼도 중복 라우터 이동 안 함", () => {
  useInGameStore.setState({ gameId: "game-dedupe-1", state: { id: "game-dedupe-1", phase: "ROLE_REVEAL" } })
  window.history.replaceState(null, "", "/game-matching")

  let routerNavCount = 0
  let hookNavCount = 0
  registerMatchingRouterNavigate((to) => {
    routerNavCount += 1
    window.history.replaceState(null, "", to)
  })
  const hookNavigate = () => { hookNavCount += 1 }

  assert.equal(navigateToInGameFromMatching(hookNavigate, { gameId: "game-dedupe-1", source: "sub" }), true)
  assert.equal(window.location.pathname, "/ingame")
  assert.equal(routerNavCount, 1)
  assert.equal(hookNavCount, 1)

  // 주소가 이미 /ingame으로 바뀐 뒤 같은 gameId로 5번 더 불려도 모두 중복 차단됨
  for (let i = 0; i < 5; i += 1) {
    assert.equal(navigateToInGameFromMatching(hookNavigate, { gameId: "game-dedupe-1", source: `dup-${i}` }), false)
  }
  assert.equal(routerNavCount, 1)
  assert.equal(hookNavCount, 1)
})

test("W2-6B matchingFlowTrace → VITE_DEBUG_MATCHING_FLOW 미설정 시 debug_matching_flow 소켓 전송 0번", () => {
  const fake = createFakeSocket({ connected: true })
  registerMatchingFlowSocket(fake)
  traceMatchingFlow("test_step", { roomId: "r-1" })
  assert.equal(fake.sentOf("debug_matching_flow").length, 0)
})
