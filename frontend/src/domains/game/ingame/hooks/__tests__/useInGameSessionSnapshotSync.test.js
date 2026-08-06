import test, { mock } from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal(
  "requestAnimationFrame",
  dom.window.requestAnimationFrame.bind(dom.window),
)
installDomGlobal(
  "cancelAnimationFrame",
  dom.window.cancelAnimationFrame.bind(dom.window),
)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")

// useInGameSessionSnapshotSync이 module 최상단에서 import하는 socketClient(getSocket/subscribeSocket)를
// 실제 mount 테스트에서 제어 가능한 fake로 교체한다. mock.module은 아직 로드되지 않은 specifier에만
// 적용되므로, hook 모듈(과 auth.store.js — window가 있어야 안전하게 초기화되는 persist 스토어를
// 담고 있어 JSDOM 전역 설치 이후로 import를 미룬다)은 이 mock 등록 이후의 동적 import로 가져온다.
let currentFakeSocket = null
const fakeSocketSubscribers = new Set()

function fakeGetSocket() {
  return currentFakeSocket
}

function fakeSubscribeSocket(callback) {
  fakeSocketSubscribers.add(callback)
  return () => {
    fakeSocketSubscribers.delete(callback)
  }
}

// 구독자에게 알려 리렌더를 유도하는 정상 경로. setSocket(newSocket)이 실제로 소켓을 교체하는
// 경로와 동일하다.
function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of [...fakeSocketSubscribers]) callback()
}

// 구독자에게 알리지 않고 getSocket()의 반환값만 바꾼다 — setSocket(newSocket)이 모듈 싱글턴을
// 교체한 직후, 아직 React가 리렌더링해 이 훅의 effect가 재실행되기 전인 순간을 재현한다.
function setFakeSocketWithoutNotify(next) {
  currentFakeSocket = next
}

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: {
    getSocket: fakeGetSocket,
    subscribeSocket: fakeSubscribeSocket,
  },
})

const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useInGameSessionSnapshotSync } = await import("../useInGameSessionSnapshotSync.js")

function createFakeSessionSnapshotSocket() {
  const onCalls = []
  const offCalls = []
  const connectHandlers = new Set()
  const emitWithAckCalls = []

  const socket = {
    connected: false,
    on(event, handler) {
      onCalls.push({ event, handler })
      if (event === "connect") connectHandlers.add(handler)
    },
    off(event, handler) {
      offCalls.push({ event, handler })
      if (event === "connect") connectHandlers.delete(handler)
    },
    timeout() {
      return socket
    },
    emitWithAck(event, payload) {
      let resolve
      let reject
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      emitWithAckCalls.push({ event, payload, resolve, reject, promise })
      return promise
    },
    triggerConnect() {
      for (const handler of [...connectHandlers]) handler()
    },
  }

  return { socket, onCalls, offCalls, connectHandlers, emitWithAckCalls }
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

function seedStore({ gameId, playerUuid = "player-1", nickname = "Alice", role = "CITIZEN", phase = "NIGHT", dayIndex = 0 }) {
  const team = role === "JOKER" ? "JOKER" : "CITIZEN"
  useInGameStore.setState({
    gameId,
    state: {
      id: gameId,
      phase,
      dayIndex,
      players: [{ uuid: playerUuid, nickname, alive: true, isConnected: true }],
      self: { uuid: playerUuid, nickname, role, team, hasActedThisPhase: false },
      tribunal: null,
      winResult: null,
      nightResult: null,
      dayVoteResolution: null,
    },
    error: null,
  })
}

function buildValidSnapshotResponse({ gameId, playerUuid = "player-1", nickname = "Alice", role = "CITIZEN", phase = "NIGHT", dayIndex = 0 }) {
  const team = role === "JOKER" ? "JOKER" : "CITIZEN"
  return {
    ok: true,
    gameId,
    phase,
    dayIndex,
    players: [{ uuid: playerUuid, nickname, isAlive: true, isConnected: true }],
    self: { uuid: playerUuid, nickname, role, team, hasActedThisPhase: false },
  }
}

function seedAuth(uuid) {
  useAuthStore.setState({ user: { uuid }, isLoggedIn: true, loggedOutIntentionally: false })
}

// applySessionSnapshot 호출을 실제 구현을 그대로 위임하며 세면서, 이후 캡처하는 wrapper가
// 이전 wrapper를 감싸는 형태로 쌓여도(파일 안 여러 테스트가 각자 wrapApplySessionSnapshot을
// 부르므로) 실제 병합 로직은 항상 정확히 한 번만 실행된다 — 각 테스트는 자기 자신의 calls
// 배열만 관찰한다.
function wrapApplySessionSnapshot() {
  const calls = []
  const original = useInGameStore.getState().applySessionSnapshot
  useInGameStore.setState({
    applySessionSnapshot: (response) => {
      calls.push(response)
      return original(response)
    },
  })
  return calls
}

test("이미 연결된 socket으로 활성화하면 connect 리스너 1개 등록 + get_session_snapshot을 정확히 { gameId }로 1회 요청한다", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())

  assert.equal(fake.onCalls.filter((c) => c.event === "connect").length, 1)
  assert.equal(fake.emitWithAckCalls.length, 1)
  assert.deepEqual(fake.emitWithAckCalls[0].payload, { gameId: "g1" })
  assert.equal(fake.emitWithAckCalls[0].event, "get_session_snapshot")

  hook.unmount()
})

test("연결되지 않은 상태로 활성화하면 요청이 없고, 최초 connect에서 정확히 1회 요청한다", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = false
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 0)

  act(() => {
    fake.socket.connected = true
    fake.socket.triggerConnect()
  })

  assert.equal(fake.emitWithAckCalls.length, 1)
  assert.deepEqual(fake.emitWithAckCalls[0].payload, { gameId: "g1" })

  hook.unmount()
})

test("의존성이 바뀌지 않은 리렌더는 리스너를 추가하거나 요청을 중복시키지 않는다", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.onCalls.length, 1)
  assert.equal(fake.emitWithAckCalls.length, 1)

  hook.rerender()
  hook.rerender()
  hook.rerender()

  assert.equal(fake.onCalls.length, 1)
  assert.equal(fake.offCalls.length, 0)
  assert.equal(fake.emitWithAckCalls.length, 1)

  hook.unmount()
})

test("StrictMode의 setup→cleanup→setup 재실행 후에도 살아있는 connect 리스너는 하나뿐이고 요청도 1회다", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync(), {
    wrapper: ({ children }) => React.createElement(React.StrictMode, null, children),
  })

  assert.equal(fake.connectHandlers.size, 1, "StrictMode 이중 setup 이후에도 살아있는 connect 리스너는 하나여야 한다")
  assert.equal(fake.emitWithAckCalls.length, 1, "StrictMode 이중 setup이 요청을 중복시키면 안 된다")

  hook.unmount()
})

test("이후 각 실제 connect epoch마다 정확히 1회씩 요청한다(재연결마다 새 요청)", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 1)

  act(() => fake.socket.triggerConnect())
  assert.equal(fake.emitWithAckCalls.length, 2)
  assert.deepEqual(fake.emitWithAckCalls[1].payload, { gameId: "g1" })

  act(() => fake.socket.triggerConnect())
  assert.equal(fake.emitWithAckCalls.length, 3)

  hook.unmount()
})

test("manager 수준의 reconnect 리스너는 등록되지 않으며, connect 1회당 요청도 1회뿐이다", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  act(() => fake.socket.triggerConnect())

  assert.ok(
    fake.onCalls.every((c) => c.event === "connect"),
    "이 훅은 connect 외의 이벤트(예: 'reconnect')를 구독하면 안 된다",
  )
  assert.equal(fake.emitWithAckCalls.length, 2, "connect 1회당 요청은 정확히 1회여야 한다(이중 트리거 없음)")

  hook.unmount()
})

test("정상 ack(ok:true)는 기대한 gameId/self.uuid로 정확히 1회 store를 원자적으로 복원한다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1", nickname: "Alice" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const stateBefore = useInGameStore.getState().state
  const hook = renderHook(() => useInGameSessionSnapshotSync())

  const response = buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1", nickname: "Alice", dayIndex: 1 })
  await act(async () => {
    fake.emitWithAckCalls[0].resolve(response)
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 1)
  assert.equal(applyCalls[0].gameId, "g1")
  assert.equal(applyCalls[0].self.uuid, "player-1")
  assert.notEqual(useInGameStore.getState().state, stateBefore, "복원이 실제로 store를 새 state로 교체해야 한다")
  assert.equal(useInGameStore.getState().state.dayIndex, 1)

  hook.unmount()
})

test("형태가 잘못된 ack는 store를 참조 수준에서 전혀 바꾸지 않는다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const before = useInGameStore.getState()
  const hook = renderHook(() => useInGameSessionSnapshotSync())

  await act(async () => {
    fake.emitWithAckCalls[0].resolve(null)
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 1, "형태와 무관하게 non-stale 응답이면 3A 위임 호출은 일어난다")
  assert.equal(useInGameStore.getState(), before, "malformed 응답은 3A의 no-op 경로를 그대로 통과해 store 참조가 바뀌지 않아야 한다")

  hook.unmount()
})

test("ok:false ack도 store를 참조 수준에서 전혀 바꾸지 않는다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const before = useInGameStore.getState()
  const hook = renderHook(() => useInGameSessionSnapshotSync())

  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: false, message: "NOT_A_MEMBER" })
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 1)
  assert.equal(useInGameStore.getState(), before)

  hook.unmount()
})

test("타임아웃/오류로 요청이 실패해도 이후 재연결은 정상적으로 다시 요청하고 성공할 수 있다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())

  await act(async () => {
    fake.emitWithAckCalls[0].reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0)

  act(() => fake.socket.triggerConnect())
  assert.equal(fake.emitWithAckCalls.length, 2)

  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1)

  hook.unmount()
})

test("이전 요청이 응답하지 않아도(영구 미응답) 재연결 시 새 요청이 막히지 않는다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 1)
  // 요청 1(v1)은 절대 resolve/reject하지 않는다.

  act(() => fake.socket.triggerConnect())
  assert.equal(fake.emitWithAckCalls.length, 2, "미응답 요청이 있어도 재연결은 새 요청(v2)을 막지 않아야 한다")

  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1, "요청 2의 응답만 반영되어야 한다")

  hook.unmount()
})

test("새 요청(v2) 이후 도착한 이전 요청(v1)의 늦은 응답은 store에 반영되지 않는다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pendingV1 = fake.emitWithAckCalls[0]

  act(() => fake.socket.triggerConnect())
  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1, "v2 응답까지는 정확히 1회 반영되어야 한다")

  await act(async () => {
    pendingV1.resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1, "v1의 늦은 응답은 세대가 지났으므로 반영 횟수를 늘리면 안 된다")

  hook.unmount()
})

test("unmount 이후 도착한 응답은 store에 반영되지 않는다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pending = fake.emitWithAckCalls[0]

  hook.unmount()

  await act(async () => {
    pending.resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 0)
})

test("요청 이후 gameId가 바뀌면, 그 사이 도착한 이전 gameId용 응답은 반영되지 않고 새 gameId로 새 요청이 나간다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pendingForG1 = fake.emitWithAckCalls[0]
  const handlerForG1 = [...fake.connectHandlers][0]

  await act(async () => {
    seedStore({ gameId: "g2", playerUuid: "player-9" })
  })

  assert.equal(fake.offCalls.filter((c) => c.event === "connect" && c.handler === handlerForG1).length, 1, "gameId 변경으로 이전 connect 핸들러가 정확한 참조로 제거되어야 한다")
  assert.equal(fake.emitWithAckCalls.length, 2, "새 gameId epoch에 대해 새 요청이 나가야 한다")
  assert.deepEqual(fake.emitWithAckCalls[1].payload, { gameId: "g2" })

  await act(async () => {
    pendingForG1.resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0, "이전 gameId(g1)를 향했던 늦은 응답은 반영되면 안 된다")

  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g2", playerUuid: "player-9" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1)
  assert.equal(applyCalls[0].gameId, "g2")

  hook.unmount()
})

test("요청 이후 인증 계정(uuid)이 socket・store 교체보다 먼저 바뀌면, 그 시점에 도착한 이전 응답은 epoch 무효화 없이도 독립적으로 거부된다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pending = fake.emitWithAckCalls[0]

  const authState = useAuthStore.getState()
  const originalUuid = authState.user.uuid
  // setState를 거치지 않고 기존 user 객체를 직접 mutate한다 — 구독자에게 알리지 않으므로 이
  // 훅은 리렌더되지 않고 여전히 이전 epoch("user-a" 요청)를 들고 있다. 프로덕션에서 로그인/
  // 로그아웃이 socket 교체·store 초기화보다 먼저 동기적으로 반영되는 순간을 재현한다.
  authState.user.uuid = "user-b"

  await act(async () => {
    pending.resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0, "리렌더/epoch 무효화가 전혀 없었는데도 인증 계정 불일치만으로 거부되어야 한다")

  // 이제 실제 setState로 구독자에게 알려 리렌더를 유도한다.
  await act(async () => {
    useAuthStore.setState({ ...useAuthStore.getState(), user: { ...authState.user } })
    await flushMicrotasks()
  })

  assert.equal(fake.emitWithAckCalls.length, 2, "새 인증 계정 epoch에 대해 새 요청이 나가야 한다")
  assert.deepEqual(fake.emitWithAckCalls[1].payload, { gameId: "g1" })

  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1, "새 인증 계정으로의 요청은 정상 반영되어야 한다")

  useAuthStore.setState({ ...useAuthStore.getState(), user: { ...authState.user, uuid: originalUuid } })
  hook.unmount()
})

test("socket 인스턴스가 리렌더 전에 교체되면, epoch가 그대로여도 이전 socket에서 온 응답은 반영되지 않는다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fakeA = createFakeSessionSnapshotSocket()
  fakeA.socket.connected = true
  setFakeSocket(fakeA.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pendingFromA = fakeA.emitWithAckCalls[0]

  const fakeB = createFakeSessionSnapshotSocket()
  fakeB.socket.connected = true
  // 구독자에게 알리지 않고 getSocket()의 반환값만 B로 바꾼다 — setSocket(B)가 모듈 싱글턴을
  // 교체한 직후, 아직 이 훅의 effect가 재실행되지 않은 순간을 재현한다.
  setFakeSocketWithoutNotify(fakeB.socket)

  await act(async () => {
    pendingFromA.resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 0, "이미 교체된 socket에서 온 응답은 epoch 검사만으로는 걸러지지 않으므로 socket 참조 비교가 독립적으로 막아야 한다")

  hook.unmount()
})

test("cleanup은 이 훅이 등록한 connect 핸들러만 정확한 참조로 제거하고, 다른 이벤트 리스너는 그대로 둔다", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  // 다른 기능(예: 채팅/게임 이벤트)이 이미 같은 socket에 등록해둔, 이 슬라이스와 무관한
  // 리스너들을 시뮬레이션한다.
  const unrelatedChatHandler = () => {}
  const unrelatedGameHandler = () => {}
  fake.socket.on("joker_chat_message", unrelatedChatHandler)
  fake.socket.on("game_ended", unrelatedGameHandler)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const ownHandler = [...fake.connectHandlers][0]
  assert.ok(ownHandler)

  hook.unmount()

  assert.deepEqual(
    fake.offCalls.map((c) => ({ event: c.event, handler: c.handler })),
    [{ event: "connect", handler: ownHandler }],
    "cleanup은 이 훅이 등록한 connect 핸들러 하나만 정확한 참조로 off해야 한다",
  )
  assert.equal(fake.connectHandlers.size, 0)
})
