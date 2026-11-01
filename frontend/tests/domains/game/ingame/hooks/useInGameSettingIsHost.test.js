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
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { useInGameStore } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { useInGameSettingIsHost } = await import("../../../../../src/domains/game/ingame/hooks/useInGameSettingIsHost.js")

const HOST_UUID = "uuid-host"
const OTHER_UUID = "uuid-other"

const GAME_STATE = { id: "game-1", phase: "ROLE_REVEAL", dayIndex: 0, players: [] }

function room(hostUuid) {
  return { roomId: "room-1", roomCode: "ABCD", players: [], hostUuid }
}

function enterGame({ authUuid, roomPayload, gameId = "game-1" }) {
  act(() => {
    useAuthStore.setState({ user: authUuid ? { uuid: authUuid } : null })
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().clearRoom()
    if (roomPayload) useMatchingStore.getState().setRoom(roomPayload)

    const { hostUuid } = useMatchingStore.getState()
    useInGameStore.getState().setGamePayload({ gameId, state: GAME_STATE, hostUuid })
    useMatchingStore.getState().clearRoom()
  })
}

function isHostNow() {
  const { result, unmount } = renderHook(() => useInGameSettingIsHost())
  const value = result.current
  unmount()
  return value
}

test("방장이 아니면 false다", () => {
  enterGame({ authUuid: OTHER_UUID, roomPayload: room(HOST_UUID) })

  const { result } = renderHook(() => useInGameSettingIsHost())

  assert.equal(result.current, false)
})

test("방장이면 true다", () => {
  enterGame({ authUuid: HOST_UUID, roomPayload: room(HOST_UUID) })

  const { result } = renderHook(() => useInGameSettingIsHost())

  assert.equal(result.current, true)
})

test("game_started 뒤 clearRoom으로 방 상태가 비어도 이 세션의 방장 판정은 유지된다", () => {
  enterGame({ authUuid: HOST_UUID, roomPayload: room(HOST_UUID) })

  assert.equal(useMatchingStore.getState().hostUuid, null, "clearRoom이 방장을 비운다")
  assert.equal(useInGameStore.getState().hostUuid, HOST_UUID, "방장은 세션에 묶여 남는다")

  assert.equal(isHostNow(), true)
})

test("이전 게임의 방장 정보는 다음 세션으로 새지 않는다", () => {
  enterGame({ authUuid: HOST_UUID, roomPayload: room(HOST_UUID) })
  assert.equal(isHostNow(), true)

  act(() => useInGameStore.getState().clearGame())
  assert.equal(useInGameStore.getState().hostUuid, null)
  assert.equal(isHostNow(), false)

  enterGame({ authUuid: HOST_UUID, roomPayload: room(OTHER_UUID), gameId: "game-2" })
  assert.equal(isHostNow(), false)
})

test("방장이 사라진(updateHost(null)) 방에서 시작한 세션은 방장 없음으로 본다", () => {
  act(() => {
    useAuthStore.setState({ user: { uuid: HOST_UUID } })
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().setRoom(room(HOST_UUID))
    useMatchingStore.getState().updateHost(null)

    const { hostUuid } = useMatchingStore.getState()
    useInGameStore.getState().setGamePayload({ gameId: "game-3", state: GAME_STATE, hostUuid })
    useMatchingStore.getState().clearRoom()
  })

  assert.equal(useInGameStore.getState().hostUuid, null)
  assert.equal(isHostNow(), false)
})

test("hostUuid 없이 복원된 세션(새로고침 스냅샷)은 방장으로 보지 않는다", () => {
  act(() => {
    useAuthStore.setState({ user: { uuid: HOST_UUID } })
    useInGameStore.getState().clearGame()
    useInGameStore.getState().setGamePayload({ gameId: "game-4", state: GAME_STATE })
  })

  assert.equal(useInGameStore.getState().hostUuid, null)
  assert.equal(isHostNow(), false)
})

test("로그인 정보가 없으면 방장으로 보지 않는다", () => {
  enterGame({ authUuid: null, roomPayload: room(HOST_UUID) })

  assert.equal(isHostNow(), false)
})
