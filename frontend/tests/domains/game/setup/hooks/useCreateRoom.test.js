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
const { useCreateRoom } = await import("../../../../../src/domains/game/setup/hooks/useCreateRoom.js")

test("known 3장: 방 만드는 중 화면을 떠나면 늦게 온 방을 대기방에 안 넣고 서버 방에서 나감", async () => {
  let release
  const late = new Promise((resolve) => { release = resolve })
  const emitted = []
  const socket = {
    id: "s1", connected: true,
    on() {}, off() {},
    emit(event) { emitted.push(event) },
    timeout() { return socket },
    emitWithAck() { return late },
  }
  act(() => {
    useAuthStore.setState({ user: { uuid: "me" }, isLoggedIn: true })
    useMatchingStore.getState().clearRoom()
  })
  setSocket(socket)
  const navigations = []
  const identityGeneration = useAuthStore.getState().identityGeneration
  const { result, unmount } = renderHook(() => useCreateRoom({
    navigate: (to) => navigations.push(to), accountId: "me", identityGeneration,
  }))
  let pending
  act(() => { pending = result.current.createGame({ maxPlayers: 8 }) })
  unmount()
  release({ ok: true, room: { roomId: "r1", roomCode: "ABC123", players: [], hostUuid: "me" } })
  await pending
  assert.equal(useMatchingStore.getState().isInRoom, false)
  assert.deepEqual(navigations, [])
  assert.ok(emitted.includes("leave_room"))
  cleanup()
  setSocket(null)
})
