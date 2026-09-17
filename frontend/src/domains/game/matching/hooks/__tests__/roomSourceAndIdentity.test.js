/**
 * F-20 AC-05: 대기방 훅의 **출처·신원** 계약 회귀(CODEX-6 지적 1~3).
 *
 * 세 가지를 한 파일에서 고정한다. 셋 다 "응답이나 사건이 도착했다"는 사실만으로는
 * 그것이 **지금 이 화면의 것**임을 증명하지 못한다는 같은 뿌리를 가진다.
 *
 *   1. 결과 조회가 방 스냅샷 없이 APPLIED/NO_CHANGE를 확정해 준 경우. 서버의
 *      handleGetRoomSettingsUpdateResult는 요청자가 더 이상 그 방의 확정 참가자가 아니면
 *      역사적 결과는 그대로 주면서 room:null을 돌려준다 — 스냅샷의 부재는 "지금 상태가
 *      그대로 유효하다"는 증거가 아니라 **권위 있는 상태를 다시 확보해야 한다**는 뜻이다.
 *   2. 이미 남이 된 소켓이 cleanup 전에 전달한 방 사건. setSocket(B)는 React cleanup보다
 *      **먼저** 일어나므로, 리스너 해제만으로는 그 사이 A로 도착한 사건이 막히지 않는다.
 *   3. 계정 신원 전환. 신원이 갈리는 순간 소켓은 아직 **이전 계정으로 handshake한 연결**이라,
 *      그 통로로 새 계정의 방을 묻고 그 응답을 믿으면 안 된다.
 *
 * 실제 useMatchingRoom·실제 matchingStore·실제 auth store를 그대로 쓴다. 소켓만 대역인데
 * 모듈 목업이 아니라 **실제 socketClient.setSocket**으로 꽂으므로 이 파일은
 * `--experimental-test-module-mocks` 없이 그대로 돈다.
 */
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

/** 화면 이동 콜백의 실제 호출을 기록한다. 참조는 렌더마다 같아야 한다(동기화 effect의 deps). */
const navigations = { roomDeleted: 0, gameStarted: [] }
const roomCallbacks = {
  onRoomDeleted: () => { navigations.roomDeleted += 1 },
  onGameStarted: (payload) => { navigations.gameStarted.push(payload) },
}

/** 실제로 재생기까지 도달한 효과음 사건. 리스너 가드가 소리까지 막는지 관찰한다. */
const sfxEvents = []

/** emitWithAck 응답을 붙잡아 두라는 표식. */
const HOLD = Symbol("hold")

function createFakeSocket(id = "sock-test") {
  const listeners = new Map()
  const socket = {
    id,
    connected: true,
    emitted: [],
    holds: [],
    /** (event, payload) => 응답값 | HOLD. 시험이 매 순간 갈아끼운다. */
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

/** 소켓·store·계정을 세우고 최초 get_current_room까지 끝내 'verified'로 만든다. */
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

/** effect·마이크로태스크가 전부 흐르게 한다. */
async function settle() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

/**
 * ACK를 잃은 저장 하나를 만들어 "결과 미확인" 상태로 만든다.
 * 실제 saveRoomSettings를 그대로 쓰고 timeout만 주입한다.
 */
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

/** GameSetupPanel이 실제로 넘기는 모양의 폼 상태(값 자체는 이 시험의 관심사가 아니다). */
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

// ── 지적 1: 방 스냅샷 없는 결과 확정 ────────────────────────────────────────

for (const status of ["APPLIED", "NO_CHANGE"]) {
  test(`AC-05 · 방 스냅샷 없이 ${status}로 확정된 결과는 원 요청을 정착시키되 권위 있는 소속을 다시 확보한다`, async () => {
    const { socket, result } = await mountVerified()
    const requestId = await makePendingSave(socket, result)

    const queriesBefore = socket.countOf("get_current_room")

    // 서버는 역사적 결과를 알고 있지만, 지금 이 계정은 그 방의 확정 참가자가 아니다
    // (그 사이 이탈·방 삭제·게임 시작). 실제 handleGetRoomSettingsUpdateResult가
    // 그 경우 room:null을 함께 돌려준다.
    socket.answer = (event) => (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT
      ? { ok: true, status, changed: status === "APPLIED", settingsVersion: 2, roomId: ROOM_ID, requestId, room: null }
      : HOLD)
    let verifyResult
    await act(async () => { verifyResult = await result.current.verifyRoomSettingsResult() })

    // (a) 원 요청의 정착은 그대로 보존한다 — 결과를 알았으므로 미확인이 아니다.
    assert.equal(verifyResult.ok, true)
    assert.equal(verifyResult.status, status)
    assert.equal(result.current.hasPendingSettingsResult, false, "확정된 결과가 미확인으로 남았다")
    assert.equal(result.current.settingsError, null)

    // (b) 스냅샷이 없다는 사실을 "지금 상태가 유효하다"로 읽지 않는다 — 권위 있는 재확인.
    assert.equal(socket.countOf("get_current_room"), queriesBefore + 1,
      "스냅샷 없는 결과를 받고도 현재 소속을 다시 확보하지 않았다")
    assert.equal(result.current.isRoomVerified, false,
      "확인되지 않은 옛 소속 위에서 준비·시작·저장이 계속 열려 있다")

    // (c) 새 저장을 자동으로 만들지 않는다.
    assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1, "결과 확인이 저장을 다시 보냈다")

    // (d) 그 재확인이 "참여 중인 방 없음"을 확정하면 화면도 그대로 정리된다.
    await act(async () => {
      socket.release("get_current_room", { ok: true, room: null })
      await Promise.resolve()
    })
    assert.equal(useMatchingStore.getState().roomId, null, "서버가 확정한 '방 없음'이 반영되지 않았다")
    assert.equal(navigations.roomDeleted, 1, "권위 있는 방 없음 처리가 보존되지 않았다")
    // 재확인이 스스로를 다시 부르는 재귀가 되지 않아야 한다.
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

  // 조회가 떠난 뒤 더 새로운 설정이 방송으로 도착한다.
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

// ── 지적 2: cleanup 이전, 이미 남이 된 소켓의 방 사건 ──────────────────────

/** A를 B로 교체한 **같은 act 안에서** A의 사건 하나를 동기적으로 흘린다(cleanup 이전). */
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
    // 계정 전환. useSocket의 소켓 교체는 아직 일어나지 않았고, 이 소켓의 리스너는 살아 있다.
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

// ── 지적 3: 계정 신원 전환과 검증 ──────────────────────────────────────────

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

  // useSocket이 새 계정의 쿠키로 연결을 교체하면, 그때 비로소 그 통로로 검증한다.
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

  // 옛 신원으로 떠난 조회가 이제야 응답한다 — 새 계정의 화면을 만들면 안 된다.
  await act(async () => {
    socketA.release("get_current_room", { ok: true, room: serverRoom() })
    await Promise.resolve()
  })
  assert.equal(useMatchingStore.getState().roomId, null, "옛 신원의 응답이 방을 만들었다")
  assert.equal(result.current.isRoomVerified, false, "옛 신원의 응답이 새 신원을 검증했다")

  // 새 계정의 연결이 붙으면 검증이 확인 중에 갇히지 않고 정상적으로 회복된다.
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

  // useSocket이 연결을 끊는다 — 그 뒤에도 조회는 없다.
  await act(async () => { setSocket(null) })
  await settle()
  assert.equal(socket.countOf("get_current_room"), queriesBefore)
})

test("AC-05 · A→B→A로 신원이 되돌아오면 지금도 그 계정으로 인증된 연결로 다시 확인한다", async () => {
  const { socket, result } = await mountVerified()
  const queriesAsA = socket.countOf("get_current_room")

  // 소켓 교체 없이 신원만 A→B→A로 지나간다(같은 렌더 배치에서 되돌아오는 경우).
  await act(async () => {
    useAuthStore.setState({ user: { uuid: "account-b" }, isLoggedIn: true })
    useAuthStore.setState({ user: { uuid: HOST }, isLoggedIn: true })
  })
  await settle()

  // 이 연결은 지금도 A의 쿠키로 handshake한 연결이므로, A의 방을 묻는 것이 정당하다.
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
    // A ready event sent earlier is delivered while the result query is pending.
    // Server membership may subsequently have ended; historical result is still valid.
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
