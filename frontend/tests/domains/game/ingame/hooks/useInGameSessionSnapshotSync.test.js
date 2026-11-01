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

test.afterEach(() => cleanup())

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

function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of [...fakeSocketSubscribers]) callback()
}

function setFakeSocketWithoutNotify(next) {
  currentFakeSocket = next
}

mock.module("../../../../../src/shared/socket/socketClient.js", {
  namedExports: {
    getSocket: fakeGetSocket,
    subscribeSocket: fakeSubscribeSocket,
  },
})

const { useInGameStore, readInGameReceiptScope } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const {
  useInGameSessionSnapshotSync,
  getInGameSnapshotRebindPending,
  subscribeInGameSnapshotRebindPending,
} = await import("../../../../../src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js")

function createFakeSessionSnapshotSocket() {
  const onCalls = []
  const offCalls = []
  const connectHandlers = new Set()
  const emitWithAckCalls = []
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

function setMyMembership(membershipId) {
  useInGameStore.setState((s) => ({
    state: { ...s.state, players: s.state.players.map((p) => ({ ...p, membershipId })) },
  }))
}

const readMyMembership = () =>
  useInGameStore.getState().state?.players?.[0]?.membershipId ?? null

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
  assert.deepEqual(fake.onCalls.map((c) => c.event).sort(),
    ["connect", "night_presentation_wait", "night_turn_started"])
  assert.equal(fake.emitWithAckCalls.length, 1)

  hook.rerender()
  hook.rerender()
  hook.rerender()

  assert.equal(fake.onCalls.length, 3)
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

  assert.deepEqual(
    [...new Set(fake.onCalls.map((c) => c.event))].sort(),
    ["connect", "night_presentation_wait", "night_turn_started"],
    "이 훅은 connect·관측 둘 외의 이벤트(예: 'reconnect')를 구독하면 안 된다",
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

test("타임아웃/오류로 요청이 실패해도 이후 재연결은 정상적으로 다시 요청하고 성공할 수 있다", async (t) => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const clock = installRetryClock()
  t.after(() => clock.restore())
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())

  await rejectAsAckTimeout(clock, fake.emitWithAckCalls[0])
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
  authState.user.uuid = "user-b"

  await act(async () => {
    pending.resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0, "리렌더/epoch 무효화가 전혀 없었는데도 인증 계정 불일치만으로 거부되어야 한다")

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
  setFakeSocketWithoutNotify(fakeB.socket)

  await act(async () => {
    pendingFromA.resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 0, "이미 교체된 socket에서 온 응답은 epoch 검사만으로는 걸러지지 않으므로 socket 참조 비교가 독립적으로 막아야 한다")

  hook.unmount()
})

test("F-23: 계정 A→B→A를 지나온 옛 응답은 거부되고, 현재 신원의 새 요청은 정상 반영된다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pendingFromA = fake.emitWithAckCalls[0]

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
  useInGameStore.getState().state.players[0].membershipId = "mem-1"

  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const applyCalls = wrapApplySessionSnapshot()
  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const pending = fake.emitWithAckCalls[0]

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

  fake.socket.id = "sock-2"

  await act(async () => {
    pending.resolve(buildValidSnapshotResponse({ gameId: "g1" }))
    await flushMicrotasks()
  })

  assert.equal(applyCalls.length, 0, "socket 객체 비교만으로는 같은 객체의 재연결을 구별하지 못한다")

  hook.unmount()
})

test("cleanup은 이 훅이 등록한 리스너만 정확한 참조로 제거하고, 다른 이벤트 리스너는 그대로 둔다", () => {
  seedStore({ gameId: "g1" })
  seedAuth("user-a")
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  setFakeSocket(fake.socket)

  const unrelatedChatHandler = () => {}
  const unrelatedGameHandler = () => {}
  fake.socket.on("joker_chat_message", unrelatedChatHandler)
  fake.socket.on("game_ended", unrelatedGameHandler)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  const ownHandler = [...fake.connectHandlers][0]
  assert.ok(ownHandler)
  const handlerFor = (event) => fake.onCalls.find((c) => c.event === event)?.handler
  const waitHandler = handlerFor("night_presentation_wait")
  const turnHandler = handlerFor("night_turn_started")
  assert.ok(waitHandler && turnHandler)

  hook.unmount()

  assert.deepEqual(
    fake.offCalls.map((c) => ({ event: c.event, handler: c.handler })),
    [
      { event: "connect", handler: ownHandler },
      { event: "night_presentation_wait", handler: waitHandler },
      { event: "night_turn_started", handler: turnHandler },
    ],
    "cleanup은 이 훅이 등록한 세 리스너를 정확한 참조로만 off해야 한다",
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

  fake.socket.connected = false
  const before = snapshotStoreFacts()
  await act(async () => {
    pending.resolve(buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 2 }))
    await flushMicrotasks()
  })
  assert.equal(applyCalls.length, 0, "끊긴 연결에서 온 응답이 반영됐다")
  assertStoreFactsUnchanged(before, "끊긴 연결의 응답")

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

test("F-23(SPLIT-1): 전송 자체가 동기 예외로 실패해도 같은 세대 검사를 거쳐 유한 상태로 끝맺는다", async () => {
  useInGameStore.setState({ gameId: null, state: null, error: null })
  seedAuth("player-1")
  const clock = installRetryClock()
  try {
    const fake = createFakeSessionSnapshotSocket()
    fake.socket.connected = true
    fake.socket.emitWithAck = () => { throw new Error("transport closed") }
    setFakeSocket(fake.socket)

    const hook = renderHook(() => useInGameSessionSnapshotSync())

    assert.equal(hook.result.current, "checking", "재시도가 남았는데 첫 실패로 확정됐다")

    for (let i = 0; i < 30; i += 1) await clock.advance(250)
    assert.equal(hook.result.current, "failed", "동기 전송 예외가 확인 중으로 남았다")
    assert.equal(useInGameStore.getState().gameId, null)

    hook.unmount()
  } finally {
    clock.restore()
  }
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
    fake.emitWithAckCalls[0].resolve(buildValidSnapshotResponse({
      gameId: "g-other", playerUuid: "player-9", phase: "ROLE_REVEAL",
    }))
    await flushMicrotasks()
  })

  assert.equal(useInGameStore.getState().gameId, null, "남의 본인을 주장하는 응답으로 복원됐다")
  assert.equal(hook.result.current, "missing")
  hook.unmount()
})

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

  useInGameStore.getState().applySessionSnapshot(
    buildSnapshotResponseWithNightResult({ gameId: "g1", dayIndex: 5 }), receipt,
  )

  assert.equal(useInGameStore.getState().state.dayIndex, 5, "값을 주장하지 않는 응답까지 막혔다")
  assert.equal(useInGameStore.getState().snapshotSeq, seqBefore + 1)
})

test("F-23(SPLIT-1): 실제 재연결은 재결속 보류를 열고, 응답이 실패여도 반드시 닫는다", async (t) => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  const clock = installRetryClock()
  t.after(() => clock.restore())
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

  await rejectAsAckTimeout(clock, fake.emitWithAckCalls[1])
  assert.equal(getInGameSnapshotRebindPending(), false, "응답이 끝났는데 보류가 남아 화면이 갇힌다")

  await emitConnect(fake, () => { fake.socket.id = "sock-3" })
  assert.equal(getInGameSnapshotRebindPending(), true)
  await act(async () => {
    fake.emitWithAckCalls[2].resolve(buildValidSnapshotResponse({ gameId: "g1", playerUuid: "player-1" }))
    await flushMicrotasks()
  })
  assert.equal(getInGameSnapshotRebindPending(), false)

  await emitConnect(fake, () => { fake.socket.id = "sock-4" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 아직 응답을 기다리는 중이어야 한다")
  hook.unmount()
  assert.equal(getInGameSnapshotRebindPending(), false, "언마운트가 보류를 다음 화면으로 넘겼다")
})

function hasResultNavigationBasis() {
  const { state } = useInGameStore.getState()
  return state?.phase === "ENDED" && Boolean(state?.winResult)
}

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

test("F-23(SPLIT-1): 재결속 스냅샷이 거부되면 잔존 ENDED의 결과 이동 근거가 남지 않는다", async (t) => {
  seedEndedStore()
  seedAuth("player-1")
  const clock = installRetryClock()
  t.after(() => clock.restore())
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())

  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재연결이 재결속 보류를 열어야 한다")
  assert.equal(fake.emitWithAckCalls.length, 2, "전제: 그 연결이 현재 신원의 스냅샷을 물어야 한다")

  await rejectAsAckTimeout(clock, fake.emitWithAckCalls[1])

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

test("F-23(SPLIT-1): 재결속이 아닌 평범한 동기화 실패는 현재 신원의 종료 결과를 지우지 않는다", async (t) => {
  seedEndedStore()
  seedAuth("player-1")
  const clock = installRetryClock()
  t.after(() => clock.restore())
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 1, "전제: 마운트가 한 번 물어야 한다")
  assert.equal(getInGameSnapshotRebindPending(), false, "전제: 마운트 자체는 전이가 아니다")

  await rejectAsAckTimeout(clock, fake.emitWithAckCalls[0])

  assert.equal(hasResultNavigationBasis(), true, "재결속과 무관한 조회 실패가 현재 종료 결과를 지웠다")

  hook.unmount()
})

test("F-23(SPLIT-1): 재결속 스냅샷 실패 — 이전 범위의 잔존 ENDED는 제거되고, 현재 연결에서 받은 종료 결과는 보존된다", async (t) => {
  const clock = installRetryClock()
  t.after(() => clock.restore())
  seedEndedStore({ gameId: "g-stale" })
  seedAuth("player-1")
  const stale = createFakeSessionSnapshotSocket()
  stale.socket.connected = true
  stale.socket.id = "stale-1"
  setFakeSocket(stale.socket)

  const staleHook = renderHook(() => useInGameSessionSnapshotSync())
  await emitConnect(stale, () => { stale.socket.id = "stale-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재연결이 재결속 보류를 열어야 한다")

  await rejectAsAckTimeout(clock, stale.emitWithAckCalls[1])

  assert.equal(
    hasResultNavigationBasis(), false,
    "이전 연결이 받아 둔 잔존 ENDED가 확인 없이 그대로 이동 근거로 남았다",
  )
  assert.equal(
    useInGameStore.getState().state.phase, "ENDED",
    "종료 잠금 자체는 서버가 확정한 사실이다 — 실패했다고 되돌리지 않는다",
  )
  staleHook.unmount()

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

  act(() => {
    deliverTerminalNightResult({ gameId: "g-live", accountId: "player-1" })
  })
  assert.equal(hasResultNavigationBasis(), true, "전제: 이 연결의 정상 종료 결과가 반영돼야 한다")

  await rejectAsAckTimeout(clock, live.emitWithAckCalls[1])

  assert.equal(getInGameSnapshotRebindPending(), false, "보류가 남아 화면이 영영 갇힌다")
  assert.equal(
    hasResultNavigationBasis(), true,
    "현재 연결에서 직접 받은 정상 종료 결과까지 스냅샷 실패로 지워졌다",
  )
  liveHook.unmount()
})

test("F-23(SPLIT-1): 인증 A→B→A 왕복 뒤 스냅샷이 실패하면 이전 계정이 받아 둔 종료 결과는 이동 근거로 남지 않는다", async (t) => {
  seedStore({ gameId: "g-auth", playerUuid: "player-1", phase: "NIGHT", dayIndex: 1 })
  seedAuth("player-1")
  const clock = installRetryClock()
  t.after(() => clock.restore())
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = "sock-1"
  setFakeSocket(fake.socket)

  const hook = renderHook(() => useInGameSessionSnapshotSync())
  assert.equal(fake.emitWithAckCalls.length, 1, "전제: 마운트가 한 번 물어야 한다")

  act(() => {
    deliverTerminalNightResult({ gameId: "g-auth", accountId: "player-1" })
  })
  assert.equal(hasResultNavigationBasis(), true, "전제: 계정 A의 종료 결과가 반영돼야 한다")
  const generationBefore = useAuthStore.getState().identityGeneration

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

  await rejectAsAckTimeout(clock, fake.emitWithAckCalls[1])

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

  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  await act(async () => {
    fake.emitWithAckCalls[2].resolve(endedSnapshotResponse({ gameId: "g-auth" }))
    await flushMicrotasks()
  })
  assert.equal(hasResultNavigationBasis(), true, "현재 신원의 정상 스냅샷 뒤에도 결과 이동이 막혀 있다")

  hook.unmount()
})

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

  await emitConnect(fake, () => { fake.socket.id = "sock-2" })
  assert.equal(getInGameSnapshotRebindPending(), true, "전제: 재연결이 재결속 보류를 열어야 한다")
  assert.equal(fake.emitWithAckCalls.length, 2, "전제: 그 연결이 현재 신원의 스냅샷을 물어야 한다")
  const staleRequest = fake.emitWithAckCalls[1]

  useInGameStore.getState().state.players[0].membershipId = "mem-2"

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

const { selectInGameDeadParticipantChoice } = await import("../../../../../src/domains/game/ingame/utils/selectInGameDeadParticipantChoice.js")
const { resolveInGameSelfAliveForControls } = await import("../../../../../src/domains/game/ingame/utils/selfAlive.js")

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
  response.players = response.players.map((p) => ({ ...p, isAlive: false }))

  const state = await restoreFromSnapshot(response)

  assert.equal(state.nightResult.victimUuid, "player-1")
  assert.equal(state.players.find((p) => p.uuid === "player-1").alive, false)
  assert.equal(selectInGameDeadParticipantChoice(state, "player-1"), true)
  assert.equal(resolveInGameSelfAliveForControls(state, null), false)
})

const readSuccessQueue = () => useInGameStore.getState().nightSuccessQueue

function readCurrentAuthScopeForTest() {
  const auth = useAuthStore.getState()
  return {
    accountId: auth.isLoggedIn && auth.user?.uuid ? auth.user.uuid : null,
    identityGeneration: auth.identityGeneration ?? null,
  }
}

function recoveryPayload({
  gameId = "g1", nightDayIndex = 0, eventId = "ev-recover-1", type = "KILL", perspectives = ["TARGET"],
} = {}) {
  const payload = { gameId, nightDayIndex, eventId, type, perspectives: [...perspectives] }
  if (perspectives.includes("USER")) payload.targetId = "player-2"
  return payload
}

function snapshotWithRecovery(recovery, { gameId = "g1", playerUuid = "player-1", phase = "NIGHT", dayIndex = 0 } = {}) {
  return {
    ...buildValidSnapshotResponse({ gameId, playerUuid, phase, dayIndex }),
    nightSuccessRecovery: recovery,
  }
}

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
  assert.deepEqual(Object.keys(readSuccessQueue()[0]).sort(),
    ["eventId", "gameId", "nightDayIndex", "perspectives", "type"])

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
  const scope = readInGameReceiptScope(readCurrentAuthScopeForTest())
  assert.equal(useInGameStore.getState().completeNightSuccess(payload.eventId, scope).status, "sent")
  assert.deepEqual(readSuccessQueue(), [])

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

  await act(async () => { fake.socket.triggerConnect() })
  await act(async () => {
    fake.emitWithAckCalls[1].resolve(buildValidSnapshotResponse({ gameId: "g1", phase: "NIGHT", dayIndex: 0 }))
    await flushMicrotasks()
  })
  assert.equal(readSuccessQueue().length, 1, "같은 밤 재적용이 큐를 비웠다")

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

function installRetryClock() {
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  const realNow = Date.now
  const scheduled = new Map()
  let now = 1_000_000
  let seq = 0

  globalThis.setTimeout = (fn, delay, ...rest) => {
    if (delay !== 250) return realSetTimeout(fn, delay, ...rest)
    seq += 1
    const id = `retry-timer-${seq}`
    scheduled.set(id, { fn, dueAt: now + delay })
    return id
  }
  globalThis.clearTimeout = (id) => {
    if (scheduled.delete(id)) return undefined
    return realClearTimeout(id)
  }
  Date.now = () => now

  async function fireDue() {
    for (;;) {
      let dueId = null
      let due = null
      for (const [id, entry] of scheduled) {
        if (entry.dueAt <= now && (due === null || entry.dueAt < due.dueAt)) {
          dueId = id
          due = entry
        }
      }
      if (due === null) return
      scheduled.delete(dueId)
      await act(async () => {
        due.fn()
        await flushMicrotasks()
      })
    }
  }

  return {
    async advance(ms) {
      now += ms
      await fireDue()
    },
    skip(ms) { now += ms },
    pending: () => scheduled.size,
    restore() {
      globalThis.setTimeout = realSetTimeout
      globalThis.clearTimeout = realClearTimeout
      Date.now = realNow
      scheduled.clear()
    },
  }
}

async function rejectAsAckTimeout(clock, request) {
  clock.skip(6000)
  await act(async () => {
    request.reject(new Error("operation has timed out"))
    await flushMicrotasks()
  })
}

function createFailingTransportSocket({ id = "sock-1" } = {}) {
  const fake = createFakeSessionSnapshotSocket()
  fake.socket.connected = true
  fake.socket.id = id
  fake.attempts = 0
  fake.failing = true
  const sendAck = fake.socket.emitWithAck.bind(fake.socket)
  fake.socket.emitWithAck = (event, payload) => {
    fake.attempts += 1
    if (fake.failing) throw new Error("transport closed")
    return sendAck(event, payload)
  }
  return fake
}

test("F-26(AC-06): 예약된 재조회는 실행 시점에 예산을 다시 검사한다 — 총 5초 밖에서는 전송하지 않고 failed로 끝난다", async () => {
  useInGameStore.setState({ gameId: null, state: null, error: null })
  seedAuth("player-1")
  const clock = installRetryClock()
  try {
    const fake = createFailingTransportSocket()
    setFakeSocket(fake.socket)
    const hook = renderHook(() => useInGameSessionSnapshotSync())

    assert.equal(fake.attempts, 1, "전제: 마운트가 첫 시도를 보내야 한다")
    assert.equal(hook.result.current, "checking",
      "재시도 예산이 남았는데 첫 전송 실패가 곧바로 실패로 확정됐다")
    assert.equal(clock.pending(), 1, "전제: 남은 예산으로 재조회가 예약돼야 한다")

    clock.skip(6000)
    await clock.advance(0)

    assert.equal(fake.attempts, 1, "총 5초 예산을 넘긴 뒤에도 예약된 재조회가 전송됐다")
    assert.equal(hook.result.current, "failed", "예산이 끝났는데 화면이 확인 중에 갇혔다")
    assert.equal(clock.pending(), 0, "끝난 세대의 예약이 남았다")

    hook.unmount()
  } finally {
    clock.restore()
  }
})

test("F-26(AC-06): 같은 연결의 재조회는 최대 20회까지만 나가고 그 뒤로는 한 번도 더 묻지 않는다", async () => {
  useInGameStore.setState({ gameId: null, state: null, error: null })
  seedAuth("player-1")
  const clock = installRetryClock()
  try {
    const fake = createFailingTransportSocket()
    setFakeSocket(fake.socket)
    const hook = renderHook(() => useInGameSessionSnapshotSync())

    assert.equal(fake.attempts, 1)
    for (let i = 0; i < 30; i += 1) await clock.advance(250)

    assert.equal(fake.attempts, 20, "재조회 상한(최초 시도 포함 20회)이 지켜지지 않았다")
    assert.equal(clock.pending(), 0, "상한에 닿은 뒤에도 예약이 남았다")
    assert.equal(hook.result.current, "failed", "상한에 닿았는데 화면이 확인 중에 갇혔다")

    hook.unmount()
  } finally {
    clock.restore()
  }
})

test("F-26(AC-01): 일시적인 전송 실패 뒤 다음 재조회가 성공하면 그 응답이 정상 경로로 복원한다", async () => {
  seedStore({ gameId: "g1", playerUuid: "player-1" })
  seedAuth("player-1")
  const clock = installRetryClock()
  try {
    const fake = createFailingTransportSocket()
    setFakeSocket(fake.socket)
    const hook = renderHook(() => useInGameSessionSnapshotSync())

    assert.equal(fake.attempts, 1)
    assert.equal(fake.emitWithAckCalls.length, 0, "전제: 첫 시도는 아무 것도 보내지 못했다")

    fake.failing = false
    await clock.advance(250)
    assert.equal(fake.attempts, 2, "전송 실패 뒤 예약된 재조회가 나가지 않았다")
    assert.equal(fake.emitWithAckCalls.length, 1)
    assert.deepEqual(fake.emitWithAckCalls[0].payload, { gameId: "g1" })

    const payload = recoveryPayload()
    const seqBefore = useInGameStore.getState().snapshotSeq
    await act(async () => {
      fake.emitWithAckCalls[0].resolve(snapshotWithRecovery([payload]))
      await flushMicrotasks()
    })

    assert.equal(useInGameStore.getState().snapshotSeq, seqBefore + 1,
      "회복된 재조회의 응답이 상태를 세우지 못했다")
    assert.deepEqual(readSuccessQueue().map((e) => e.eventId), [payload.eventId],
      "회복된 재조회의 응답으로 복원되지 않았다")
    assert.equal(clock.pending(), 0, "성공한 세대의 예약이 남았다")

    hook.unmount()
  } finally {
    clock.restore()
  }
})

async function rejectEarly(request) {
  await act(async () => {
    request.reject(new Error("connection closed before ack"))
    await flushMicrotasks()
  })
}

test("F-26(AC-01): 예산 안에서 일찍 거부된 전송은 실패로 굳지 않고, 다음 시도의 성공이 그대로 복원한다", async (t) => {
  const clock = installRetryClock()
  t.after(() => clock.restore())
  const { fake, hook } = openConnectedHook({ empty: true })
  assert.equal(fake.emitWithAckCalls.length, 1, "전제: 마운트가 한 번 물어야 한다")

  await rejectEarly(fake.emitWithAckCalls[0])

  assert.equal(hook.result.current, "checking",
    "예산이 남았는데 이른 비동기 거부가 곧바로 실패로 확정됐다")
  assert.equal(clock.pending(), 1, "이른 비동기 거부 뒤 같은 연결의 재조회가 예약되지 않았다")

  await clock.advance(250)
  assert.equal(fake.emitWithAckCalls.length, 2, "예약된 재조회가 나가지 않았다")
  assert.deepEqual(fake.emitWithAckCalls[1].payload, {}, "빈 store의 재조회는 gameId 없이 묻는다")

  const payload = recoveryPayload()
  await act(async () => {
    fake.emitWithAckCalls[1].resolve(snapshotWithRecovery([payload]))
    await flushMicrotasks()
  })

  assert.equal(useInGameStore.getState().gameId, "g1", "회복된 재조회의 응답이 복원하지 못했다")
  assert.deepEqual(readSuccessQueue().map((e) => e.eventId), [payload.eventId],
    "이른 거부 뒤 성공한 재조회로 큐가 복원되지 않았다")
  assert.equal(hook.result.current, "recovered", "복원에 성공했는데 화면이 실패로 남았다")
  assert.equal(getInGameSnapshotRebindPending(), false)
  assert.equal(clock.pending(), 0, "성공한 세대의 예약이 남았다")

  hook.unmount()
})

test("F-26(AC-06): 이른 비동기 거부가 예산이 다할 때까지 이어지면 failed로 끝나고 전송 횟수는 상한을 넘지 않는다", async (t) => {
  const clock = installRetryClock()
  t.after(() => clock.restore())
  const { fake, hook } = openConnectedHook({ empty: true })

  for (let i = 0; i < 40; i += 1) {
    const attempt = fake.emitWithAckCalls[i]
    if (attempt) await rejectEarly(attempt)
    if (clock.pending() === 0) break
    await clock.advance(250)
  }

  assert.equal(fake.emitWithAckCalls.length, 20,
    "이른 거부가 이어질 때 전송 횟수가 상한(최초 시도 포함 20회)을 지키지 않았다")
  assert.equal(clock.pending(), 0, "끝난 세대의 예약이 남았다")
  assert.equal(hook.result.current, "failed", "예산·상한이 끝났는데 화면이 확인 중에 갇혔다")
  assert.equal(getInGameSnapshotRebindPending(), false, "보류가 남아 화면이 영영 갇힌다")

  hook.unmount()
})
