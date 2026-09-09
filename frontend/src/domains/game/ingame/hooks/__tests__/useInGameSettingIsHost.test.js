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
const { useInGameSettingIsHost } = await import("../useInGameSettingIsHost.js")

const HOST_UUID = "uuid-host"
const OTHER_UUID = "uuid-other"

// 각 테스트가 같은 모듈 store를 공유하므로, 방장 관련 필드를 모두 비운 상태에서 시작한다
// (clearRoom은 의도적으로 lastHostUuid를 남기므로 기준선 초기화에 쓸 수 없다).
function setStores({ authUuid, roomPayload }) {
  act(() => {
    useAuthStore.setState({ user: authUuid ? { uuid: authUuid } : null })
    useMatchingStore.setState({ hostUuid: null, lastHostUuid: null })
    if (roomPayload) useMatchingStore.getState().setRoom(roomPayload)
  })
}

function room(hostUuid) {
  return { roomId: "room-1", roomCode: "ABCD", players: [], hostUuid }
}

test("방장이 아니면 false다", () => {
  setStores({ authUuid: OTHER_UUID, roomPayload: room(HOST_UUID) })

  const { result } = renderHook(() => useInGameSettingIsHost())

  assert.equal(result.current, false)
})

test("방장이면 true다", () => {
  setStores({ authUuid: HOST_UUID, roomPayload: room(HOST_UUID) })

  const { result } = renderHook(() => useInGameSettingIsHost())

  assert.equal(result.current, true)
})

test("game_started 뒤 clearRoom으로 방 상태가 비어도 방장 판정은 유지된다", () => {
  // useMatchingRoom의 game_started 핸들러는 인게임 진입 직후 clearRoom()을 부른다.
  setStores({ authUuid: OTHER_UUID, roomPayload: room(HOST_UUID) })
  act(() => {
    useMatchingStore.getState().clearRoom()
  })

  assert.equal(useMatchingStore.getState().hostUuid, null, "hostUuid는 clearRoom이 비운다")
  assert.equal(useMatchingStore.getState().lastHostUuid, HOST_UUID)

  const notHost = renderHook(() => useInGameSettingIsHost())
  assert.equal(notHost.result.current, false)
  notHost.unmount()

  act(() => {
    useAuthStore.setState({ user: { uuid: HOST_UUID } })
  })
  const isHost = renderHook(() => useInGameSettingIsHost())
  assert.equal(isHost.result.current, true)
  isHost.unmount()
})

test("방장 정보나 로그인 정보가 없으면 방장으로 보지 않는다", () => {
  // 방 정보를 한 번도 받지 못한 경우(방장 uuid 없음)
  setStores({ authUuid: HOST_UUID, roomPayload: null })
  const noHost = renderHook(() => useInGameSettingIsHost())
  assert.equal(noHost.result.current, false)
  noHost.unmount()

  // 로그인 정보가 없는 경우
  setStores({ authUuid: null, roomPayload: room(HOST_UUID) })
  const noAuth = renderHook(() => useInGameSettingIsHost())
  assert.equal(noAuth.result.current, false)
  noAuth.unmount()
})
