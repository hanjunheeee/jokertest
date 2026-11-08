import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { register } from "node:module"
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
installDomGlobal("alert", () => {})
installDomGlobal("confirm", () => false)

register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { renderHook, cleanup } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { useMatchingRoom } = await import("../../../../../src/domains/game/matching/hooks/useMatchingRoom.js")
const { ROOM_MESSAGES } = await import("../../../../../src/domains/game/matching/constants/roomMessages.js")

const ME = "uuid-guest"

// 파티 방 묻기엔 방 코드를, 지금 방 묻기엔 방 없음을 답하는 가짜 소켓
function createPartySocket() {
  const emitted = []
  const listeners = new Map()
  const socket = {
    id: "sock-party",
    connected: true,
    emitted,
    emit(event, payload, ack) { emitted.push({ event, payload }); if (typeof ack === "function") ack({ ok: true, room: null }) },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    timeout() { return socket },
    emitWithAck(event, payload) {
      emitted.push({ event, payload })
      if (event === "get_party_matching_room") {
        return Promise.resolve({ ok: true, gameId: "game-1", room: { roomId: "room-9", roomCode: "PARTY9" } })
      }
      return Promise.resolve({ ok: true, room: null })
    },
  }
  return socket
}

test.afterEach(() => {
  cleanup()
  act(() => {
    useMatchingStore.getState().clearRoom()
    useAuthStore.setState({ user: null, isLoggedIn: false })
  })
  setSocket(null)
})

// 콜백은 고정 (바뀌면 방 확인 효과가 다시 붙음)
const stableCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }

async function mountAwaiting(socket, onPartyRejoinFailed) {
  act(() => {
    useAuthStore.setState({ user: { uuid: ME }, isLoggedIn: true })
    useMatchingStore.getState().clearRoom()
  })
  setSocket(socket)
  const rendered = renderHook(() => useMatchingRoom({
    ...stableCallbacks,
    endedGameId: "game-1",
    awaitPartyRoomRejoin: true,
    onPartyRejoinFailed,
  }))
  await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve() })
  return rendered
}

test("FE-005: 파티 방 입장이 '방 없음'으로 거절되면 기다림을 그만두고 알림", async () => {
  const socket = createPartySocket()
  const failures = []
  await mountAwaiting(socket, (message) => failures.push(message))
  assert.ok(socket.emitted.some((entry) => entry.event === "join_room_by_code"), "파티 방 입장 요청을 안 보냈다")
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_NOT_FOUND", message: "방 없음" }) })
  assert.deepEqual(failures, [ROOM_MESSAGES.PARTY_ROOM_GONE])
})

test("FE-005: 다시 하면 될 거절(요청 중)은 그만두지 않고 다음 묻기 때 다시 시도", async () => {
  const socket = createPartySocket()
  const failures = []
  await mountAwaiting(socket, (message) => failures.push(message))
  act(() => { socket.trigger("room_join_failed", { code: "REQUEST_IN_PROGRESS" }) })
  assert.deepEqual(failures, [])
})

test("FE-005: 내가 보낸 입장 요청이 없을 때 온 거절은 무시", async () => {
  const socket = createPartySocket()
  const failures = []
  await mountAwaiting(socket, (message) => failures.push(message))
  act(() => { socket.trigger("room_join_failed", { code: "REQUEST_IN_PROGRESS" }) })
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_NOT_FOUND" }) })
  assert.deepEqual(failures, [])
})
