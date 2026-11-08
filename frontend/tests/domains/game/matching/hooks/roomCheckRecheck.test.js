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
const { FAILED_RECHECK_MS } = await import("../../../../../src/domains/game/matching/constants/roomTiming.js")

const ME = "uuid-host"
const room = {
  roomId: "room-1", roomCode: "CODE11", roomInstanceId: "inst-1", bootEpoch: "boot-1",
  hostUuid: ME, canStart: false, settings: { maxPlayers: 8 }, settingsVersion: 1,
  players: [{ uuid: ME, nickname: "나", isReady: false, membershipId: "m1" }],
}
const stableCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }

test("known 3장: 방 확인 실패 창에서 취소해도 잠시 뒤 다시 확인해 막힘이 풀림", async () => {
  let answers = 0
  const socket = {
    id: "s1", connected: true,
    on() {}, off() {}, emit() {},
    timeout() { return socket },
    emitWithAck(event) {
      if (event !== "get_current_room") return Promise.resolve({ ok: true })
      answers += 1
      return Promise.resolve(answers === 1 ? { ok: false } : { ok: true, room })
    },
  }
  act(() => {
    useAuthStore.setState({ user: { uuid: ME }, isLoggedIn: true })
    useMatchingStore.getState().setRoom(room)
  })
  setSocket(socket)
  const { result, unmount } = renderHook(() => useMatchingRoom(stableCallbacks))
  await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, false, "전제: 첫 확인은 실패")
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, FAILED_RECHECK_MS + 300)) })
  assert.equal(result.current.isRoomVerified, true)
  unmount()
  cleanup()
  setSocket(null)
  act(() => { useMatchingStore.getState().clearRoom() })
})
