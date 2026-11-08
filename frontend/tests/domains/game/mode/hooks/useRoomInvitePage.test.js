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

const { mock } = await import("node:test")
mock.module("react-router-dom", { namedExports: { useNavigate: () => () => {}, useLocation: () => ({ state: null }) } })
const { renderHook, cleanup } = await import("@testing-library/react")
await import("../../../../../src/domains/auth/store/auth.store.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useRoomInvitePage } = await import("../../../../../src/domains/game/mode/hooks/useRoomInvitePage.js")

function fakeSocket() {
  const emitted = []
  const listeners = new Map()
  return {
    id: "s1", connected: true, emitted,
    emit(event, payload) { emitted.push({ event, payload }) },
    on(event, handler) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler) },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger(event, payload) { for (const handler of [...(listeners.get(event) ?? [])]) handler(payload) },
  }
}

test("known 3장: 방 코드 입장은 결과 오기 전 연타해도 한 번만 보내고, 실패가 오면 다시 보낼 수 있음", async () => {
  const socket = fakeSocket()
  setSocket(socket)
  const alerts = []
  globalThis.alert = (message) => alerts.push(message)
  const { result } = renderHook(() => useRoomInvitePage())
  act(() => { result.current.setRoomCode("ABC123") })
  act(() => { result.current.joinRoom() })
  act(() => { result.current.joinRoom() })
  assert.equal(socket.emitted.filter((entry) => entry.event === "join_room_by_code").length, 1)
  assert.equal(result.current.isJoining, true)
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_FULL" }) })
  assert.equal(result.current.isJoining, false)
  assert.equal(alerts.length, 1)
  act(() => { result.current.joinRoom() })
  assert.equal(socket.emitted.filter((entry) => entry.event === "join_room_by_code").length, 2)
  cleanup()
  setSocket(null)
})

test("FE-032 같은 원인: 내가 안 보낸 입장 실패 방송은 무시", () => {
  const socket = fakeSocket()
  setSocket(socket)
  const alerts = []
  globalThis.alert = (message) => alerts.push(message)
  renderHook(() => useRoomInvitePage())
  act(() => { socket.trigger("room_join_failed", { code: "ROOM_FULL" }) })
  assert.equal(alerts.length, 0)
  cleanup()
  setSocket(null)
})
