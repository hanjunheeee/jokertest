// known 3장 useInGameJokerChatSession: 보내는 중에 연결이 끊기면 "전송 중"이 풀리고 받은 메시지는 남음
import test from "node:test"
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
const { useInGameJokerChatSession } = await import("../../../../../src/domains/game/ingame/hooks/useInGameJokerChatSession.js")

const GAME_ID = "game-joker-chat"

function createFakeSocket() {
  const listeners = new Map()
  const sends = []
  const socket = {
    id: "s1",
    connected: true,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    timeout() { return socket },
    emitWithAck(event, payload) {
      sends.push({ event, payload })
      return new Promise(() => {})
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
  }
  return { socket, sends }
}

test.afterEach(() => {
  cleanup()
  act(() => setSocket(null))
})

test("3장: 보내는 중 연결이 끊기면 전송 중 표시가 풀린다", () => {
  useInGameStore.setState({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase: "NIGHT",
      dayIndex: 1,
      players: [{ uuid: "u1", alive: true }, { uuid: "u2", alive: true }],
      self: { uuid: "u1", role: "JOKER", team: "JOKER" },
    },
    error: null,
  })
  const fake = createFakeSocket()
  act(() => setSocket(fake.socket))
  const hook = renderHook(() => useInGameJokerChatSession())

  act(() => hook.result.current.setDraft("안녕"))
  act(() => hook.result.current.send())
  assert.equal(fake.sends.length, 1)
  assert.equal(hook.result.current.status, "sending")

  act(() => {
    fake.socket.connected = false
    fake.socket.deliver("disconnect", "transport close")
  })
  assert.equal(hook.result.current.status, "idle")
  assert.equal(hook.result.current.draft, "안녕", "입력한 글은 남아야 함")
})

function seedJokerState(phase) {
  useInGameStore.setState({
    gameId: GAME_ID,
    state: {
      id: GAME_ID,
      phase,
      dayIndex: 1,
      players: [{ uuid: "u1", alive: true }, { uuid: "u2", alive: true }],
      self: { uuid: "u1", role: "JOKER", team: "JOKER" },
    },
    error: null,
  })
}

const chatPayload = (text) => ({ gameId: GAME_ID, senderUuid: "u2", messageId: `m-${text}`, sentAt: 10, text })

test("인터넷이 끊겼으면 보내지 않고 끊김 문구, 입력한 글은 남음 (다시 연결될 때 늦게 가서 두 번 가는 것 막기)", () => {
  seedJokerState("NIGHT")
  const fake = createFakeSocket()
  act(() => setSocket(fake.socket))
  const hook = renderHook(() => useInGameJokerChatSession())
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true })
  try {
    act(() => hook.result.current.setDraft("늦은 말"))
    act(() => hook.result.current.send())
    assert.equal(fake.sends.length, 0, "끊긴 채로는 안 보냄")
    assert.match(hook.result.current.error ?? "", /인터넷 연결이 끊겨/)
    assert.equal(hook.result.current.draft, "늦은 말")
  } finally {
    delete globalThis.navigator.onLine
  }
  act(() => hook.result.current.send())
  assert.equal(fake.sends.length, 1, "다시 연결되면 보냄")
})

test("밤으로 바뀐 직후(화면 다시 그리기 전) 온 같은 직업 말도 받음, 낮에 온 말은 버림", () => {
  seedJokerState("DAY")
  const fake = createFakeSocket()
  act(() => setSocket(fake.socket))
  const getPlayerById = (id) => ({ id, nickname: id })
  const hook = renderHook(() => useInGameJokerChatSession({ getPlayerById }))

  act(() => fake.socket.deliver("joker_chat_message", chatPayload("낮말")))
  act(() => {
    // 스토어만 밤으로 바뀌고 바로 말이 옴 (effect가 다시 돌기 전)
    seedJokerState("NIGHT")
    fake.socket.deliver("joker_chat_message", chatPayload("첫말"))
  })
  assert.deepEqual(hook.result.current.messages.map((m) => m.text), ["첫말"])
})
