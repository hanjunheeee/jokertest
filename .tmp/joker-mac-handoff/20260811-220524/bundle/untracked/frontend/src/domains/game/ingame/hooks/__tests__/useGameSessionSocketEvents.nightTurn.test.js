import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

// renderHook(@testing-library/react)이 내부적으로 document를 참조하므로, 이 저장소의 node:test
// 실행(순수 node:test, jsdom 환경 아님)에서는 mount 전에 최소 DOM 전역을 설치해야 한다 —
// useInGameActionPanel.nightTurn.test.js/useInGameTribunalVoteSubmit.test.js와 동일한 설치 관례를
// 그대로 따른다. 이 저장소의 "test" 스크립트(node --test src/**/__tests__/*.test.js)는 매칭되는
// 테스트 파일마다 별도 프로세스를 띄우므로 여기서 설치한 module-scope 전역은 다른 테스트 파일을
// 오염시키지 않는다(위 두 선례 파일도 동일한 이유로 별도의 teardown 없이 module scope에 설치한다).
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

// useGameSessionSocketEvents가 module 최상단에서 import하는 socketClient(getSocket/subscribeSocket)와
// react-router-dom(useNavigate)을 실제 mount 테스트에서 제어 가능한 fake로 교체한다.
// useInGameTribunalVoteSubmit.test.js와 동일한 이유로 mock.module 이후 동적 import를 쓴다.
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
  for (const callback of fakeSocketSubscribers) callback()
}

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: { getSocket: fakeGetSocket, subscribeSocket: fakeSubscribeSocket },
})
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => () => {} },
})

const { renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { selectInGameNightTurnRole } = await import("../../utils/selectInGameNightTurnRole.js")
const { useGameSessionSocketEvents } = await import("../useGameSessionSocketEvents.js")

/** on/off/trigger만 흉내내는 최소 fake socket(backend 테스트의 createFakeSocket.trigger와 동일한 계약). */
function createFakeSocket() {
  const listeners = new Map()
  return {
    connected: true,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    trigger(event, payload) {
      for (const handler of listeners.get(event) ?? []) handler(payload)
    },
  }
}

function seedState(overrides = {}) {
  const state = {
    id: "g1",
    phase: "NIGHT",
    dayIndex: 1,
    players: [
      { uuid: "p1", nickname: "A", alive: true },
      { uuid: "p2", nickname: "B", alive: true },
    ],
    self: { uuid: "p1", nickname: "A", role: "JOKER" },
    nightTurnRole: "JOKER",
    ...overrides,
  }
  useInGameStore.setState({ gameId: "g1", state, error: null })
  return state
}

test("useGameSessionSocketEvents: night_turn_changed 방송을 받으면 store의 nightTurnRole이 갱신되고 selectInGameNightTurnRole도 새 값을 즉시 반영한다(안내 오버레이의 유일한 입력)", () => {
  seedState()
  const fakeSocket = createFakeSocket()
  setFakeSocket(fakeSocket)

  renderHook(() => useGameSessionSocketEvents())

  fakeSocket.trigger("night_turn_changed", { gameId: "g1", phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  const state = useInGameStore.getState().state
  assert.equal(state.nightTurnRole, "DOCTOR")
  assert.equal(selectInGameNightTurnRole(state), "DOCTOR")
})

test("useGameSessionSocketEvents: 다른 게임의 늦은 night_turn_changed 방송은 무시된다", () => {
  seedState()
  const fakeSocket = createFakeSocket()
  setFakeSocket(fakeSocket)

  renderHook(() => useGameSessionSocketEvents())

  fakeSocket.trigger("night_turn_changed", { gameId: "other-game", phase: "NIGHT", dayIndex: 1, nightTurnRole: "DOCTOR" })

  assert.equal(useInGameStore.getState().state.nightTurnRole, "JOKER")
})

test("useGameSessionSocketEvents: night_turn_changed 이후 night_result_applied가 도착해도 kill/phase/result 순서가 보존된다(턴 갱신이 이후 사망·phase 반영을 가리지 않는다)", () => {
  seedState()
  const fakeSocket = createFakeSocket()
  setFakeSocket(fakeSocket)

  renderHook(() => useGameSessionSocketEvents())

  fakeSocket.trigger("night_turn_changed", { gameId: "g1", phase: "NIGHT", dayIndex: 1, nightTurnRole: "WITCH_HUNTER" })
  assert.equal(useInGameStore.getState().state.nightTurnRole, "WITCH_HUNTER")
  assert.equal(useInGameStore.getState().state.phase, "NIGHT")

  fakeSocket.trigger("night_result_applied", {
    gameId: "g1",
    phase: "DAY",
    dayIndex: 2,
    victimUuid: "p2",
    players: [
      { uuid: "p1", alive: true },
      { uuid: "p2", alive: false },
    ],
  })

  const state = useInGameStore.getState().state
  assert.equal(state.phase, "DAY")
  assert.equal(state.dayIndex, 2)
  assert.equal(state.players.find((p) => p.uuid === "p2").alive, false)
  // NIGHT 전용 selector는 phase가 더 이상 NIGHT가 아니므로 결과와 무관하게 null로 떨어진다.
  assert.equal(selectInGameNightTurnRole(state), null)
})
