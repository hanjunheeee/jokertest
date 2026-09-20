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
const {
  useInGameSessionSnapshotSync,
  getInGameSnapshotRebindPending,
  subscribeInGameSnapshotRebindPending,
} = await import("../useInGameSessionSnapshotSync.js")

function createFakeSessionSnapshotSocket() {
  const onCalls = []
  const offCalls = []
  const connectHandlers = new Set()
  const emitWithAckCalls = []
  // F-26(AC-01): 복원된 성공 사건의 완료(completeNightSuccess)는 ack 요청이 아니라 평범한
  // emit으로 나간다. 이 자리가 없으면 "복원 항목을 그 화면이 실제로 완료할 수 있는가"를
  // 검사할 수 없다(전송 실패로만 끝난다).
  const emitCalls = []

  const socket = {
    connected: false,
    emit(event, payload, callback) {
      emitCalls.push({ event, payload, callback })
    },
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

  return { socket, onCalls, offCalls, connectHandlers, emitWithAckCalls, emitCalls }
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

/**
 * F-26(AC-04): connect 사건을 흘려보내고 **그 사건이 예약한 microtask까지** 실행한다.
 *
 * 훅은 connect에서 요청 세대만 즉시 올리고, 요청 범위 캡처·전송은 microtask로 미룬다 — 같은
 * connect를 구독하는 useGameSessionSocketEvents가 noteInGameConnectionRebound로 연결 세대를
 * 올리기 때문이다(등록 순서에 따라 옛 세대로 요청이 나가는 것을 막는 유일한 방법이다). 그래서
 * "connect 뒤에 요청이 나갔는가"를 보는 시험은 그 microtask 경계를 함께 지나야 한다.
 *
 * @param {Function} [mutate] connect 직전에 소켓 상태를 바꾸는 작업(id 재발급·connected 등).
 */
async function emitConnect(fake, mutate = null) {
  await act(async () => {
    if (mutate) mutate()
    fake.socket.triggerConnect()
  })
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

test("연결되지 않은 상태로 활성화하면 요청이 없고, 최초 connect에서 정확히 1회 요청한다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = false
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 0)

  await emitConnect(fake, () => { fake.socket.connected = true })

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

test("이후 각 실제 connect epoch마다 정확히 1회씩 요청한다(재연결마다 새 요청)", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 1)

  await emitConnect(fake)
  assert.equal(fake.emitWithAckCalls.length, 2)
  assert.deepEqual(fake.emitWithAckCalls[1].payload, { gameId: "g1" })

  await emitConnect(fake)
  assert.equal(fake.emitWithAckCalls.length, 3)

  hook.unmount()
})

test("manager 수준의 reconnect 리스너는 등록되지 않으며, connect 1회당 요청도 1회뿐이다", async () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  await emitConnect(fake)

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

  await emitConnect(fake)
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

  await emitConnect(fake)
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

  await emitConnect(fake)
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
  await emitConnect(fake, () => {
    fake.socket.connected = true
    fake.socket.id = "sock-2"
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

  await emitConnect(fake)
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

/**
 * F-23(AC-05): **다른 소속을 주장하는 응답은 복원 권위가 아니다.**
 *
 * 스냅샷 응답은 roster의 membershipId로 자기가 어느 자리의 사실인지를 말한다. 지금 화면이
 * 이미 소속을 알고 있는데 응답이 그와 다른 소속을 주장하면, 같은 판·같은 계정이라도 이
 * 화면이 앉아 있는 자리의 사실이 아니다(이탈→재입장으로 생긴 다른 참여 기록이다). 그대로
 * 반영하면 관측 기준이 남의 소속으로 채택되고 공개 결과의 수신 증거까지 거기 붙는다.
 *
 * "모른다"는 "다르다"가 아니다 — membershipId를 싣지 않는 응답은 이 검사에 걸리지 않는다
 * (기존 호환 계약). 아래 양성 대조가 그 경계를 함께 고정한다.
 */
test("F-23(AC-05): 기존 non-null 소속과 다른 소속을 주장하는 응답은 복원 권위로 승격되지 않는다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  setMyMembership("mem-a")

  const receipt = readInGameReceiptScope({
    accountId: "player-1",
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })
  const before = snapshotStoreFacts()

  const foreign = buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 3 })
  foreign.players = foreign.players.map((p) => ({ ...p, membershipId: "mem-b" }))
  useInGameStore.getState().applySessionSnapshot(foreign, receipt)

  assertStoreFactsUnchanged(before, "다른 소속을 주장하는 응답")
  assert.equal(readMyMembership(), "mem-a", "다른 소속을 주장하는 응답이 현재 소속을 덮었다")

  // 양성 대조 1: 같은 소속을 주장하는 응답은 그대로 반영되고 그 신원의 수신 증거가 붙는다.
  const mine = buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 4 })
  mine.players = mine.players.map((p) => ({ ...p, membershipId: "mem-a" }))
  useInGameStore.getState().applySessionSnapshot(mine, receipt)

  assert.equal(useInGameStore.getState().state.dayIndex, 4, "같은 소속의 정상 응답까지 막혔다")
  assert.equal(useInGameStore.getState().snapshotSeq, before.snapshotSeq + 1)
  const owner = useInGameStore.getState().snapshotResultOwner
  assert.ok(owner, "검증된 공개 결과에 수신 증거가 붙지 않았다")
  assert.equal(owner.membershipId, "mem-a")
})

test("F-23(AC-05): 소속을 싣지 않은(모른다고 말하는) 응답은 이 검사에 걸리지 않는다", () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  setMyMembership("mem-a")

  const receipt = readInGameReceiptScope({
    accountId: "player-1",
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })
  const seqBefore = useInGameStore.getState().snapshotSeq

  // players[].membershipId 자체가 없는 응답이다(구버전 스냅샷).
  useInGameStore.getState().applySessionSnapshot(
    buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 5 }), receipt,
  )

  assert.equal(useInGameStore.getState().state.dayIndex, 5, "값을 주장하지 않는 응답까지 막혔다")
  assert.equal(useInGameStore.getState().snapshotSeq, seqBefore + 1)
})

/**
 * F-23(SPLIT-1): 재결속 보류는 **열리고 반드시 닫힌다.**
 *
 * 열리지 않으면 신원 전이로 연출 큐가 버려지는 순간 잔존 ENDED로 결과 화면에 들어가고,
 * 닫히지 않으면 화면이 영영 인게임에 갇힌다. 두 사실을 한 시험에서 함께 고정한다.
 */
test("F-23(SPLIT-1): 실제 재연결은 재결속 보류를 열고, 응답이 실패여도 반드시 닫는다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(
    getInGameSnapshotRebindPending(), false,
    "마운트 자체는 전이가 아니다 — 그것만으로 결과 이동이 막히면 안 된다",
  )

  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  assert.equal(fake.emitWithAckCalls.length, 2, "전제: 재연결이 현재 신원의 스냅샷을 다시 물어야 한다")
  assert.equal(getInGameSnapshotRebindPending(), true, "재연결 구간에 재결속 보류가 열리지 않았다")

  await act(async () => {
    fake.emitWithAckCalls[1].reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })
  assert.equal(getInGameSnapshotRebindPending(), false, "응답이 끝났는데 보류가 남아 화면이 갇힌다")

  // 정상 응답으로 끝나는 경우도 같다.
  await emitConnect(fake, () => { fake.socket.id = "sock-3" })
  assert.equal(getInGameSnapshotRebindPending(), true)
  await act(async () => {
    fake.emitWithAckCalls[2].resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(getInGameSnapshotRebindPending(), false)

  // 보류 중에 화면이 사라져도 그 보류를 다음 화면으로 넘기지 않는다.
  await emitConnect(fake, () => { fake.socket.id = "sock-4" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 아직 응답을 기다리는 중이어야 한다")
  hook.unmount()
  assert.equal(getInGameSnapshotRebindPending(), false, "언마운트가 보류를 다음 화면으로 넘겼다")
})

/** 결과 화면으로 넘어가는 근거(useInGameResultNavigation이 보는 두 값)를 그대로 읽는다. */
function hasResultNavigationBasis() {
  const { state } = useInGameStore.getState()
  return state?.phase === "ENDED" && Boolean(state?.winResult)
}

/** 종료가 확정된 판을 들고 있는 화면을 만든다(재결속 전에 이미 갖고 있던 옛 사실). */
function seedEndedStore({ gameId = "g1", playerUuid = "player-1", dayIndex = 1 } = {}) {
  seedStore({ gameId, playerUuid, phase: "ENDED", dayIndex })
  useInGameStore.setState((s) => ({ state: { ...s.state, winResult: { winner: "CITIZEN" } } }))
  assert.equal(hasResultNavigationBasis(), true, "전제: 잔존 ENDED가 이동 근거를 갖고 있어야 한다")
}

function endedSnapshotResponse({ gameId = "g1", playerUuid = "player-1", dayIndex = 1 } = {}) {
  return {
    ...buildValidSnapshotResponse({ gameId, playerUuid, phase: "ENDED", dayIndex }),
    winResult: { winner: "CITIZEN" },
  }
}

/**
 * F-23(SPLIT-1): **현재 연결에서 정상 공개 종료를 받는다** — 실제 수신 경로와 같은 인자로.
 *
 * 프로덕션에서 이 호출을 만드는 것은 useGameSessionSocketEvents의 handleNightResultApplied이고,
 * 그때 두 번째 인자로 그 순간의 수신 범위(계정 축 + store·연결 축)가 함께 들어간다. 시험이 그
 * 인자를 빼고 부르면 store는 "누가 받았는지 모르는" 종료 결과로 적어 두게 되어, 이 파일이
 * 검사하려는 "어느 범위에서 받았는가"가 시험에서만 사라진다.
 */
function deliverTerminalNightResult({ gameId, accountId, playerUuid = "player-1", dayIndex = 1 }) {
  const receipt = readInGameReceiptScope({
    accountId,
    identityGeneration: useAuthStore.getState().identityGeneration ?? null,
  })
  useInGameStore.getState().applyNightResultAppliedPayload({
    gameId,
    phase: "ENDED",
    dayIndex,
    players: [{ uuid: playerUuid, isAlive: true }],
    victimUuid: null,
    winResult: { winner: "CITIZEN" },
  }, receipt)
}

/**
 * F-23(SPLIT-1): **실패는 성공이 아니다.**
 *
 * 재결속 구간에서 현재 신원의 스냅샷을 끝내 받지 못했는데 보류만 풀면, 화면은 이전 신원·
 * 이전 연결이 받아 둔 잔존 ENDED·winResult를 그대로 이동 근거로 삼는다(InGamePage →
 * useInGameResultNavigation) — 이 보류가 막으려던 바로 그 결함이 실패 경로로 되살아난다.
 *
 * 그래서 "보류가 풀렸다"와 "이동 근거가 남아 있다"가 **동시에** 성립하면 안 된다. 어느 쪽으로
 * 구현하든(보류 유지 또는 잔존 상태 무효화) 이 한 줄이 결함을 잡는다. 동시에 영구히 갇혀서도
 * 안 되므로, 다음 연결의 정상 스냅샷에서 이동 근거가 복원되는 것까지 같은 시험에 고정한다.
 */
test("F-23(SPLIT-1): 재결속 스냅샷이 거부되면 잔존 ENDED의 결과 이동 근거가 남지 않는다", async () => {
  seedEndedStore()
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())

  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재연결이 재결속 보류를 열어야 한다")
  assert.equal(fake.emitWithAckCalls.length, 2, "전제: 그 연결이 현재 신원의 스냅샷을 물어야 한다")

  await act(async () => {
    fake.emitWithAckCalls[1].reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })

  assert.equal(
    getInGameSnapshotRebindPending() === false && hasResultNavigationBasis(),
    false,
    "재결속 스냅샷이 실패했는데 보류가 풀린 채 잔존 ENDED의 이동 근거가 그대로 남았다",
  )
  assert.equal(getInGameSnapshotRebindPending(), false, "보류가 남아 화면이 영영 갇힌다")
  assert.equal(
    useInGameStore.getState().state.phase, "ENDED",
    "종료 잠금 자체는 서버가 확정한 사실이다 — 실패했다고 되돌리지 않는다",
  )

  // 영구 무효가 아니다: 다음 연결의 정상 스냅샷이 종료 결과를 다시 실으면 이동이 재개된다.
  await emitConnect(fake, () => { fake.socket.id = "sock-3" })
  await act(async () => {
    fake.emitWithAckCalls[2].resolve(endedSnapshotResponse())
    await flushMicrotasks()
  })

  assert.equal(getInGameSnapshotRebindPending(), false)
  assert.equal(hasResultNavigationBasis(), true, "정상 스냅샷 뒤에도 결과 이동이 막혀 있다")

  hook.unmount()
})

test("F-23(SPLIT-1): 재결속 스냅샷이 실패 응답(ok:false)으로 끝나도 같다", async () => {
  seedEndedStore()
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())

  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재결속 보류가 열려야 한다")

  const seqBefore = useInGameStore.getState().snapshotSeq
  await act(async () => {
    fake.emitWithAckCalls[1].resolve({ ok: false, code: "INTERNAL_ERROR" })
    await flushMicrotasks()
  })

  assert.equal(
    getInGameSnapshotRebindPending() === false && hasResultNavigationBasis(),
    false,
    "거부된 응답으로 재결속을 끝맺어 잔존 ENDED의 이동 근거가 남았다",
  )
  assert.equal(getInGameSnapshotRebindPending(), false, "보류가 남아 화면이 영영 갇힌다")
  assert.equal(
    useInGameStore.getState().snapshotSeq, seqBefore,
    "전제: 거부된 응답은 적용되지 않는다(적용됐다면 이 시험이 검사하는 실패 경로가 아니다)",
  )

  hook.unmount()
})

/**
 * 반대 방향의 방어다. 재결속을 짊어지지 않은 평범한 첫 동기화가 실패했다고 해서, 방금 받은
 * 정상 종료 결과를 지우면 안 된다 — 그 state는 이전 신원의 잔존물이 아니라 지금 신원의 사실이다.
 */
test("F-23(SPLIT-1): 재결속이 아닌 평범한 동기화 실패는 현재 신원의 종료 결과를 지우지 않는다", async () => {
  seedEndedStore()
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 1, "전제: 마운트가 한 번 물어야 한다")
  assert.equal(getInGameSnapshotRebindPending(), false, "전제: 마운트 자체는 전이가 아니다")

  await act(async () => {
    fake.emitWithAckCalls[0].reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })

  assert.equal(hasResultNavigationBasis(), true, "재결속과 무관한 조회 실패가 현재 종료 결과를 지웠다")

  hook.unmount()
})

/**
 * F-23(SPLIT-1): **같은 실패인데 결말이 갈린다 — 그 결과를 어디서 받았는가.**
 *
 * 재결속 스냅샷이 실패했을 때 걷어내야 하는 것은 "이전 신원·이전 연결이 받아 둔 잔존
 * 종료 상태"뿐이다. 그런데 재결속 구간은 시간이 걸리고, 그 사이에 **현재 연결**이 정상 공개
 * 종료(night_result_applied)를 직접 받아 둘 수 있다 — 그 결과는 확인하지 못한 잔존물이
 * 아니라 지금 이 화면의 사실이므로, 뒤이은 스냅샷 실패로 지워지면 결과 화면에 영영 가지
 * 못한다(막으려던 결함을 고치다 반대쪽으로 넘어가는 자리다).
 *
 * 두 경우를 **같은 실패 경로로 나란히** 통과시켜, 판정 기준이 "실패했는가"가 아니라
 * "어느 범위에서 받았는가"임을 한 시험에 고정한다.
 */
test("F-23(SPLIT-1): 재결속 스냅샷 실패 — 이전 범위의 잔존 ENDED는 제거되고, 현재 연결에서 받은 종료 결과는 보존된다", async () => {
  // ── (가) 이전 연결이 받아 둔 잔존 ENDED ──────────────────────────────────────
  seedEndedStore({ gameId: "g-stale" })
  seedAuth("player-1")
  const stale = createFakeSessionSnapshotSocket()
  stale.socket.connected = true
  stale.socket.id = "stale-1"
  setFakeSocket(stale.socket)

  const staleHook = renderHook(() => useInGameSessionSnapshotSync())
  await emitConnect(stale, () => { stale.socket.id = "stale-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재연결이 재결속 보류를 열어야 한다")

  await act(async () => {
    stale.emitWithAckCalls[1].reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })

  assert.equal(
    hasResultNavigationBasis(), false,
    "이전 연결이 받아 둔 잔존 ENDED가 확인 없이 그대로 이동 근거로 남았다",
  )
  assert.equal(
    useInGameStore.getState().state.phase, "ENDED",
    "종료 잠금 자체는 서버가 확정한 사실이다 — 실패했다고 되돌리지 않는다",
  )
  staleHook.unmount()

  // ── (나) 재결속 중에 **현재 연결**이 직접 받은 정상 종료 결과 ─────────────────
  seedStore({ gameId: "g-live", playerUuid: "player-1", phase: "NIGHT", dayIndex: 1 })
  seedAuth("player-1")
  const live = createFakeSessionSnapshotSocket()
  live.socket.connected = true
  live.socket.id = "live-1"
  setFakeSocket(live.socket)

  const liveHook = renderHook(() => useInGameSessionSnapshotSync())
  await emitConnect(live, () => { live.socket.id = "live-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재연결이 재결속 보류를 열어야 한다")
  assert.equal(live.emitWithAckCalls.length, 2, "전제: 그 연결이 현재 신원의 스냅샷을 물어야 한다")

  // 아직 그 스냅샷을 기다리는 동안, 이 연결의 정상 공개 종료가 도착한다. 실제 수신 경로가
  // 부르는 바로 그 store 액션을 **같은 인자로** 쓴다 — 값을 직접 주입하거나 수신 범위를 빼고
  // 부르면 그 기록이 남지 않아 이 시험이 검사하려는 것을 건너뛴다.
  act(() => {
    deliverTerminalNightResult({ gameId: "g-live", accountId: "player-1" })
  })
  assert.equal(hasResultNavigationBasis(), true, "전제: 이 연결의 정상 종료 결과가 반영돼야 한다")

  // 그리고 (가)와 **똑같은** 실패가 그 재결속 요청에 도착한다.
  await act(async () => {
    live.emitWithAckCalls[1].reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })

  assert.equal(getInGameSnapshotRebindPending(), false, "보류가 남아 화면이 영영 갇힌다")
  assert.equal(
    hasResultNavigationBasis(), true,
    "현재 연결에서 직접 받은 정상 종료 결과까지 스냅샷 실패로 지워졌다",
  )
  liveHook.unmount()
})

/**
 * F-23(SPLIT-1): **인증 왕복은 store도 연결도 건드리지 않는다 — 그래서 계정 축이 필요하다.**
 *
 * 같은 화면이 판과 연결을 그대로 들고 있는 채로 인증만 A→B→A로 왕복하는 구간이 있다. 이때
 * store가 소유한 관측은 하나도 움직이지 않는다: gameId·roster·내 소속은 그대로이고(소속 전이
 * 세대가 세는 self.uuid는 마지막으로 적용된 snapshot의 본인이지 인증 계정이 아니다), 소켓 객체와
 * sid도 그대로다. 계정 값 자체도 원래대로 돌아온다.
 *
 * 그래서 계정 축(accountId·인증 전이 세대)을 함께 적어 두고 함께 대조하지 않으면, **이전 계정이**
 * 받아 둔 종료 결과가 "지금 이 화면이 직접 받은 사실"로 통과한다 — 현재 신원의 스냅샷이
 * 실패했는데도 보류가 풀리고, 화면은 남의 판 결과로 넘어간다.
 *
 * 같은 파일의 "현재 연결에서 받은 종료 결과는 보존된다"(위)와 이 시험은 **같은 실패 경로**를
 * 쓴다. 판정 기준이 "실패했는가"도 "연결이 바뀌었는가"도 아니라 "그 결과를 받은 범위가 아직
 * 현재인가"임을 두 시험이 함께 고정한다.
 */
test("F-23(SPLIT-1): 인증 A→B→A 왕복 뒤 스냅샷이 실패하면 이전 계정이 받아 둔 종료 결과는 이동 근거로 남지 않는다", async () => {
  seedStore({ gameId: "g-auth", playerUuid: "player-1", phase: "NIGHT", dayIndex: 1 })
  seedAuth("player-1")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 1, "전제: 마운트가 한 번 물어야 한다")

  // 계정 A가 **이 연결에서** 정상 공개 종료를 받는다(실제 수신 경로와 같은 인자다).
  act(() => {
    deliverTerminalNightResult({ gameId: "g-auth", accountId: "player-1" })
  })
  assert.equal(hasResultNavigationBasis(), true, "전제: 계정 A의 종료 결과가 반영돼야 한다")
  const generationBefore = useAuthStore.getState().identityGeneration

  // A→B→A. 실제 인증 전이(login)로 왕복시킨다 — 계정 값은 원래대로 돌아오고 판·소속·소켓 객체·
  // sid·연결 상태는 하나도 바뀌지 않는다. 전이 **횟수**만이 이 구간을 남긴다.
  await act(async () => {
    useAuthStore.getState().login({ uuid: "player-2" })
    useAuthStore.getState().login({ uuid: "player-1" })
  })
  assert.equal(useAuthStore.getState().user.uuid, "player-1", "전제: 계정 값은 원래대로 돌아온다")
  assert.equal(
    useAuthStore.getState().identityGeneration, generationBefore + 2,
    "전제: 두 전이가 모두 세대로 남아야 한다",
  )
  assert.equal(useInGameStore.getState().gameId, "g-auth", "전제: 판은 그대로 남아 있어야 한다")
  assert.equal(fake.socket.id, "sock-1", "전제: 연결은 교체되지 않는다(이 시험이 보는 축은 계정뿐이다)")
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 인증 왕복이 재결속 보류를 열어야 한다")
  assert.equal(fake.emitWithAckCalls.length, 2, "전제: 현재 신원의 스냅샷을 다시 물어야 한다")

  // 그 요청이 실패한다 — 현재 신원의 사실을 끝내 확인하지 못했다.
  await act(async () => {
    fake.emitWithAckCalls[1].reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })

  assert.equal(
    getInGameSnapshotRebindPending() === false && hasResultNavigationBasis(),
    false,
    "인증이 왕복한 뒤 스냅샷도 실패했는데, 이전 계정이 받아 둔 종료 결과가 이동 근거로 남았다",
  )
  assert.equal(hasResultNavigationBasis(), false, "이전 계정의 종료 결과가 그대로 남았다")
  assert.equal(getInGameSnapshotRebindPending(), false, "보류가 남아 화면이 영영 갇힌다")
  assert.equal(
    useInGameStore.getState().state.phase, "ENDED",
    "종료 잠금 자체는 서버가 확정한 사실이다 — 실패했다고 되돌리지 않는다",
  )

  // 영구 무효가 아니다: 현재 신원의 정상 스냅샷이 종료 결과를 다시 실으면 이동이 재개된다.
  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  await act(async () => {
    fake.emitWithAckCalls[2].resolve(endedSnapshotResponse({ gameId: "g-auth" }))
    await flushMicrotasks()
  })
  assert.equal(hasResultNavigationBasis(), true, "현재 신원의 정상 스냅샷 뒤에도 결과 이동이 막혀 있다")

  hook.unmount()
})

/**
 * F-23(AC-05 보수): **끝맺기도 요청의 범위에 묶인다 — 세대 ref만으로는 부족하다.**
 *
 * 재결속 보류를 끝맺는 두 함수는 요청 세대(epochVersionRef)만 확인했다. 그 값은 effect가 다시
 * 돌아야 오르므로, **신원이 전이했지만 아직 React가 리렌더하지 않은 창**에서는 옛 값 그대로다.
 * 그 창에 도착한 **옛 요청의 stale 응답**은 그래서 "내 세대다"라고 판정하고, 현재 신원이 짊어진
 * 재결속 보류를 풀면서 현재 범위의 종료 결과까지 무효화할 수 있었다.
 *
 * 그 창을 그대로 재현한다. 같은 판에서 내 소속만 바뀌는 전이(이탈→재입장)를 **리렌더 없이**
 * 일으키고(같은 파일의 다른 시험들과 같은 기법이다 — 값만 바꾸면 훅의 deps는 아무것도 움직이지
 * 않는다), 그 창에 옛 요청의 실패 응답을 떨어뜨린다. 옛 응답은 보류도 종료 결과도 건드리지
 * 못해야 하고, 뒤이어 React가 그 전이를 따라잡아 보낸 **현재 요청**은 정상적으로 끝맺어야 한다
 * (앞만 지키면 화면이 영영 갇히고, 뒤만 지키면 옛 응답이 현재 상태를 바꾼다).
 */
test("F-23(AC-05 보수): 재결속 중 effect 이전의 신원 전이 — 옛 요청의 stale 응답은 보류도 종료 결과도 바꾸지 못한다", async () => {
  seedEndedStore({ gameId: "g-rebind" })
  seedAuth("player-1")
  setMyMembership("mem-1")
  assert.equal(hasResultNavigationBasis(), true, "전제: 잔존 ENDED가 이동 근거를 갖고 있어야 한다")

  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(getInGameSnapshotRebindPending(), false, "전제: 마운트 자체는 전이가 아니다")

  // 실제 재연결이 재결속 보류를 연다 — 이 요청이 곧 "옛 요청"이 된다.
  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재연결이 재결속 보류를 열어야 한다")
  assert.equal(fake.emitWithAckCalls.length, 2, "전제: 그 연결이 현재 신원의 스냅샷을 물어야 한다")
  const staleRequest = fake.emitWithAckCalls[1]

  // 그 응답을 기다리는 동안 소속이 바뀐다. 훅의 deps(socket·gameId·계정·인증 세대·소속 전이
  // 세대)는 하나도 움직이지 않으므로 effect는 아직 돌지 않았고, 요청 세대도 그대로다 —
  // 바로 이 창이 결함이 살던 자리다.
  useInGameStore.getState().state.players[0].membershipId = "mem-2"

  // 보류는 **최종값이 아니라 전이 기록**으로 본다. 옛 응답이 보류를 풀면 그 store 변경이
  // 곧바로 새 effect를 돌려 보류를 다시 올리므로, 나중에 읽은 최종값은 양쪽이 똑같이 true다 —
  // 그 값에 기대면 "풀렸다가 되돌아온" 경로가 조용히 통과한다. 옛 응답은 이 값을 한 번도
  // 건드리지 않아야 한다.
  const pendingTransitions = []
  const unsubscribePending = subscribeInGameSnapshotRebindPending(
    () => pendingTransitions.push(getInGameSnapshotRebindPending()),
  )
  const before = snapshotStoreFacts()
  await act(async () => {
    staleRequest.reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })
  unsubscribePending()

  assert.deepEqual(
    pendingTransitions, [],
    "전이 이전 범위의 옛 응답이 현재 신원의 재결속 보류를 건드렸다",
  )
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 보류는 그대로 열려 있어야 한다")
  assert.equal(
    hasResultNavigationBasis(), true,
    "전이 이전 범위의 옛 응답이 현재 범위의 종료 결과를 무효화했다",
  )
  assertStoreFactsUnchanged(before, "전이 이전 범위의 옛 응답")
  assert.equal(fake.emitWithAckCalls.length, 2, "옛 응답이 아무것도 바꾸지 않았다면 새 요청도 없다")

  // 이제 React가 그 전이를 따라잡는다(store의 전이 관측을 지나는 정상 커밋이다) — 현재 범위의
  // 요청이 새로 나가고, 그 응답이 보류를 끝맺는다.
  await act(async () => {
    setMyMembership("mem-2")
    await flushMicrotasks()
  })
  assert.equal(
    fake.emitWithAckCalls.length, 3,
    "전이 뒤 현재 신원의 요청이 재개되지 않으면 화면이 영영 확인 중에 갇힌다",
  )
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 전이 구간의 보류는 아직 열려 있다")

  await act(async () => {
    fake.emitWithAckCalls[2].resolve(endedSnapshotResponse({ gameId: "g-rebind" }))
    await flushMicrotasks()
  })

  assert.equal(getInGameSnapshotRebindPending(), false, "보류가 남아 화면이 영영 갇힌다")
  assert.equal(hasResultNavigationBasis(), true, "현재 요청의 정상 응답 뒤에도 결과 이동이 막혀 있다")
  assert.equal(fake.emitWithAckCalls.length, 3, "정상 복원이 곧바로 다음 요청을 만들어 되먹임이 된다")

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

// ---------------------------------------------------------------------------
// F-25b(AC-06) — 재접속 스냅샷이 임시 사망을 최종 사망으로 보여주지 않는다
//
// 실제 소비 경로 그대로다: get_session_snapshot ack → requestSnapshot의 신원·소속·연결 세대
// 검사 → applySessionSnapshot → applySessionSnapshotPure의 isAlive→alive 변환 → InGamePage의
// selectInGameDeadParticipantChoice와 행동 패널의 resolveInGameSelfAliveForControls.
// ---------------------------------------------------------------------------

const { selectInGameDeadParticipantChoice } = await import("../../utils/selectInGameDeadParticipantChoice.js")
const { resolveInGameSelfAliveForControls } = await import("../../utils/selectInGameSelfAlive.js")

/** 그 밤의 스냅샷 하나를 실제 ack 경로로 흘려보내고, 복원된 canonical state를 돌려준다. */
async function restoreFromSnapshot(response, { gameId = "g1", playerUuid = "player-1" } = {}) {
  seedStore({ gameId, playerUuid, nickname: "Alice" })
  seedAuth(playerUuid)
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  await act(async () => {
    fake.emitWithAckCalls[0].resolve(response)
    await flushMicrotasks()
  })
  const state = useInGameStore.getState().state
  hook.unmount()
  return state
}

test("F-25b(AC-06): 치료 가능성이 해소되지 않은 밤의 스냅샷은 본인을 생존으로 복원하고 사망 선택창을 열지 않는다", async () => {
  // 서버가 임시 사망 상태를 공개 스냅샷에 담지 않는다는 계약의 소비 쪽 — isAlive:true이고
  // 현재 밤의 확정 nightResult가 없다.
  const state = await restoreFromSnapshot({
    ...buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1", phase: "NIGHT", dayIndex: 0 }),
    nightResult: null,
  })

  assert.equal(state.phase, "NIGHT")
  assert.equal(state.players.find((p) => p.uuid === "player-1").alive, true)
  assert.equal(state.nightResult ?? null, null, "미확정 공격이 확정 밤 결과로 나타나면 안 된다")
  assert.equal(selectInGameDeadParticipantChoice(state, "player-1"), false, "사망 선택창이 열리면 안 된다")
  assert.equal(resolveInGameSelfAliveForControls(state, null), true, "본인은 여전히 행동 가능 상태다")
})

test("F-25b(AC-06): 치료가 성공한 밤의 최종 스냅샷은 victimUuid가 null이고 본인이 생존으로 복원된다", async () => {
  const state = await restoreFromSnapshot({
    ...buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1", phase: "DAY", dayIndex: 1 }),
    dayPhase: "DAY_DISCUSSION",
    nightResult: { dayIndex: 1, victimUuid: null, deathReveals: [] },
  })

  assert.equal(state.phase, "DAY")
  assert.equal(state.nightResult.victimUuid, null)
  assert.deepEqual(state.nightResult.deathReveals, [])
  assert.equal(state.players.find((p) => p.uuid === "player-1").alive, true)
  assert.equal(selectInGameDeadParticipantChoice(state, "player-1"), false)
  assert.equal(resolveInGameSelfAliveForControls(state, null), true)
})

test("F-25b(AC-06) 대조군: 미치료 밤이 최종 확정된 뒤의 스냅샷에서만 본인이 사망으로 복원되고 선택창이 열린다", async () => {
  const response = buildSnapshotResponseWithNightResult({ gameId: "g1", playerUuid: "player-1", dayIndex: 1 })
  // 확정된 밤이므로 roster도 사망을 반영한다(서버 buildSessionSnapshot의 isAlive).
  response.players = response.players.map((p) => ({ ...p, isAlive: false }))

  const state = await restoreFromSnapshot(response)

  assert.equal(state.nightResult.victimUuid, "player-1")
  assert.equal(state.players.find((p) => p.uuid === "player-1").alive, false)
  assert.equal(selectInGameDeadParticipantChoice(state, "player-1"), true)
  assert.equal(resolveInGameSelfAliveForControls(state, null), false)
})

// ---------------------------------------------------------------------------
// F-26(AC-01/AC-02/AC-04) — 미완료 성공 사건의 복원과 재가입 보류
//
// 이 훅은 복원 payload를 만들지 않는다. 서버 응답의 nightSuccessRecovery를 store의 두 복원
// 액션에 그대로 넘기고, 그 검증·중복 판정·결속은 store가 소유한다(live 수신과 같은 한 곳이다).
// 아래 시험들은 그 경계를 실제 ack 경로로만 통과시킨다.
// ---------------------------------------------------------------------------

const readSuccessQueue = () => useInGameStore.getState().nightSuccessQueue

/** 지금 이 순간의 인증 축(production 호출부와 같은 두 값). */
function readCurrentAuthScopeForTest() {
  const auth = useAuthStore.getState()
  return {
    accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
    identityGeneration: auth.identityGeneration ?? null,
  }
}

/** 서버가 복원해 주는 한 사건의 제한 payload(TARGET 전용은 targetId를 담지 않는다). */
function recoveryPayload({
  gameId = "g1", nightDayIndex = 0, eventId = "ev-recover-1", type = "KILL", perspectives = ["TARGET"],
} = {}) {
  const payload = { gameId, nightDayIndex, eventId, type, perspectives: [...perspectives] }
  if (perspectives.includes("USER")) payload.targetId = "player-2"
  return payload
}

/** 정상 응답 + 복원 배열. 응답 자체는 기존 fixture를 그대로 쓴다(키만 하나 더 붙는다). */
function snapshotWithRecovery(recovery, { gameId = "g1", playerUuid = "player-1", phase = "NIGHT", dayIndex = 0 } = {}) {
  return {
    ...buildValidSnapshotResponse({ gameId, playerUuid, phase, dayIndex }),
    nightSuccessRecovery: recovery,
  }
}

/** 같은 판을 들고 있는 화면 + 그 계정으로 로그인 + 연결된 소켓 한 벌. */
function openConnectedHook({ gameId = "g1", playerUuid = "player-1", empty = false } = {}) {
  if (empty) useInGameStore.setState({ gameId: null, state: null, error: null })
  else seedStore({ gameId, playerUuid })
  seedAuth(playerUuid)
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  return { fake, hook }
}

test("F-26(AC-01): 기존 판의 재접속 응답에 실린 미완료 사건이 실제 ack 경로로 큐에 복원된다", async () => {
  const { fake, hook } = openConnectedHook()
  const payload = recoveryPayload()
  const seqBefore = useInGameStore.getState().snapshotSeq

  await act(async () => {
    fake.emitWithAckCalls[0].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })

  assert.equal(useInGameStore.getState().snapshotSeq, seqBefore + 1, "전제: 그 응답은 실제로 반영돼야 한다")
  assert.deepEqual(readSuccessQueue().map((e) => e.eventId), [payload.eventId])
  // 허용 필드만 복사된다 — TARGET 전용 항목에 targetId가 생기지 않는다.
  assert.deepEqual(Object.keys(readSuccessQueue()[0]).sort(),
    ["eventId", "gameId", "nightDayIndex", "perspectives", "type"])

  // 같은 응답을 다시 받아도(재조회·중복 전달) 큐는 늘지 않는다.
  await act(async () => { fake.socket.triggerConnect() })
  await act(async () => {
    fake.emitWithAckCalls[1].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })
  assert.deepEqual(readSuccessQueue().map((e) => e.eventId), [payload.eventId],
    "같은 사건이 재조회로 두 번 큐에 들어갔다")

  hook.unmount()
})

test("F-26(AC-01): 빈 store bootstrap도 같은 경로로 복원한다(복원 항목은 그 뒤 완료까지 된다)", async () => {
  const { fake, hook } = openConnectedHook({ empty: true })
  const payload = recoveryPayload()

  await act(async () => {
    fake.emitWithAckCalls[0].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })

  assert.equal(useInGameStore.getState().gameId, "g1", "전제: 빈 store 복원 자체가 성공해야 한다")
  assert.deepEqual(readSuccessQueue().map((e) => e.eventId), [payload.eventId])

  // 복원 항목의 소유 범위는 **복원 뒤의 현재 범위**다 — 그래야 그 화면이 완료할 수 있다.
  // 완료는 수락 당시의 범위와 **모든 축**이 같아야 한다 — 계정 축은 실제 인증 store에서 읽는다
  // (production 소비처도 같은 두 값을 넘긴다).
  const scope = readInGameReceiptScope(readCurrentAuthScopeForTest())
  const outcome = useInGameStore.getState().completeNightSuccess(payload.eventId, scope)
  assert.equal(outcome.status, "sent", `복원된 사건을 완료할 수 없었다: ${JSON.stringify(outcome)}`)
  assert.deepEqual(readSuccessQueue(), [])
  const ackEmit = fake.emitCalls.find((c) => c.event === "acknowledge_night_action_success")
  assert.ok(ackEmit, "완료가 서버로 전송되지 않았다")
  assert.deepEqual(ackEmit.payload,
    { gameId: "g1", nightDayIndex: payload.nightDayIndex, eventId: payload.eventId })

  hook.unmount()
})

test("F-26(AC-01): 복원 배열이 하나라도 어긋나면 snapshot 전체가 거부된다(부분 반영 없음)", async () => {
  for (const broken of [
    "not-an-array",
    [recoveryPayload(), { gameId: "g1" }],
    [recoveryPayload({ gameId: "g-other" })],
    // 다른 밤의 사건은 이 화면의 수명 밖이다.
    [recoveryPayload({ nightDayIndex: 7 })],
  ]) {
    const { fake, hook } = openConnectedHook()
    const before = snapshotStoreFacts()

    await act(async () => {
      fake.emitWithAckCalls[0].resolve(snapshotWithRecovery(broken))
      await flushMicrotasks()
    })

    assertStoreFactsUnchanged(before, `잘못된 복원 배열(${JSON.stringify(broken)})`)
    assert.deepEqual(readSuccessQueue(), [], "거부된 응답이 큐를 만들었다")
    hook.unmount()
  }
})

test("F-26(AC-01): 수신 문맥 없이 부른 복원(직접 호출)은 상태만 복원하고 사건은 만들지 않는다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  const payload = recoveryPayload()

  // 계정 축을 모르는 커밋이다 — 그런 응답으로 개인 사건을 되돌려주지 않는다(fail-closed).
  const seqBefore = useInGameStore.getState().snapshotSeq
  act(() => {
    useInGameStore.getState().applySessionSnapshot(snapshotWithRecovery([payload]))
  })
  assert.deepEqual(readSuccessQueue(), [], "증거 없는 적용이 성공 사건 큐를 만들었다")
  assert.equal(useInGameStore.getState().snapshotSeq, seqBefore, "그 응답은 통째로 거부돼야 한다")
})

test("F-26(AC-02): 로컬 완료 기록이 같은 범위의 늦은 복원보다 우선한다", async () => {
  const { fake, hook } = openConnectedHook()
  const payload = recoveryPayload()

  await act(async () => {
    fake.emitWithAckCalls[0].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })
  // 완료는 수락 당시의 범위와 **모든 축**이 같아야 한다 — 계정 축은 실제 인증 store에서 읽는다
  // (production 소비처도 같은 두 값을 넘긴다).
  const scope = readInGameReceiptScope(readCurrentAuthScopeForTest())
  assert.equal(useInGameStore.getState().completeNightSuccess(payload.eventId, scope).status, "sent")
  assert.deepEqual(readSuccessQueue(), [])

  // 그 뒤에 도착한(보류됐던) 같은 사건의 복원은 재삽입되지 않는다.
  await act(async () => { fake.socket.triggerConnect() })
  await act(async () => {
    fake.emitWithAckCalls[1].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })
  assert.deepEqual(readSuccessQueue(), [], "로컬 완료한 사건이 늦은 복원으로 다시 큐에 들어왔다")

  hook.unmount()
})

test("F-26(AC-04): 새 밤으로 들어가는 복원은 이전 밤의 큐를 비우고, 같은 밤 재적용은 보존한다", async () => {
  const { fake, hook } = openConnectedHook()
  const payload = recoveryPayload({ nightDayIndex: 0 })

  await act(async () => {
    fake.emitWithAckCalls[0].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })
  assert.equal(readSuccessQueue().length, 1)

  // 같은 밤의 재적용(복원 배열 없음)은 큐를 비우지 않는다.
  await act(async () => { fake.socket.triggerConnect() })
  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g1", phase: "NIGHT", dayIndex: 0 }))
    await flushMicrotasks()
  })
  assert.equal(readSuccessQueue().length, 1, "같은 밤 재적용이 큐를 비웠다")

  // 다음 밤으로 들어가면 이전 밤의 사건은 이 밤으로 넘어오지 않는다.
  await act(async () => { fake.socket.triggerConnect() })
  await act(async () => {
    fake.emitWithAckCalls[2].resolve(buildValidSnapshotResponse({ gameId: "g1", phase: "NIGHT", dayIndex: 1 }))
    await flushMicrotasks()
  })
  assert.deepEqual(readSuccessQueue(), [], "다음 밤에 이전 밤의 성공 사건이 남았다")

  hook.unmount()
})

test("F-26(AC-01): SESSION_ROUTING_PENDING은 빈 복원 성공이 아니다 — 같은 연결에서 다시 묻고 그 응답으로 복원한다", async () => {
  const { fake, hook } = openConnectedHook()
  const payload = recoveryPayload()
  const before = snapshotStoreFacts()

  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: false, code: "SESSION_ROUTING_PENDING", message: "…" })
    await flushMicrotasks()
  })
  assertStoreFactsUnchanged(before, "재가입 보류 응답")
  assert.deepEqual(readSuccessQueue(), [], "보류 응답이 큐를 만들었다")

  // 250ms 뒤 같은 연결에서 재조회가 나간다(새 connect 없이 이 훅이 스스로 묻는다).
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 400) })
    await flushMicrotasks()
  })
  assert.ok(fake.emitWithAckCalls.length >= 2, "보류 뒤 같은 연결의 재조회가 없었다")
  assert.deepEqual(fake.emitWithAckCalls[1].payload, { gameId: "g1" })

  await act(async () => {
    fake.emitWithAckCalls[1].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })
  assert.deepEqual(readSuccessQueue().map((e) => e.eventId), [payload.eventId],
    "재조회 응답으로도 복원되지 않았다")

  hook.unmount()
})

test("F-26(AC-01): 언마운트·새 세대는 예약된 재조회를 취소한다(사라진 화면이 계속 묻지 않는다)", async () => {
  const { fake, hook } = openConnectedHook()

  await act(async () => {
    fake.emitWithAckCalls[0].resolve({ ok: false, code: "SESSION_ROUTING_PENDING", message: "…" })
    await flushMicrotasks()
  })
  const beforeUnmount = fake.emitWithAckCalls.length
  hook.unmount()

  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 400) })
    await flushMicrotasks()
  })
  assert.equal(fake.emitWithAckCalls.length, beforeUnmount,
    "언마운트 뒤에도 예약된 재조회가 요청을 보냈다")
})
