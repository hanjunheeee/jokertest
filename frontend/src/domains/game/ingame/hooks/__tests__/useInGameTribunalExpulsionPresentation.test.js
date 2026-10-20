import test, { mock } from "node:test"
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

const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})

const { renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useGameSessionSocketEvents } = await import("../useGameSessionSocketEvents.js")
const { useInGameTribunalExpulsionPresentation } = await import("../useInGameTribunalExpulsionPresentation.js")
const { useInGameResultNavigation } = await import("../useInGameResultNavigation.js")
const { useInGamePhaseEntrance } = await import("../useInGamePhaseEntrance.js")

const GAME_ID = "game-expulsion-live"
const SELF = "uuid-self"
const V1 = "uuid-v1"

const ROSTER = [
  { uuid: SELF, nickname: "나", membershipId: "m-self" },
  { uuid: V1, nickname: "첫째", membershipId: "m-v1" },
]

function createFakeSocket({ id = "sock-1" } = {}) {
  const listeners = new Map()
  const socket = {
    id,
    connected: true,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    deliver(event, payload) {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload)
    },
    timeout() {
      return socket
    },
    emitWithAck() {
      return Promise.resolve({ ok: true })
    },
  }
  return socket
}

function seedSession({ phase = "TRIBUNAL", dayIndex = 2 } = {}) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF, nickname: "나" } })
    useInGameStore.setState({
      gameId: null,
      state: null,
      hostUuid: null,
      error: null,
      snapshotSeq: 0,
      nightPrivateResult: null,
    })
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase,
        dayIndex,
        dayPhase: null,
        players: ROSTER.map((p) => ({ ...p, isAlive: true })),
        self: { uuid: SELF, nickname: "나", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
        tribunal: { defendantUuid: V1, resolved: false },
      },
    })
  })
}

function useProductionTree() {
  useGameSessionSocketEvents()
  const tribunalExpulsion = useInGameTribunalExpulsionPresentation({ hold: false })
  const deathRevealActive = tribunalExpulsion.open || tribunalExpulsion.pending
  const phaseEntrance = useInGamePhaseEntrance({ hold: deathRevealActive })
  useInGameResultNavigation({ hold: deathRevealActive })
  return { tribunalExpulsion, phaseEntrance }
}

function open() {
  navigateCalls.length = 0
  const socket = createFakeSocket()
  act(() => setSocket(socket))
  seedSession()
  const view = renderHook(() => useProductionTree())
  return {
    socket,
    get tribunalExpulsion() {
      return view.result.current.tribunalExpulsion
    },
    get phaseEntrance() {
      return view.result.current.phaseEntrance
    },
    deliver(event, payload) {
      act(() => socket.deliver(event, payload))
    },
    consumeActive() {
      const id = view.result.current.tribunalExpulsion.presentationId
      act(() => view.result.current.tribunalExpulsion.consume(id))
    },
    unmount: view.unmount,
  }
}

test("NOT_GUILTY 판정은 추방 연출 큐에 넣지 않는다", () => {
  const session = open()
  session.deliver("tribunal_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: V1,
    outcome: "NOT_GUILTY",
    counts: { guilty: 1, notGuilty: 2 },
    executedUuid: null,
  })
  assert.equal(session.tribunalExpulsion.open, false)
  assert.equal(session.tribunalExpulsion.pending, false)
  session.unmount()
})

test("GUILTY 판정 — 추방 연출이 열리고 밤 진입 연출·결과 이동을 보류한다", () => {
  const session = open()

  session.deliver("tribunal_vote_resolved", {
    gameId: GAME_ID,
    dayIndex: 2,
    phase: "NIGHT",
    defendantUuid: V1,
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: V1,
  })

  assert.equal(useInGameStore.getState().state.phase, "NIGHT")
  assert.equal(session.tribunalExpulsion.open, true)
  assert.equal(session.tribunalExpulsion.message, "[첫째]님이 가면무도회에서 추방당하셨습니다.")
  assert.equal(session.phaseEntrance.open, false, "추방 연출 중에는 밤 진입 연출을 미룬다")
  assert.equal(navigateCalls.length, 0)

  session.consumeActive()
  assert.equal(session.tribunalExpulsion.open, false)
  assert.equal(session.tribunalExpulsion.pending, false)

  session.unmount()
})
