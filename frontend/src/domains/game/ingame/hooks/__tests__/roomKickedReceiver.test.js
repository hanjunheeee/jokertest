import test from "node:test"
import assert from "node:assert/strict"
import { act, createElement } from "react"
import { JSDOM } from "jsdom"

/**
 * F-21(AC-02/AC-05/AC-06 · A-10): **실제 전역 수신기**(ProtectedRoute에 장착된
 * useGameSessionSocketEvents)를 실제 matchingStore와 함께 마운트해, 개인 퇴장 사건과 계정
 * 캐시 수렴을 검증한다.
 *
 * 가짜 방 객체를 만들어 넣지 않는다 — 방 상태는 서버 응답을 setRoom으로 적재해서 얻는다.
 * 라우터도 실제 react-router-dom(MemoryRouter)이라 이동은 실제 navigate로 일어난다.
 *
 * 계정 캐시 세 store는 앱 진입점이 등록하는 경계(accountCacheRefresh)를 통해 들어오므로,
 * 여기서는 그 자리에 기록용 어댑터를 등록해 "수신기가 무엇을 언제 요청했는가"를 본다
 * (실제 store의 조회 순서·세대 계약은 departureResultRefresh.test.js가 실제 코드로 검증한다).
 */
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")
const { MemoryRouter, useLocation } = await import("react-router-dom")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useMatchingStore } = await import("../../../matching/store/matchingStore.js")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../useGameSessionSocketEvents.js")
const { registerAccountCacheStores, clearAccountCacheStores } =
  await import("../../../../user/utils/accountCacheRefresh.js")

const ME = "uuid-me"
const OTHER = "uuid-other"

/** 등록된 리스너에게만 동기적으로 전달하는 최소 fake 소켓. */
function createFakeSocket() {
  const listeners = new Map()
  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    listenerCount(event) { return listeners.get(event)?.size ?? 0 },
  }
}

/** 서버 buildRoomPayload와 같은 모양의 방 응답. */
function serverRoom(overrides = {}) {
  return {
    roomId: "room-1",
    roomCode: "CODE11",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    hostUuid: OTHER,
    canStart: false,
    accessType: "PRIVATE",
    settings: { maxPlayers: 8, jokerCount: 1 },
    settingsVersion: 1,
    players: [
      { uuid: OTHER, nickname: "방장", isReady: true, membershipId: "mem-other" },
      { uuid: ME, nickname: "나", isReady: false, membershipId: "mem-me" },
    ],
    ...overrides,
  }
}

/** 서버가 제거 **전에** 캡처해 싣는 개인 퇴장 사건. */
function kickedEvent(overrides = {}) {
  return {
    roomId: "room-1",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    targetUuid: ME,
    targetMembershipId: "mem-me",
    hostUuid: OTHER,
    requestId: "kick-1",
    ...overrides,
  }
}

/** 서버가 제거 **전에** 캡처해 싣는 진행 중 추방 사건(kick_game_player의 개인 통지). */
function gameKickedEvent(overrides = {}) {
  return {
    gameId: "game-9",
    roomId: "room-1",
    roomInstanceId: "inst-1",
    bootEpoch: "boot-1",
    targetUuid: ME,
    targetMembershipId: "g-me",
    hostUuid: OTHER,
    requestId: "kick-g-1",
    ...overrides,
  }
}

/** 서버 buildGameStartedPayload와 같은 모양의 진행 중 세션 하나를 적재한다. */
function seedGame(overrides = {}) {
  act(() => {
    useAuthStore.setState({ user: { uuid: ME }, isLoggedIn: true })
    useInGameStore.getState().setGamePayload({
      gameId: "game-9",
      state: {
        id: "game-9", phase: "DAY", dayIndex: 1, hostUuid: OTHER,
        roomId: "room-1", roomInstanceId: "inst-1", bootEpoch: "boot-1",
        players: [
          { uuid: OTHER, nickname: "방장", isAlive: true, isParticipating: true, membershipId: "g-other" },
          { uuid: ME, nickname: "나", isAlive: true, isParticipating: true, membershipId: "g-me" },
        ],
        self: { uuid: ME, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
        ...overrides,
      },
    })
  })
}

/** 기록용 계정 캐시 어댑터. 앱 진입점(ProtectedRoute)이 꽂는 자리에 그대로 들어간다. */
function installCacheRecorder() {
  const calls = []
  const adapter = (key) => ({
    invalidate: () => { calls.push({ key, mode: "invalidate" }) },
    refresh: () => { calls.push({ key, mode: "refresh" }) },
    fetch: () => { calls.push({ key, mode: "refresh" }) },
    isLoading: () => false,
  })
  registerAccountCacheStores({
    profile: adapter("profile"),
    economy: adapter("economy"),
    achievements: adapter("achievements"),
  })
  return calls
}

/**
 * 실제 수신기를 실제 라우터 안에서 마운트한다. 현재 경로를 함께 읽어 "이동이 실제로
 * 일어났는가"를 navigate 호출이 아니라 **결과 경로**로 확인한다.
 */
function mountReceiver() {
  const paths = []
  const wrapper = ({ children }) => createElement(MemoryRouter, { initialEntries: ["/game-matching"] }, children)
  const hook = renderHook(() => {
    useGameSessionSocketEvents()
    const location = useLocation()
    if (paths[paths.length - 1] !== location.pathname) paths.push(location.pathname)
    return location.pathname
  }, { wrapper })
  return { ...hook, paths }
}

function seedRoom(room = serverRoom(), me = ME) {
  act(() => {
    useAuthStore.setState({ user: { uuid: me }, isLoggedIn: true })
    useMatchingStore.getState().setRoom(room)
  })
}

test.afterEach(() => {
  act(() => {
    useMatchingStore.getState().clearRoom()
    useInGameStore.getState().clearGame()
    useAuthStore.setState({ user: null, isLoggedIn: false })
  })
  setSocket(null)
  clearAccountCacheStores()
})

// ── AC-02: 내 소속이 맞는 사건 ────────────────────────────────────────────────

test("AC-02: 확정된 개인 퇴장은 그 방만 비우고 로비로 한 번 이동한다", () => {
  const socket = createFakeSocket()
  seedRoom()
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("room_kicked", kickedEvent()))

  const state = useMatchingStore.getState()
  assert.equal(state.isInRoom, false)
  assert.deepEqual(state.players, [])
  assert.equal(state.roomInstanceId, null)
  assert.deepEqual(view.paths, ["/game-matching", "/multiplay"])

  // 같은 사건이 다시 전달돼도 이동은 더 늘지 않는다(판정이 이미 실패한다).
  act(() => socket.deliver("room_kicked", kickedEvent()))
  assert.deepEqual(view.paths, ["/game-matching", "/multiplay"])
  view.unmount()
})

test("AC-05: 대기방 추방은 진행 중인 게임 상태를 건드리지 않는다", () => {
  const socket = createFakeSocket()
  seedRoom()
  act(() => {
    useInGameStore.getState().setGamePayload({
      gameId: "game-9",
      state: {
        id: "game-9", phase: "DAY", dayIndex: 1, hostUuid: OTHER,
        players: [{ uuid: ME, nickname: "나", isAlive: true, isParticipating: true, membershipId: "g-me" }],
        self: { uuid: ME, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      },
    })
  })
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("room_kicked", kickedEvent()))

  assert.equal(useMatchingStore.getState().isInRoom, false)
  assert.equal(useInGameStore.getState().gameId, "game-9", "그 방이 소유하지 않은 게임은 그대로다")
  view.unmount()
})

// ── AC-02/AC-05: 진행 중 추방(game_kicked) ───────────────────────────────────

test("AC-02: 확정된 진행 중 추방은 그 게임만 비우고 로비로 한 번 이동한다", () => {
  const socket = createFakeSocket()
  seedGame()
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("game_kicked", gameKickedEvent()))

  assert.equal(useInGameStore.getState().gameId, null)
  assert.equal(useInGameStore.getState().state, null)
  assert.deepEqual(view.paths, ["/game-matching", "/multiplay"])

  // 같은 사건이 다시 전달돼도 이동은 더 늘지 않는다(판정이 이미 실패한다).
  act(() => socket.deliver("game_kicked", gameKickedEvent()))
  assert.deepEqual(view.paths, ["/game-matching", "/multiplay"])
  view.unmount()
})

test("AC-05: 옛 게임의 추방 사건이 그 사이 들어간 **새 대기방**까지 지우지 않는다", () => {
  const socket = createFakeSocket()
  seedGame()
  // 추방 뒤 로비로 돌아가 새 방에 들어갔는데, 그 게임의 사건이 이제야 도착하는 순서다.
  seedRoom(serverRoom({ roomId: "room-2", roomInstanceId: "inst-2" }))
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("game_kicked", gameKickedEvent()))

  const room = useMatchingStore.getState()
  assert.equal(room.isInRoom, true, "옛 게임 사건이 새 대기방 소속을 지웠다")
  assert.equal(room.roomId, "room-2")
  assert.equal(room.players.length, 2)
  // 그 사건이 소유한 것은 게임뿐이다.
  assert.equal(useInGameStore.getState().gameId, null)
  view.unmount()
})

test("AC-05/AC-06: 다른 게임·옛 인스턴스·옛 기동·다른 소속·남의 사건은 전부 무시된다", () => {
  const socket = createFakeSocket()
  seedGame()
  act(() => setSocket(socket))
  const view = mountReceiver()

  const ignored = [
    gameKickedEvent({ gameId: "game-10" }),
    gameKickedEvent({ roomInstanceId: "inst-2" }),
    gameKickedEvent({ bootEpoch: "boot-2" }),
    gameKickedEvent({ targetMembershipId: "g-me-2" }),
    gameKickedEvent({ targetUuid: OTHER, targetMembershipId: "g-other" }),
  ]
  for (const event of ignored) act(() => socket.deliver("game_kicked", event))

  assert.equal(useInGameStore.getState().gameId, "game-9")
  assert.equal(useInGameStore.getState().state.players.length, 2)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

// ── AC-05/AC-06: 내 소속이 아닌 사건 ─────────────────────────────────────────

test("AC-06: 같은 방에 다시 들어온 뒤 도착한 옛 사건은 새 소속을 지우지 않는다", () => {
  const socket = createFakeSocket()
  // 서버는 재입장에 새 membershipId를 발급한다 — 옛 사건의 소속과 다르다.
  seedRoom(serverRoom({
    players: [
      { uuid: OTHER, nickname: "방장", isReady: true, membershipId: "mem-other" },
      { uuid: ME, nickname: "나", isReady: false, membershipId: "mem-me-2" },
    ],
  }))
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("room_kicked", kickedEvent()))

  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.equal(useMatchingStore.getState().players.length, 2)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("AC-05: R1→R2 이동 뒤 도착한 R1의 사건은 현재 방을 지우지 않는다", () => {
  const socket = createFakeSocket()
  seedRoom(serverRoom({ roomId: "room-2", roomInstanceId: "inst-2" }))
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("room_kicked", kickedEvent()))

  assert.equal(useMatchingStore.getState().roomId, "room-2")
  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("AC-05: 같은 roomId로 다시 만들어진 방(새 인스턴스)의 사건도 거부된다", () => {
  const socket = createFakeSocket()
  seedRoom(serverRoom({ roomInstanceId: "inst-2" }))
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("room_kicked", kickedEvent()))

  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("AC-05: 서버 재시작 전(옛 bootEpoch) 명령은 현재 상태를 바꾸지 않는다", () => {
  const socket = createFakeSocket()
  seedRoom(serverRoom({ bootEpoch: "boot-2" }))
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("room_kicked", kickedEvent()))

  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("AC-05: 계정 A→B→A 전환 중 도착한 A의 옛 사건은 현재 화면을 바꾸지 않는다", () => {
  const socket = createFakeSocket()
  seedRoom()
  act(() => setSocket(socket))
  const view = mountReceiver()

  // B로 전환된 순간 도착 — 대상이 현재 인증 계정이 아니다.
  act(() => useAuthStore.setState({ user: { uuid: "uuid-b" }, isLoggedIn: true }))
  act(() => socket.deliver("room_kicked", kickedEvent()))
  assert.equal(useMatchingStore.getState().isInRoom, true)

  // 다시 A로 돌아와 새 소속으로 앉았다 — 옛 소속의 사건은 여전히 남의 것이다.
  act(() => {
    useAuthStore.setState({ user: { uuid: ME }, isLoggedIn: true })
    useMatchingStore.getState().setRoom(serverRoom({
      players: [
        { uuid: OTHER, nickname: "방장", isReady: true, membershipId: "mem-other" },
        { uuid: ME, nickname: "나", isReady: false, membershipId: "mem-me-3" },
      ],
    }))
  })
  act(() => socket.deliver("room_kicked", kickedEvent()))

  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("AC-05: 연결이 교체되면 옛 소켓의 사건은 더 이상 이 화면에 닿지 않는다", () => {
  const oldSocket = createFakeSocket()
  seedRoom()
  act(() => setSocket(oldSocket))
  const view = mountReceiver()
  assert.ok(oldSocket.listenerCount("room_kicked") > 0)

  const newSocket = createFakeSocket()
  act(() => setSocket(newSocket))
  assert.equal(oldSocket.listenerCount("room_kicked"), 0, "옛 연결의 구독은 해제된다")

  act(() => oldSocket.deliver("room_kicked", kickedEvent()))
  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("AC-02: 로그인하지 않은 상태에서는 어떤 개인 퇴장 사건도 적용되지 않는다", () => {
  const socket = createFakeSocket()
  seedRoom()
  act(() => useAuthStore.setState({ user: null, isLoggedIn: false }))
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("room_kicked", kickedEvent()))

  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("AC-02: 형태가 잘못된 사건은 조용히 무시된다", () => {
  const socket = createFakeSocket()
  seedRoom()
  act(() => setSocket(socket))
  const view = mountReceiver()

  for (const bad of [null, undefined, "kick", [], {}, { targetUuid: ME }]) {
    act(() => socket.deliver("room_kicked", bad))
  }

  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

// ── A-10: 계정 캐시 수렴 ─────────────────────────────────────────────────────

test("A-10: 서버 개인 무효화는 실린 범위만 낡은 것으로 선언한다", () => {
  const socket = createFakeSocket()
  const calls = installCacheRecorder()
  seedRoom()
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("account_cache_invalidated", { gameId: "game-1", scopes: ["profile"] }))
  assert.deepEqual(calls, [{ key: "profile", mode: "invalidate" }])

  act(() => socket.deliver("account_cache_invalidated", {
    gameId: "game-1", scopes: ["economy", "achievements"],
  }))
  assert.deepEqual(calls.slice(1), [
    { key: "economy", mode: "invalidate" },
    { key: "achievements", mode: "invalidate" },
  ])
  // 캐시 신호는 게임·방 상태를 건드리지 않고 이동도 만들지 않는다.
  assert.equal(useMatchingStore.getState().isInRoom, true)
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("A-10: 재연결·창 재활성화·탭 가시화는 세 캐시를 모두 다시 확인한다(무효화 선언은 아니다)", () => {
  const socket = createFakeSocket()
  const calls = installCacheRecorder()
  seedRoom()
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("connect", undefined))
  assert.deepEqual(calls.map((c) => c.key), ["profile", "economy", "achievements"])
  assert.ok(calls.every((c) => c.mode === "refresh"), "재연결은 캐시를 낡았다고 선언하지 않는다")

  calls.length = 0
  act(() => dom.window.dispatchEvent(new dom.window.Event("focus")))
  assert.deepEqual(calls.map((c) => c.key), ["profile", "economy", "achievements"])

  calls.length = 0
  act(() => dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange")))
  // jsdom의 기본 visibilityState는 "visible"이다 — 보이지 않는 전이에서는 아무 것도 하지 않는다.
  assert.deepEqual(calls.map((c) => c.key), ["profile", "economy", "achievements"])

  // 이 전이들은 어떤 화면 이동도 만들지 않는다(게임 복원도 하지 않는다).
  assert.deepEqual(view.paths, ["/game-matching"])
  view.unmount()
})

test("A-10: 로그인하지 않은 상태의 창 전이는 어떤 조회도 만들지 않는다", () => {
  const socket = createFakeSocket()
  const calls = installCacheRecorder()
  act(() => useAuthStore.setState({ user: null, isLoggedIn: false }))
  act(() => setSocket(socket))
  const view = mountReceiver()

  act(() => socket.deliver("connect", undefined))
  act(() => dom.window.dispatchEvent(new dom.window.Event("focus")))

  assert.deepEqual(calls, [])
  view.unmount()
})

test("A-10: 언마운트하면 창 전이 구독도 함께 해제된다", () => {
  const socket = createFakeSocket()
  const calls = installCacheRecorder()
  seedRoom()
  act(() => setSocket(socket))
  const view = mountReceiver()
  view.unmount()

  act(() => dom.window.dispatchEvent(new dom.window.Event("focus")))
  assert.deepEqual(calls, [])
})
