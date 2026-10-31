import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const alerts = []
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => false)

register(new URL(
  "../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const { act, cleanup, renderHook } = await import("@testing-library/react")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../store/matchingStore.js")
const { useInGameStore } = await import("../../../ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { __setSfxPlayerForTests } = await import("../../../../../shared/hooks/useSfxRuntime.js")
const { useMatchingRoom } = await import("../useMatchingRoom.js")
const { SOCKET_EVENTS } = await import("../../../setup/constants/gameSetupSocket.js")

const navigations = { roomDeleted: 0, gameStarted: [] }
const roomCallbacks = {
  onRoomDeleted: () => { navigations.roomDeleted += 1 },
  onGameStarted: (payload) => { navigations.gameStarted.push(payload) },
}

const sfxEvents = []

const HOLD = Symbol("hold")

function createFakeSocket(id = "sock-test") {
  const listeners = new Map()
  const socket = {
    id,
    connected: true,
    emitted: [],
    holds: [],
    answer: () => HOLD,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    listenerCount(event) { return listeners.get(event)?.size ?? 0 },
    trigger(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      socket.emitted.push({ event, payload })
      return new Promise((resolve, reject) => {
        const result = socket.answer(event, payload)
        if (result === HOLD) { socket.holds.push({ event, resolve, reject }); return }
        resolve(result)
      })
    },
    release(event, value) {
      const index = socket.holds.findIndex((hold) => hold.event === event)
      assert.ok(index >= 0, `붙잡아 둔 ${event} 응답이 없다`)
      const [hold] = socket.holds.splice(index, 1)
      hold.resolve(value)
    },
    failHold(event, error = new Error("operation has timed out")) {
      const index = socket.holds.findIndex((hold) => hold.event === event)
      assert.ok(index >= 0, `붙잡아 둔 ${event} 응답이 없다`)
      const [hold] = socket.holds.splice(index, 1)
      hold.reject(error)
    },
    countOf(event) { return socket.emitted.filter((entry) => entry.event === event).length },
    lastOf(event) { return [...socket.emitted].reverse().find((entry) => entry.event === event) },
  }
  return socket
}

const ROOM_ID = "room-1"
const HOST = "host-a"

function serverRoom({
  roomId = ROOM_ID, settingsVersion = 1, hostUuid = HOST, players, canStart = false, maxPlayers = 8,
} = {}) {
  return {
    roomId,
    roomCode: "ABCD12",
    hostUuid,
    canStart,
    accessType: "open",
    settingsVersion,
    settings: {
      maxPlayers, jokerCount: 2, roleCompositionMode: "auto",
      dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
    },
    players: players ?? [
      { uuid: hostUuid, nickname: "host", isReady: false, readyRevision: 0 },
      { uuid: "p1", nickname: "p1", isReady: false, readyRevision: 0 },
    ],
  }
}

async function mountVerified({ uuid = HOST, room = serverRoom() } = {}) {
  useMatchingStore.getState().clearRoom()
  useInGameStore.getState().clearGame?.()
  useAuthStore.setState({ user: { uuid }, isLoggedIn: true })

  const socket = createFakeSocket("sock-A")
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room } : HOLD)
  setSocket(socket)

  const rendered = renderHook(() => useMatchingRoom(roomCallbacks))
  await settle()
  assert.equal(rendered.result.current.isRoomVerified, true, "최초 방 검증이 끝나지 않았다")
  return { socket, ...rendered }
}

async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

async function makePendingSave(socket, result) {
  socket.answer = (event) => (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS ? HOLD : HOLD)
  let savePromise
  await act(async () => { savePromise = result.current.saveRoomSettings(formState()) })
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1, "저장 요청이 나가지 않았다")
  const requestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  await act(async () => {
    socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
    await savePromise
  })
  assert.equal(result.current.hasPendingSettingsResult, true, "저장이 미확인으로 승격되지 않았다")
  return requestId
}

function formState() {
  return {
    checks: {},
    ranges: {
      "max-players": 6, "joker-count": 2, "day-discussion-time": 60,
      "day-vote-time": 60, "night-action-time": 90,
    },
    roleComposition: { mode: "auto", counts: {} },
    specifiedRoleNightActionTimes: [],
    accessType: "open",
  }
}

test.beforeEach(() => {
  navigations.roomDeleted = 0
  navigations.gameStarted.length = 0
  sfxEvents.length = 0
  alerts.length = 0
  __setSfxPlayerForTests({
    dispatch: (event) => { sfxEvents.push(event); return { status: "played" } },
  })
})

test.afterEach(() => {
  cleanup()
  setSocket(null)
  __setSfxPlayerForTests(null)
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: null, isLoggedIn: false })
})

for (const status of ["APPLIED", "NO_CHANGE"]) {
  test(`AC-05 · 방 스냅샷 없이 ${status}로 확정된 결과는 원 요청을 정착시키되 권위 있는 소속을 다시 확보한다`, async () => {
    const { socket, result } = await mountVerified()
    const requestId = await makePendingSave(socket, result)

    const queriesBefore = socket.countOf("get_current_room")

    socket.answer = (event) => (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT
      ? { ok: true, status, changed: status === "APPLIED", settingsVersion: 2, roomId: ROOM_ID, requestId, room: null }
      : HOLD)
    let verifyResult
    await act(async () => { verifyResult = await result.current.verifyRoomSettingsResult() })

    assert.equal(verifyResult.ok, true)
    assert.equal(verifyResult.status, status)
    assert.equal(result.current.hasPendingSettingsResult, false, "확정된 결과가 미확인으로 남았다")
    assert.equal(result.current.settingsError, null)

    assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
      "스냅샷 없는 결과를 받고도 현재 소속을 다시 확보하지 않았다")
    assert.equal(result.current.isRoomVerified, false,
      "확인되지 않은 옛 소속 위에서 준비·시작·저장이 계속 열려 있다")

    assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1, "결과 확인이 저장을 다시 보냈다")

    await act(async () => {
      socket.release("get_current_room", { ok: true, room: null })
      await Promise.resolve()
    })
    assert.equal(useMatchingStore.getState().roomId, null, "서버가 확정한 '방 없음'이 반영되지 않았다")
    assert.equal(navigations.roomDeleted, 1, "권위 있는 방 없음 처리가 보존되지 않았다")
    assert.equal(socket.countOf("get_current_room"), queriesBefore + 1, "재확인이 조회 루프를 만들었다")
  })
}

test("AC-05 · 결과 응답이 유효한 방 스냅샷을 실어 주면 그것을 그대로 적용하고 추가 조회를 걸지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const requestId = await makePendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")

  const fresh = serverRoom({ settingsVersion: 2, maxPlayers: 6 })
  socket.answer = (event) => (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT
    ? { ok: true, status: "APPLIED", changed: true, settingsVersion: 2, roomId: ROOM_ID, requestId, room: fresh }
    : HOLD)
  await act(async () => { await result.current.verifyRoomSettingsResult() })

  assert.equal(useMatchingStore.getState().settingsVersion, 2, "응답이 실어 준 최신 스냅샷이 적용되지 않았다")
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 6)
  assert.equal(socket.countOf("get_current_room"), queriesBefore,
    "이미 권위 있는 스냅샷을 받았는데 조회를 또 걸었다")
  assert.equal(result.current.isRoomVerified, true, "유효한 스냅샷을 받고도 검증이 풀렸다")
  assert.equal(result.current.hasPendingSettingsResult, false)
})

test("AC-05 · 결과 조회보다 나중에 도착한 더 새로운 설정 방송이 있으면 옛 스냅샷도 추가 조회도 적용하지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const requestId = await makePendingSave(socket, result)
  const queriesBefore = socket.countOf("get_current_room")

  socket.answer = (event) => (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT ? HOLD : HOLD)
  let verifyPromise
  await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })

  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 3, accessType: "open",
      settings: { ...serverRoom().settings, maxPlayers: 10 },
      hostUuid: HOST, canStart: false, players: serverRoom().players,
    })
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 3)

  await act(async () => {
    socket.release(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, {
      ok: true, status: "APPLIED", changed: true, settingsVersion: 2,
      roomId: ROOM_ID, requestId, room: serverRoom({ settingsVersion: 2 }),
    })
    await verifyPromise
  })

  assert.equal(useMatchingStore.getState().settingsVersion, 3, "옛 결과 스냅샷이 더 새로운 방송을 덮었다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore,
    "이미 더 새로운 상태를 반영했는데 조회를 또 걸었다")
})

async function fireFromSupersededSocket(socketA, event, payload) {
  const socketB = createFakeSocket("sock-B")
  socketB.answer = () => HOLD // 새 조회를 붙잡아 둬 잘못된 사건을 덮어 가리지 않는다.
  await act(async () => {
    setSocket(socketB)
    assert.equal(socketA.listenerCount(event), 1, `반드시 cleanup 전에 재현해야 한다(${event})`)
    socketA.trigger(event, payload)
  })
  return socketB
}

test("AC-05 · cleanup 이전에 도착한 옛 소켓의 설정 방송은 현재 방 설정을 바꾸지 못한다", async () => {
  const { socket } = await mountVerified()
  assert.equal(useMatchingStore.getState().settingsVersion, 1)

  await fireFromSupersededSocket(socket, SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
    roomId: ROOM_ID, settingsVersion: 9, accessType: "code",
    settings: { ...serverRoom().settings, maxPlayers: 4 },
    hostUuid: "someone-else", canStart: true, players: [],
  })

  const state = useMatchingStore.getState()
  assert.equal(state.settingsVersion, 1, "남이 된 소켓의 설정 방송이 현재 설정을 덮었다")
  assert.equal(state.settings.maxPlayers, 8)
  assert.equal(state.hostUuid, HOST)
  assert.equal(state.players.length, 2)
})

test("AC-05 · cleanup 이전에 도착한 옛 소켓의 room_deleted는 화면을 이동시키지 못한다", async () => {
  const { socket } = await mountVerified()

  await fireFromSupersededSocket(socket, "room_deleted", {})

  assert.equal(navigations.roomDeleted, 0, "남이 된 소켓의 방 삭제가 화면을 이동시켰다")
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID, "남이 된 소켓의 방 삭제가 현재 방을 지웠다")
})

test("AC-05 · cleanup 이전에 도착한 옛 소켓의 game_started는 인게임으로 이동시키지 못한다", async () => {
  const { socket } = await mountVerified()

  await fireFromSupersededSocket(socket, "game_started", {
    gameId: "game-stale", roomId: ROOM_ID, players: [], you: { uuid: HOST, role: "CITIZEN" },
  })

  assert.deepEqual(navigations.gameStarted, [], "남이 된 소켓의 게임 시작이 화면을 이동시켰다")
  assert.equal(useInGameStore.getState().gameId ?? null, null, "남이 된 소켓의 게임 시작이 세션을 만들었다")
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID, "남이 된 소켓의 게임 시작이 대기방을 지웠다")
  assert.deepEqual(sfxEvents.filter((e) => e.kind === "game-started"), [], "남이 된 소켓의 시작음이 났다")
})

test("AC-05 · cleanup 이전에 도착한 옛 소켓의 준비·참가·방장 사건은 표시도 소리도 만들지 못한다", async () => {
  const { socket } = await mountVerified()

  await fireFromSupersededSocket(socket, "player_ready_changed", {
    uuid: "p1", isReady: true, canStart: true, roomId: ROOM_ID,
    settingsVersion: 1, readyRevision: 5,
    sfxEvent: { eventId: "room:room-1:ready:p1:5", roomId: ROOM_ID, origin: "live" },
  })

  const state = useMatchingStore.getState()
  assert.equal(state.players.find((p) => p.uuid === "p1").isReady, false,
    "남이 된 소켓의 준비 사건이 표시를 바꿨다")
  assert.equal(state.canStart, false)
  assert.deepEqual(sfxEvents.filter((e) => e.kind === "room-ready-changed"), [],
    "남이 된 소켓의 준비 사건이 소리를 냈다")
})

test("AC-05 · 지금 통로의 방 사건은 그대로 반영된다(초기 발견 이후 영구히 막지 않는다)", async () => {
  const { socket } = await mountVerified()

  await act(async () => {
    socket.trigger("player_joined_room", {
      player: { uuid: "p2", nickname: "p2", isReady: false }, canStart: false,
    })
  })
  assert.equal(useMatchingStore.getState().players.length, 3, "현재 통로의 참가 사건이 막혔다")

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false, roomId: ROOM_ID,
      settingsVersion: 1, readyRevision: 3,
      sfxEvent: { eventId: "room:room-1:ready:p1:3", roomId: ROOM_ID, origin: "live" },
    })
  })
  assert.equal(useMatchingStore.getState().players.find((p) => p.uuid === "p1").isReady, true,
    "현재 통로의 준비 사건이 막혔다")
  assert.equal(sfxEvents.filter((e) => e.kind === "room-ready-changed").length, 1,
    "현재 통로의 준비 사건에서 소리가 나지 않았다")

  await act(async () => {
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 2, accessType: "code",
      settings: { ...serverRoom().settings, maxPlayers: 6 },
      hostUuid: HOST, canStart: false, players: serverRoom().players,
    })
  })
  assert.equal(useMatchingStore.getState().settingsVersion, 2, "현재 통로의 설정 방송이 막혔다")

  await act(async () => { socket.trigger("room_deleted", {}) })
  assert.equal(navigations.roomDeleted, 1, "현재 통로의 방 삭제가 막혔다")
})

test("AC-05 · 계정이 갈린 뒤 도착한 옛 연결의 방 사건은 새 계정의 화면을 바꾸지 못한다", async () => {
  const { socket } = await mountVerified()

  await act(async () => {
    useAuthStore.setState({ user: { uuid: "account-b" }, isLoggedIn: true })
    assert.equal(socket.listenerCount(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED), 1,
      "반드시 cleanup 전에 재현해야 한다")
    socket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: ROOM_ID, settingsVersion: 7, accessType: "code",
      settings: { ...serverRoom().settings, maxPlayers: 4 },
      hostUuid: HOST, canStart: true, players: serverRoom().players,
    })
    socket.trigger("room_deleted", {})
  })

  const state = useMatchingStore.getState()
  assert.equal(state.roomId, null, "계정 전환이 이전 계정의 방을 남겼다")
  assert.equal(state.settingsVersion, null, "이전 계정의 설정이 새 계정 화면에 남았다")
  assert.equal(navigations.roomDeleted, 0, "이전 계정 연결의 방 삭제가 새 계정 화면을 이동시켰다")
})

test("AC-05 · 신원이 바뀌면 옛 계정의 검증이 즉시 풀리고, 이전 계정으로 인증된 연결로는 새 신원을 묻지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const queriesAsA = socket.countOf("get_current_room")

  await act(async () => {
    useAuthStore.setState({ user: { uuid: "account-b" }, isLoggedIn: true })
  })
  await settle()

  assert.equal(result.current.isRoomVerified, false,
    "이전 계정에서 받은 검증이 새 신원에도 그대로 남았다")
  assert.equal(socket.countOf("get_current_room"), queriesAsA,
    "이전 계정으로 인증된 연결에 새 신원의 방을 물었다")
  assert.equal(useMatchingStore.getState().roomId, null, "이전 계정의 방이 남았다")

  const socketB = createFakeSocket("sock-B")
  const roomB = serverRoom({ roomId: "room-b", hostUuid: "account-b" })
  socketB.answer = (event) => (event === "get_current_room" ? { ok: true, room: roomB } : HOLD)
  await act(async () => { setSocket(socketB) })
  await settle()

  assert.equal(socketB.countOf("get_current_room"), 1, "새 연결로 새 신원을 확인하지 않았다")
  assert.equal(result.current.isRoomVerified, true, "새 연결의 확인이 검증으로 이어지지 않았다")
  assert.equal(useMatchingStore.getState().roomId, "room-b")
})

test("AC-05 · 확인 중에 신원이 바뀌면 검증이 확인 중에 갇히지 않고, 옛 응답은 아무것도 되살리지 못한다", async () => {
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: { uuid: HOST }, isLoggedIn: true })
  const socketA = createFakeSocket("sock-A")
  socketA.answer = () => HOLD // 최초 확인을 붙잡아 둔다.
  setSocket(socketA)

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await settle()
  assert.equal(socketA.countOf("get_current_room"), 1)
  assert.equal(result.current.isRoomVerified, false)

  await act(async () => {
    useAuthStore.setState({ user: { uuid: "account-b" }, isLoggedIn: true })
  })
  await settle()
  assert.equal(socketA.countOf("get_current_room"), 1,
    "이전 계정으로 인증된 연결에 새 신원의 방을 물었다")

  await act(async () => {
    socketA.release("get_current_room", { ok: true, room: serverRoom() })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().roomId, null, "옛 신원의 응답이 방을 만들었다")
  assert.equal(result.current.isRoomVerified, false, "옛 신원의 응답이 새 신원을 검증했다")

  const socketB = createFakeSocket("sock-B")
  const roomB = serverRoom({ roomId: "room-b", hostUuid: "account-b" })
  socketB.answer = (event) => (event === "get_current_room" ? { ok: true, room: roomB } : HOLD)
  await act(async () => { setSocket(socketB) })
  await settle()
  assert.equal(result.current.isRoomVerified, true, "신원 전환 뒤 검증이 회복되지 않았다")
  assert.equal(useMatchingStore.getState().roomId, "room-b")
})

test("AC-05 · 로그아웃하면 이전 계정의 검증·방이 남지 않고 로그아웃한 신원으로 조회하지 않는다", async () => {
  const { socket, result } = await mountVerified()
  const queriesBefore = socket.countOf("get_current_room")

  await act(async () => { useAuthStore.setState({ user: null, isLoggedIn: false }) })
  await settle()

  assert.equal(result.current.isRoomVerified, false, "로그아웃 뒤에도 검증이 남았다")
  assert.equal(useMatchingStore.getState().roomId, null, "로그아웃 뒤에도 이전 계정의 방이 남았다")
  assert.equal(socket.countOf("get_current_room"), queriesBefore,
    "로그아웃한 신원으로 이전 계정의 연결에 조회를 보냈다")

  await act(async () => { setSocket(null) })
  await settle()
  assert.equal(socket.countOf("get_current_room"), queriesBefore)
})

test("AC-05 · A→B→A로 신원이 되돌아오면 지금도 그 계정으로 인증된 연결로 다시 확인한다", async () => {
  const { socket, result } = await mountVerified()
  const queriesAsA = socket.countOf("get_current_room")

  await act(async () => {
    useAuthStore.setState({ user: { uuid: "account-b" }, isLoggedIn: true })
    useAuthStore.setState({ user: { uuid: HOST }, isLoggedIn: true })
  })
  await settle()

  assert.equal(socket.countOf("get_current_room"), queriesAsA + 1,
    "신원이 되돌아왔는데 검증이 확인 중에 갇혔다")
  assert.equal(result.current.isRoomVerified, true, "자기 연결로 받은 확인이 검증으로 이어지지 않았다")
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID)
})

test("AC-05 · 최초 방 발견은 조회 한 번으로 끝난다(신원 가드가 루프를 만들지 않는다)", async () => {
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: { uuid: HOST }, isLoggedIn: true })
  const socket = createFakeSocket("sock-A")
  socket.answer = (event) => (event === "get_current_room" ? { ok: true, room: serverRoom() } : HOLD)
  setSocket(socket)

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await settle()
  await settle()

  assert.equal(socket.countOf("get_current_room"), 1, "최초 발견이 조회를 여러 번 돌았다")
  assert.equal(result.current.isRoomVerified, true)
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID)
})


test("operator: account ABA recovery keeps current room broadcasts alive", async () => {
  const { socket, result } = await mountVerified()
  await act(async () => {
    useAuthStore.setState({ user: { uuid: "account-b" }, isLoggedIn: true })
    useAuthStore.setState({ user: { uuid: HOST }, isLoggedIn: true })
  })
  await settle()
  assert.equal(result.current.isRoomVerified, true)
  assert.equal(useMatchingStore.getState().roomId, ROOM_ID)
  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "p1", isReady: true, canStart: false, roomId: ROOM_ID,
      settingsVersion: 1, readyRevision: 7,
    })
  })
  assert.equal(useMatchingStore.getState().players.find(p => p.uuid === "p1").isReady, true,
    "authoritative ABA recovery permanently suppressed current-source events")
})

for (const status of ["APPLIED", "NO_CHANGE"]) {
  test("operator: intervening ready event cannot validate missing-room result " + status, async () => {
    const { socket, result } = await mountVerified()
    const requestId = await makePendingSave(socket, result)
    const queriesBefore = socket.countOf("get_current_room")
    let verifyPromise
    await act(async () => { verifyPromise = result.current.verifyRoomSettingsResult() })
    await act(async () => {
      socket.trigger("player_ready_changed", {
        uuid: "p1", isReady: true, canStart: false, roomId: ROOM_ID,
        settingsVersion: 1, readyRevision: 7,
      })
    })
    await act(async () => {
      socket.release(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT,
        { ok: true, status, roomId: ROOM_ID, requestId, settingsVersion: 2, room: null })
      await verifyPromise
    })
    assert.equal(result.current.hasPendingSettingsResult, false)
    assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
      "an intervening ready event is not proof of current membership")
    assert.equal(result.current.isRoomVerified, false)
    assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1)
    await act(async () => { socket.release("get_current_room", { ok: true, room: null }) })
    assert.equal(useMatchingStore.getState().roomId, null)
    assert.equal(navigations.roomDeleted, 1)
  })
}

test("operator: same-batch membership ABA recovery keeps current events alive", async () => {
 const { socket, result } = await mountVerified()
 socket.answer = () => HOLD
 await act(async () => {
   useMatchingStore.getState().setRoom(serverRoom({roomId:"room-2"}))
   useMatchingStore.getState().setRoom(serverRoom())
 })
 assert.equal(result.current.isRoomVerified, false)
 await act(async () => {
   while(socket.holds.some(h=>h.event==="get_current_room")) {
     socket.release("get_current_room", {ok:true, room:serverRoom()})
   }
 })
 await settle()
 assert.equal(result.current.isRoomVerified, true)
 await act(async () => {
   socket.trigger("player_ready_changed", {uuid:"p1", isReady:true, canStart:false,
     roomId:ROOM_ID, settingsVersion:1, readyRevision:8})
 })
 assert.equal(useMatchingStore.getState().players.find(p=>p.uuid==="p1").isReady,true,
   "membership ABA verification must renew the event subscription")
})
