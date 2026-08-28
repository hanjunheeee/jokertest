import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

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

// 훅이 최상단에서 import하는 socketClient를 제어 가능한 fake로 교체한다(useInGameGameChatSession
// 테스트와 동일한 관례) — mock.module은 아직 로드되지 않은 specifier에만 적용되므로 훅 모듈은
// 등록 이후 동적 import로 가져온다.
let currentFakeSocket = null
const fakeSocketSubscribers = new Set()

function fakeGetSocket() {
  return currentFakeSocket
}

function fakeSubscribeSocket(callback) {
  fakeSocketSubscribers.add(callback)
  return () => {
    fakeSocketSubscribers.delete(callback)
  }
}

function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of [...fakeSocketSubscribers]) callback()
}

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: { getSocket: fakeGetSocket, subscribeSocket: fakeSubscribeSocket },
})

const { useInGameStore } = await import("../../store/ingameStore.js")
const { useInGameResolveNight } = await import("../useInGameResolveNight.js")

const GAME_ID = "game-1"

function createFakeSocket() {
  const handlers = new Map()

  const socket = {
    connected: true,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(handler)
    },
    off(event, handler) {
      handlers.get(event)?.delete(handler)
    },
    timeout() {
      return socket
    },
    emitWithAck() {
      return new Promise(() => {}) // 이 파일은 방송 수신 경로만 검증한다
    },
    trigger(event, payload) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(payload)
    },
  }

  return socket
}

/** gameId만 store에 심는다 — 이 훅은 store에서 gameId 하나만 읽는다. */
function seedStore(gameId = GAME_ID) {
  useInGameStore.setState({ gameId, state: null, error: null })
}

/** 그 밤(dayIndex)의 개인 결과 방송 payload. */
function nightActionResultPayload(dayIndex, extra = {}) {
  return { gameId: GAME_ID, dayIndex, result: `night-${dayIndex}`, ...extra }
}

/** 그 밤을 낮(dayIndex + 1)으로 적용하는 방송 payload. */
function nightResultAppliedPayload(nightDayIndex) {
  return { gameId: GAME_ID, phase: "DAY", dayIndex: nightDayIndex + 1, victimUuid: null }
}

function renderResolveNight() {
  const socket = createFakeSocket()
  act(() => setFakeSocket(socket))
  const view = renderHook(() => useInGameResolveNight())
  return { socket, view }
}

test.beforeEach(() => {
  seedStore()
})

test.afterEach(() => {
  act(() => setFakeSocket(null))
  useInGameStore.setState({ gameId: null, state: null, error: null })
})

test("낮 전이(night_result_applied)가 와도 그 밤의 개인 결과는 남고 status만 idle로 풀린다", () => {
  const { socket, view } = renderResolveNight()

  act(() => socket.trigger("night_actions_resolved", { gameId: GAME_ID, dayIndex: 1 }))
  act(() => socket.trigger("night_action_result", nightActionResultPayload(1)))
  assert.equal(view.result.current.status, "resolved")
  assert.equal(view.result.current.nightActionResult.result, "night-1")

  act(() => socket.trigger("night_result_applied", nightResultAppliedPayload(1)))

  assert.equal(view.result.current.nightActionResult.result, "night-1")
  assert.equal(view.result.current.status, "idle")
  assert.equal(view.result.current.error, null)

  view.unmount()
})

test("다음 밤(dayIndex 2)의 개인 결과가 정상 반영된다", () => {
  const { socket, view } = renderResolveNight()

  act(() => socket.trigger("night_action_result", nightActionResultPayload(1)))
  act(() => socket.trigger("night_result_applied", nightResultAppliedPayload(1)))
  act(() => socket.trigger("night_action_result", nightActionResultPayload(2)))

  assert.equal(view.result.current.nightActionResult.result, "night-2")

  view.unmount()
})

test("이미 낮으로 적용된 밤의 늦은 개인 결과는 폐기된다", () => {
  const { socket, view } = renderResolveNight()

  act(() => socket.trigger("night_action_result", nightActionResultPayload(1)))
  act(() => socket.trigger("night_result_applied", nightResultAppliedPayload(1)))
  // 같은 밤(dayIndex 1)의 중복·지연 도착 — 값이 달라도 덮어쓰지 않는다.
  act(() => socket.trigger("night_action_result", nightActionResultPayload(1, { result: "late" })))

  assert.equal(view.result.current.nightActionResult.result, "night-1")

  view.unmount()
})

test("같은 낮 전이가 두 번 도착해도 no-op이다(개인 결과도 그대로)", () => {
  const { socket, view } = renderResolveNight()

  act(() => socket.trigger("night_action_result", nightActionResultPayload(1)))
  act(() => socket.trigger("night_result_applied", nightResultAppliedPayload(1)))
  act(() => socket.trigger("night_result_applied", nightResultAppliedPayload(1)))

  assert.equal(view.result.current.nightActionResult.result, "night-1")
  assert.equal(view.result.current.status, "idle")

  view.unmount()
})

test("disconnect에서는 개인 결과가 여전히 null로 초기화된다", () => {
  const { socket, view } = renderResolveNight()

  act(() => socket.trigger("night_action_result", nightActionResultPayload(1)))
  assert.notEqual(view.result.current.nightActionResult, null)

  act(() => socket.trigger("disconnect"))

  assert.equal(view.result.current.nightActionResult, null)

  view.unmount()
})

test("gameId 변경에서는 개인 결과가 여전히 null로 초기화된다", () => {
  const { socket, view } = renderResolveNight()

  act(() => socket.trigger("night_action_result", nightActionResultPayload(1)))
  assert.notEqual(view.result.current.nightActionResult, null)

  act(() => useInGameStore.setState({ gameId: "game-2" }))

  assert.equal(view.result.current.nightActionResult, null)

  view.unmount()
})

test("phase가 DAY가 아닌 night_result_applied(종료 방송)는 상태도 폐기 기준도 건드리지 않는다", () => {
  const { socket, view } = renderResolveNight()

  act(() => socket.trigger("night_action_result", nightActionResultPayload(1)))
  act(() => socket.trigger("night_result_applied", { gameId: GAME_ID, phase: "ENDED", dayIndex: 2 }))

  assert.equal(view.result.current.nightActionResult.result, "night-1")
  // 폐기 기준이 갱신되지 않았으므로 같은 밤의 결과가 여전히 반영된다.
  act(() => socket.trigger("night_action_result", nightActionResultPayload(1, { result: "still-open" })))
  assert.equal(view.result.current.nightActionResult.result, "still-open")

  view.unmount()
})
