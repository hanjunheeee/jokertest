// known 1-2: 역할 확인 알림이 실패·시간 초과면 잠깐 뒤 다시 보냄, 이미 연결된 새 소켓으로 바뀌어도 보냄
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
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook, cleanup } = await import("@testing-library/react")
const { useInGameStore } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useInGameRoleRevealAck } = await import("../../../../../src/domains/game/ingame/hooks/useInGameRoleRevealAck.js")

const GAME_ID = "game-ack"

function createFakeSocket(id) {
  const listeners = new Map()
  const acks = []
  const socket = {
    id,
    connected: true,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    timeout() { return socket },
    emitWithAck(event, payload) {
      let resolve
      let reject
      const promise = new Promise((res, rej) => { resolve = res; reject = rej })
      acks.push({ event, payload, resolve, reject })
      return promise
    },
  }
  return { socket, acks }
}

function seed(phase = "ROLE_REVEAL") {
  useInGameStore.setState({
    gameId: GAME_ID,
    state: { id: GAME_ID, phase, dayIndex: 0, players: [{ uuid: "u1", alive: true }], self: { uuid: "u1" } },
    error: null,
  })
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

test.afterEach(() => {
  cleanup()
  mock.timers.reset()
  act(() => setSocket(null))
})

test("1-2: 알림이 거절되면 잠깐 뒤 다시 보내고, 받아들여지면 멈춘다", async () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  seed()
  const fake = createFakeSocket("s1")
  act(() => setSocket(fake.socket))
  const hook = renderHook(() => useInGameRoleRevealAck())
  assert.equal(fake.acks.length, 1)

  await act(async () => { fake.acks[0].resolve({ ok: false, message: "잠시 실패" }); await flush() })
  assert.equal(hook.result.current.status, "idle")
  assert.equal(fake.acks.length, 1)

  await act(async () => { mock.timers.tick(1500); await flush() })
  assert.equal(fake.acks.length, 2, "실패 뒤 다시 보내지 않았다")
  assert.deepEqual(fake.acks[1].payload, { gameId: GAME_ID })

  await act(async () => { fake.acks[1].resolve({ ok: true }); await flush() })
  assert.equal(hook.result.current.status, "acked")
  await act(async () => { mock.timers.tick(5000); await flush() })
  assert.equal(fake.acks.length, 2)
})

test("1-2: 시간 초과(응답 없음)도 다시 보낸다", async () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  seed()
  const fake = createFakeSocket("s1")
  act(() => setSocket(fake.socket))
  renderHook(() => useInGameRoleRevealAck())
  await act(async () => { fake.acks[0].reject(new Error("timeout")); await flush() })
  await act(async () => { mock.timers.tick(1500); await flush() })
  assert.equal(fake.acks.length, 2)
})

test("1-2: 역할 공개가 끝난 단계면 실패해도 다시 보내지 않는다", async () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  seed("DAY")
  const fake = createFakeSocket("s1")
  act(() => setSocket(fake.socket))
  renderHook(() => useInGameRoleRevealAck())
  await act(async () => { fake.acks[0].resolve({ ok: false }); await flush() })
  await act(async () => { mock.timers.tick(10_000); await flush() })
  assert.equal(fake.acks.length, 1)
})

test("1-2: 다시 보내기는 횟수 제한이 있다", async () => {
  mock.timers.enable({ apis: ["setTimeout"] })
  seed()
  const fake = createFakeSocket("s1")
  act(() => setSocket(fake.socket))
  renderHook(() => useInGameRoleRevealAck())
  for (let i = 0; i < 10; i += 1) {
    const last = fake.acks[fake.acks.length - 1]
    await act(async () => { last.resolve({ ok: false }); await flush() })
    await act(async () => { mock.timers.tick(1500); await flush() })
  }
  assert.equal(fake.acks.length, 6, "처음 1번 + 다시 5번")
})

test("1-2: 이미 연결된 새 소켓으로 바뀌면 connect 사건 없이도 다시 알린다", async () => {
  seed()
  const first = createFakeSocket("s1")
  act(() => setSocket(first.socket))
  renderHook(() => useInGameRoleRevealAck())
  assert.equal(first.acks.length, 1)

  const second = createFakeSocket("s2")
  await act(async () => { setSocket(second.socket); await flush() })
  assert.equal(second.acks.length, 1, "새 소켓으로 알리지 않았다")
  assert.equal(first.acks.length, 1)
})
