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

const { renderHook, cleanup } = await import("@testing-library/react")

// 이 파일의 시험들은 각자 마지막에 unmount한다. 다만 단언이 먼저 실패하면 그 줄에 닿지 못해
// 훅이 마운트된 채로 남고, 그 훅은 이후 시험의 setFakeSocket에 반응해 **남의 소켓으로** 요청을
// 보낸다 — 실패 하나가 뒤따르는 시험들의 요청 수를 전부 오염시킨다. 실패를 그 시험 안에 가둔다.
test.afterEach(() => cleanup())

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

const { useInGameStore, readInGameReceiptScope } = await import("../../store/ingameStore.js")
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
    players: [{ uuid: playerUuid, nickname, isAlive: true, isConnected: true, themeIndex: 0 }],
    self: { uuid: playerUuid, nickname, role, team, hasActedThisPhase: false },
  }
}

function seedAuth(uuid) {
  useAuthStore.setState({ user: { uuid }, isLoggedIn: true, loggedOutIntentionally: false })
}

/**
 * F-23(SPLIT-1): 같은 판·같은 계정에서 **내 소속만** 바꾼다(이탈→재입장과 같은 전이다).
 * 실제 store 액션 경로(setState)로 바꿔 store가 소유한 전이 관측을 그대로 통과시킨다 —
 * 값을 몰래 mutate하면 그 전이 자체가 일어나지 않은 것이 되어 시험이 무력해진다.
 */
function setMyMembership(membershipId) {
  useInGameStore.setState((s) => ({
    state: { ...s.state, players: s.state.players.map((p) => ({ ...p, membershipId })) },
  }))
}

const readMyMembership = () =>
  useInGameStore.getState().state?.players?.[0]?.membershipId ?? null

/** 공개 결과 하나가 실린 정상 응답(수신 증거가 실제로 만들어지는지 보기 위한 fixture). */
function buildSnapshotResponseWithNightResult({ gameId, playerUuid = "player-1", dayIndex = 1 }) {
  return {
    ...buildValidSnapshotResponse({ gameId, playerUuid, phase: "DAY", dayIndex }),
    dayPhase: "DAY_DISCUSSION",
    nightResult: {
      dayIndex, victimUuid: playerUuid,
      deathReveals: [{ victimUuid: playerUuid, source: "JOKER" }],
    },
  }
}

// applySessionSnapshot 호출을 실제 구현을 그대로 위임하며 세면서, 이후 캡처하는 wrapper가
// 이전 wrapper를 감싸는 형태로 쌓여도(파일 안 여러 테스트가 각자 wrapApplySessionSnapshot을
// 부르므로) 실제 병합 로직은 항상 정확히 한 번만 실행된다 — 각 테스트는 자기 자신의 calls
// 배열만 관찰한다.
//
// F-23(SPLIT-1): wrapper는 호출부가 넘긴 **수신 문맥까지** 원래 액션에 그대로 전달해야 한다.
// 그러지 않으면 wrapper를 끼운 시험에서만 store가 문맥 없이 적용하게 되어, 실제 화면과 다른
// 경로를 검사하게 된다(공개 결과의 수신 증거가 시험에서만 사라진다).
function wrapApplySessionSnapshot() {
  const calls = []
  const original = useInGameStore.getState().applySessionSnapshot
  useInGameStore.setState({
    applySessionSnapshot: (response, receiptContext) => {
      calls.push(response)
      return original(response, receiptContext)
    },
  })
  return calls
}

/** 그 시험이 관찰할 수 있는 "바뀌면 안 되는 것" 전부를 한 번에 찍어 둔다. */
function snapshotStoreFacts() {
  const { state, snapshotSeq, snapshotResultOwner, gameId } = useInGameStore.getState()
  return { state, snapshotSeq, snapshotResultOwner, gameId }
}

function assertStoreFactsUnchanged(before, message) {
  const after = snapshotStoreFacts()
  assert.equal(after.state, before.state, `${message}: state 참조가 바뀌었다`)
  assert.equal(after.snapshotSeq, before.snapshotSeq, `${message}: snapshotSeq가 올랐다`)
  assert.equal(after.snapshotResultOwner, before.snapshotResultOwner, `${message}: 수신 증거가 바뀌었다`)
  assert.equal(after.gameId, before.gameId, `${message}: gameId가 바뀌었다`)
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

// ── F-23(AC-05/AC-06): 기존 네 축이 전부 같은 채로 지나가는 세 전이 ──────────────
//
// 아래 세 경우는 gameId·계정 uuid·socket **객체**가 모두 그대로다. 각 축을 하나씩만 움직여,
// 옛 응답이 거부되면서도 현재 신원의 요청은 영구히 막히지 않는지 함께 본다.

test("F-23: 계정 A→B→A를 지나온 옛 응답은 거부되고, 현재 신원의 새 요청은 정상 반영된다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pendingFromA = fake.emitWithAckCalls[0]

  // 같은 배치 안에서 A→B→A. 계정 **값**은 원래대로 돌아오지만 전이 세대는 두 번 올랐다.
  await act(async () => {
    useAuthStore.setState((s) => ({
      user: { uuid: "user-b" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    useAuthStore.setState((s) => ({
      user: { uuid: "user-a" }, isLoggedIn: true, identityGeneration: s.identityGeneration + 1,
    }))
    await flushMicrotasks()
  })

  assert.equal(useAuthStore.getState().user.uuid, "user-a", "전제: 계정 값은 원래대로 돌아왔다")
  assert.equal(
    fake.emitWithAckCalls.length, 2,
    "전이 세대가 바뀌었는데 새 요청이 나가지 않으면 화면이 영영 확인 중에 갇힌다",
  )

  await act(async () => {
    pendingFromA.resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0, "A→B→A를 지나온 옛 응답이 현재 화면에 반영됐다")

  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1, "현재 신원의 새 요청까지 영구히 막혔다")

  hook.unmount()
})

test("F-23: 같은 판에서 내 소속만 교체되면(이탈→재입장) 그 사이 도착한 옛 응답은 반영되지 않는다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  // 요청을 보내는 시점의 내 소속.
  useInGameStore.getState().state.players[0].membershipId = "mem-1"

  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pending = fake.emitWithAckCalls[0]

  // 구독자에게 알리지 않고 소속만 바꾼다 — 리렌더도 epoch 무효화도 없는 순간을 재현한다.
  useInGameStore.getState().state.players[0].membershipId = "mem-2"

  await act(async () => {
    pending.resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })

  assert.equal(
    applyCalls.length, 0,
    "gameId·계정·소켓이 모두 그대로라 소속 비교가 없으면 옛 응답이 그대로 내려앉는다",
  )

  hook.unmount()
})

test("F-23: 같은 Socket 객체가 재연결되어 id만 바뀌면 그 이전 요청의 응답은 반영되지 않는다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pending = fake.emitWithAckCalls[0]

  // 객체 동일성은 그대로 유지되고 id만 바뀐다(실제 Socket.IO 재연결의 모습).
  fake.socket.id = "sock-2"

  await act(async () => {
    pending.resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 0, "socket 객체 비교만으로는 같은 객체의 재연결을 구별하지 못한다")

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

test("빈 인게임 store로 새로고침하면 gameId 없는 스냅샷을 요청해 현재 게임을 복원한다", async () => {
  useInGameStore.setState({ gameId: null, state: null, error: null })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(hook.result.current, "checking")
  assert.equal(fake.emitWithAckCalls.length, 1)
  assert.deepEqual(fake.emitWithAckCalls[0].payload, {})

  await act(async () => {
    fake.emitWithAckCalls[0].resolve(buildValidSnapshotResponse({
      gameId: "g-recovered",
      phase: "ROLE_REVEAL",
    }))
    await flushMicrotasks()
  })

  assert.equal(useInGameStore.getState().gameId, "g-recovered")
  assert.equal(useInGameStore.getState().state.phase, "ROLE_REVEAL")
  assert.equal(hook.result.current, "recovered")
  hook.unmount()
})

test("빈 인게임 store에 활성 게임이 없다는 응답이 오면 missing으로 확정한다", async () => {
  useInGameStore.setState({ gameId: null, state: null, error: null })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: false, code: "SESSION_NOT_FOUND" })
    await flushMicrotasks()
  })

  assert.equal(useInGameStore.getState().gameId, null)
  assert.equal(hook.result.current, "missing")
  hook.unmount()
})

// ── F-23(SPLIT-1): 값이 원래대로 돌아오는 전이와 요청 재개 ────────────────────
//
// 아래 시험들이 함께 고정하는 것은 두 가지다. 옛 응답은 **아무것도** 바꾸지 못하고(state 참조·
// snapshotSeq·수신 증거·bootstrapStatus), 그러면서도 현재 신원의 요청은 반드시 재개된다.
// 앞의 것만 지키면 화면이 영영 확인 중에 갇히고, 뒤의 것만 지키면 옛 사실이 내려앉는다.

test("F-23(SPLIT-1): 소속 A→B→A 왕복을 지나온 옛 응답은 아무것도 바꾸지 못하고, 현재 신원의 요청은 재개된다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  setMyMembership("mem-a")

  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pendingFromA = fake.emitWithAckCalls[0]
  assert.ok(pendingFromA, "전제: 첫 요청이 나가야 한다")

  // 같은 act 배치 안에서 A→B→A. 값은 원래대로 돌아오지만 전이는 두 번 일어났다.
  await act(async () => {
    setMyMembership("mem-b")
    setMyMembership("mem-a")
    await flushMicrotasks()
  })

  assert.equal(readMyMembership(), "mem-a", "전제: 소속 값은 원래대로 돌아왔다")
  assert.equal(
    fake.emitWithAckCalls.length, 2,
    "소속 전이 뒤 현재 신원의 요청이 재개되지 않으면 화면이 영영 확인 중에 갇힌다",
  )

  const before = snapshotStoreFacts()
  await act(async () => {
    pendingFromA.resolve(buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 3 }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0, "왕복을 지나온 옛 응답이 반영됐다")
  assertStoreFactsUnchanged(before, "A→B→A를 지나온 옛 응답")

  // 현재 신원의 요청은 정상 반영되고, 그 결과에는 이 신원의 수신 증거가 붙는다.
  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 4 }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1, "현재 신원의 요청까지 막혔다")
  assert.equal(useInGameStore.getState().state.dayIndex, 4)
  const owner = useInGameStore.getState().snapshotResultOwner
  assert.ok(owner, "검증된 공개 결과에 수신 증거가 붙지 않았다")
  assert.equal(owner.accountId, "player-1")
  assert.equal(owner.gameId, "g1")
  assert.equal(owner.snapshotSeq, useInGameStore.getState().snapshotSeq)

  hook.unmount()
})

test("F-23(SPLIT-1): 연결이 끊긴 뒤 도착한 응답은 반영되지 않고, 다시 연결되면 현재 요청이 재개된다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pending = fake.emitWithAckCalls[0]

  // 끊김: 객체도 id도 그대로일 수 있지만 이 연결은 이미 죽었다.
  fake.socket.connected = false
  const before = snapshotStoreFacts()
  await act(async () => {
    pending.resolve(buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 2 }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0, "끊긴 연결에서 온 응답이 반영됐다")
  assertStoreFactsUnchanged(before, "끊긴 연결의 응답")

  // 실제 재연결: 새 id가 발급되고 그 연결에서 다시 요청한다.
  act(() => {
    fake.socket.connected = true
    fake.socket.id = "sock-2"
    fake.socket.triggerConnect()
  })
  assert.equal(fake.emitWithAckCalls.length, 2, "재연결에서 현재 요청이 재개되지 않았다")

  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 2 }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 1, "재연결 뒤의 정상 응답까지 막혔다")
  assert.equal(useInGameStore.getState().snapshotResultOwner.socketId, "sock-2",
    "수신 증거가 응답을 실제로 받은 연결을 가리키지 않는다")

  hook.unmount()
})

test("F-23(SPLIT-1): 전송 자체가 동기 예외로 실패해도 같은 세대 검사를 거쳐 유한 상태로 끝맺는다", () => {
  useInGameStore.setState({ gameId: null, state: null, error: null })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.emitWithAck = () => { throw new Error("transport closed") }
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())

  assert.equal(hook.result.current, "failed", "동기 전송 예외가 확인 중으로 남았다")
  assert.equal(useInGameStore.getState().gameId, null)

  hook.unmount()
})

test("F-23(SPLIT-1): 형태 오류·실패 응답은 state·snapshotSeq·수신 증거를 모두 참조 보존한다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const before = snapshotStoreFacts()

  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: true, gameId: "g1", phase: "NOT_A_PHASE" })
    await flushMicrotasks()
  })
  assertStoreFactsUnchanged(before, "형태가 잘못된 응답")

  act(() => fake.socket.triggerConnect())
  await act(async () => {
    fake.emitWithAckCalls[1].resolve({ ok: false, code: "INTERNAL_ERROR" })
    await flushMicrotasks()
  })
  assertStoreFactsUnchanged(before, "ok:false 응답")

  hook.unmount()
})

test("F-23(SPLIT-1): 빈 store bootstrap은 요청 계정과 다른 본인을 주장하는 응답을 반영하지 않는다", async () => {
  useInGameStore.setState({ gameId: null, state: null, error: null })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  await act(async () => {
    // 서버가 돌려준 self가 이 요청을 보낸 계정이 아니다 — 남의 세션을 내 화면으로 복원하지 않는다.
    fake.emitWithAckCalls[0].resolve(buildValidSnapshotResponse({
      gameId: "g-other", playerUuid: "player-9", phase: "ROLE_REVEAL",
    }))
    await flushMicrotasks()
  })

  assert.equal(useInGameStore.getState().gameId, null, "남의 본인을 주장하는 응답으로 복원됐다")
  assert.equal(hook.result.current, "missing")
  hook.unmount()
})

test("F-23(SPLIT-1): 이미 소속을 가진 요청의 응답은 bootstrap 권위로 승격되지 않는다", () => {
  useInGameStore.setState({
    gameId: null, state: null, error: null, snapshotSeq: 0, snapshotResultOwner: null,
  })
  // 빈 store에서 만든 정상 문맥에 "그 사이 이미 소속이 붙었다"는 사실만 얹는다.
  const receipt = {
    ...readInGameReceiptScope({ accountId: "player-1", identityGeneration: null }),
    membershipId: "mem-already-seated",
  }
  const before = snapshotStoreFacts()

  useInGameStore.getState().bootstrapSessionSnapshot(
    buildValidSnapshotResponse({ gameId: "g-b", playerUuid: "player-1", phase: "ROLE_REVEAL" }),
    receipt,
  )

  assertStoreFactsUnchanged(before, "이미 소속을 가진 요청의 bootstrap 응답")
})
