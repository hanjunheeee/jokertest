import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// zustand store를 구독하는 훅이라 renderHook이 필요하고, renderHook은 DOM 전역을 요구한다.
// 설치 방식은 기존 훅 테스트(useSoundSettings.test.js)와 동일하다.
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
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useMatchingStore } = await import("../../../matching/store/matchingStore.js")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { useInGameSettingIsHost } = await import("../useInGameSettingIsHost.js")

const HOST_UUID = "uuid-host"
const OTHER_UUID = "uuid-other"

const GAME_STATE = { id: "game-1", phase: "ROLE_REVEAL", dayIndex: 0, players: [] }

function room(hostUuid) {
  return { roomId: "room-1", roomCode: "ABCD", players: [], hostUuid }
}

// useMatchingRoom의 game_started 핸들러와 같은 순서로 방→게임 전환을 재현한다. 이 순서
// (hostUuid 캡처 → setGamePayload → clearRoom)가 방장 정보를 세션에 묶는 유일한 경로다.
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

  // 인게임 진입 직후의 실제 상태 — 방 정보는 이미 비었고 세션만 남아 있다.
  assert.equal(useMatchingStore.getState().hostUuid, null, "clearRoom이 방장을 비운다")
  assert.equal(useInGameStore.getState().hostUuid, HOST_UUID, "방장은 세션에 묶여 남는다")

  assert.equal(isHostNow(), true)
})

test("이전 게임의 방장 정보는 다음 세션으로 새지 않는다", () => {
  // 지난 판에서 내가 방장이었다.
  enterGame({ authUuid: HOST_UUID, roomPayload: room(HOST_UUID) })
  assert.equal(isHostNow(), true)

  // 그 판이 끝나 세션이 정리되면 방장 정보도 함께 사라진다.
  act(() => useInGameStore.getState().clearGame())
  assert.equal(useInGameStore.getState().hostUuid, null)
  assert.equal(isHostNow(), false)

  // 다음 판은 다른 사람이 방장이다 — 지난 판의 값이 남아 true가 되면 안 된다.
  enterGame({ authUuid: HOST_UUID, roomPayload: room(OTHER_UUID), gameId: "game-2" })
  assert.equal(isHostNow(), false)
})

test("방장이 사라진(updateHost(null)) 방에서 시작한 세션은 방장 없음으로 본다", () => {
  act(() => {
    useAuthStore.setState({ user: { uuid: HOST_UUID } })
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().setRoom(room(HOST_UUID))
    // host_changed로 방장이 비었다 — 이 시점의 방에는 방장이 없다.
    useMatchingStore.getState().updateHost(null)

    const { hostUuid } = useMatchingStore.getState()
    useInGameStore.getState().setGamePayload({ gameId: "game-3", state: GAME_STATE, hostUuid })
    useMatchingStore.getState().clearRoom()
  })

  assert.equal(useInGameStore.getState().hostUuid, null)
  assert.equal(isHostNow(), false)
})

test("hostUuid 없이 복원된 세션(새로고침 스냅샷)은 방장으로 보지 않는다", () => {
  // 서버 스냅샷에는 hostUuid가 없다 — 알 수 없음은 방장 아님으로 닫는다.
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
