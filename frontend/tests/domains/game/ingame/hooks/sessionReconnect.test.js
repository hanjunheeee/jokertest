// FE-001: 판 도중 잠깐 끊김 → 판 안 지움, 다시 붙으면 스냅샷 다시 묶기로 판에 돌아옴
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true })

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

const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})

const { renderHook, cleanup } = await import("@testing-library/react")
const { useInGameStore } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../../../../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { useInGameSessionSnapshotSync } = await import("../../../../../src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js")

const GAME_ID = "game-reconnect"
const SELF = "uuid-self"
const OTHER = "uuid-other"

function createFakeSocket() {
  const listeners = new Map()
  const asks = []
  const socket = {
    id: "sock-1",
    connected: true,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    emit() {},
    timeout() {
      return socket
    },
    emitWithAck(event, payload) {
      let resolve
      const promise = new Promise((res) => { resolve = res })
      asks.push({ event, payload, resolve })
      return promise
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
  }
  return { socket, asks }
}

function seedGame() {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF, nickname: "나" }, identityGeneration: 0 })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase: "NIGHT",
        dayIndex: 1,
        players: [
          { uuid: SELF, nickname: "나", alive: true, isConnected: true },
          { uuid: OTHER, nickname: "너", alive: true, isConnected: true },
        ],
        self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      },
    })
  })
}

function dayTwoSnapshot() {
  return {
    ok: true,
    gameId: GAME_ID,
    phase: "DAY",
    dayIndex: 2,
    dayPhase: "DAY_DISCUSSION",
    players: [
      { uuid: SELF, nickname: "나", isAlive: true, isConnected: true },
      { uuid: OTHER, nickname: "너", isAlive: true, isConnected: true },
    ],
    self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
  }
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

async function open() {
  navigateCalls.length = 0
  const fake = createFakeSocket()
  act(() => setSocket(fake.socket))
  const rendered = renderHook(() => {
    useGameSessionSocketEvents()
    return useInGameSessionSnapshotSync()
  })
  // 처음 붙을 때 묻는 스냅샷은 지금 판 그대로 답함
  await act(async () => { await flush() })
  return { fake, rendered }
}

async function dropAndReconnect(fake) {
  await act(async () => {
    fake.socket.connected = false
    fake.socket.deliver("disconnect", "transport close")
    await flush()
  })
  await act(async () => {
    fake.socket.connected = true
    fake.socket.id = "sock-2"
    fake.socket.deliver("connect")
    await flush()
  })
}

test.afterEach(() => {
  cleanup()
  act(() => setSocket(null))
})

test("FE-001: 잠깐 끊겨도 판을 지우지 않고 멀티 화면으로 보내지 않는다", async () => {
  seedGame()
  const { fake } = await open()

  await act(async () => {
    fake.socket.connected = false
    fake.socket.deliver("disconnect", "transport close")
    await flush()
  })

  assert.equal(useInGameStore.getState().gameId, GAME_ID)
  assert.equal(useInGameStore.getState().state?.phase, "NIGHT")
  assert.deepEqual(navigateCalls, [])
})

test("FE-001: 다시 붙으면 스냅샷을 다시 물어 그 사이 바뀐 판으로 돌아온다", async () => {
  seedGame()
  const { fake } = await open()
  const { asks } = fake
  const asksBefore = asks.length

  await dropAndReconnect(fake)

  const reask = asks.slice(asksBefore).find((ask) => ask.event === "get_session_snapshot")
  assert.ok(reask, "다시 붙은 뒤 스냅샷을 묻지 않았다")
  assert.deepEqual(reask.payload, { gameId: GAME_ID })

  await act(async () => {
    reask.resolve(dayTwoSnapshot())
    await flush()
  })

  const { gameId, state } = useInGameStore.getState()
  assert.equal(gameId, GAME_ID)
  assert.equal(state.phase, "DAY")
  assert.equal(state.dayIndex, 2)
  assert.deepEqual(navigateCalls, [])
})

for (const code of ["SESSION_NOT_FOUND", "NOT_A_PARTICIPANT", "FORFEITED_FROM_SESSION"]) {
  test(`FE-001: 다시 붙은 뒤 스냅샷이 판 없음(${code})이면 판·방을 정리한다`, async () => {
    seedGame()
    let roomCleared = 0
    const originalClearRoom = useMatchingStore.getState().clearRoom
    useMatchingStore.setState({ clearRoom: () => { roomCleared += 1; originalClearRoom() } })
    try {
      const { fake } = await open()
  const { asks } = fake
      const asksBefore = asks.length
      await dropAndReconnect(fake)
      const reask = asks.slice(asksBefore).find((ask) => ask.event === "get_session_snapshot")
      assert.ok(reask)
      await act(async () => {
        reask.resolve({ ok: false, code, message: "x" })
        await flush()
      })
      assert.equal(useInGameStore.getState().gameId, null)
      assert.equal(roomCleared, 1)
    } finally {
      useMatchingStore.setState({ clearRoom: originalClearRoom })
    }
  })
}

test("FE-001: 판 없음이 아닌 거절(연결 문제 등)이면 판을 지우지 않는다", async () => {
  seedGame()
  const { fake } = await open()
  const { asks } = fake
  const asksBefore = asks.length
  await dropAndReconnect(fake)
  const reask = asks.slice(asksBefore).find((ask) => ask.event === "get_session_snapshot")
  await act(async () => {
    reask.resolve({ ok: false, code: "INTERNAL_ERROR", message: "x" })
    await flush()
  })
  assert.equal(useInGameStore.getState().gameId, GAME_ID)
})

test("known 3장 useSessionConnection 다시 구독 틈: 다시 붙은 바로 그 틱에 온 판 사건도 받는다", async () => {
  seedGame()
  const { fake } = await open()
  await act(async () => {
    fake.socket.connected = false
    fake.socket.deliver("disconnect", "transport close")
    await flush()
  })
  const before = useInGameStore.getState().state
  // 다시 붙자마자(화면이 다시 그려지기 전) 이모지 사건이 옴
  act(() => {
    fake.socket.connected = true
    fake.socket.id = "sock-2"
    fake.socket.deliver("connect")
    fake.socket.deliver("emoji_shown", { gameId: GAME_ID, uuid: OTHER, itemId: "emo-1", sentAt: Date.now() })
  })
  assert.equal(useInGameStore.getState().state, before)
  const { useInGameEmojiBubbleStore } = await import("../../../../../src/domains/game/ingame/store/inGameEmojiBubble.store.js")
  const bubbles = JSON.stringify(useInGameEmojiBubbleStore.getState())
  assert.match(bubbles, /emo-1/, "다시 붙은 틈에 온 이모지가 버려졌다")
})

test("known 3장 useInGameSessionSnapshotSync: 다시 묶기 기다리는 중 로그아웃하면 기다림 표시를 끈다", async () => {
  const { getInGameSnapshotRebindPending } = await import("../../../../../src/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js")
  seedGame()
  const { fake } = await open()
  await dropAndReconnect(fake)
  assert.equal(getInGameSnapshotRebindPending(), true)
  act(() => {
    useAuthStore.setState({ isLoggedIn: false, user: null, identityGeneration: 1 })
  })
  assert.equal(getInGameSnapshotRebindPending(), false)
})
