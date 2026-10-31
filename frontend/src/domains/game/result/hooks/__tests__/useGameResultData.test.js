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
const { useInGameStore } = await import("../../../ingame/store/ingameStore.js")
const { useGameResultData } = await import("../useGameResultData.js")

const ROSTER = [
  { uuid: "p1", nickname: "P1", alive: true },
  { uuid: "p2", nickname: "P2", alive: false },
  { uuid: "p3", nickname: "P3", alive: true },
]

function seedEndedStore({ winner = "JOKER", selfTeam = "JOKER", selfUuid = "p1", winResult } = {}) {
  act(() => {
    useInGameStore.setState({
      gameId: "game-1",
      state: {
        id: "game-1",
        phase: "ENDED",
        dayIndex: 2,
        players: ROSTER,
        self: {
          uuid: selfUuid,
          nickname: "P",
          role: selfTeam === "JOKER" ? "JOKER" : "DOCTOR",
          team: selfTeam,
          hasActedThisPhase: false,
        },
        winResult: winResult ?? { winner },
      },
    })
  })
}

function resetStore() {
  act(() => {
    useInGameStore.setState({ gameId: null, state: null })
  })
}

test("store에 winResult가 없으면 null을 돌려준다(호출부가 로비로 돌려보낸다)", () => {
  resetStore()

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.equal(result.current, null)
  unmount()
})

test("phase가 ENDED인데도 winResult가 비어 있으면 null이다", () => {
  resetStore()
  act(() => {
    useInGameStore.setState({
      gameId: "game-1",
      state: {
        id: "game-1",
        phase: "ENDED",
        dayIndex: 2,
        players: [],
        self: { uuid: "p1", team: "CITIZEN" },
        winResult: null,
      },
    })
  })

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.equal(result.current, null)
  unmount()
})

test("ENDED winResult가 있으면 본인 team 기준 outcome과 승리 진영을 담은 view model을 만든다", () => {
  resetStore()
  seedEndedStore({ winner: "JOKER", selfTeam: "JOKER" })

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.notEqual(result.current, null)
  assert.equal(result.current.outcome, "win")
  assert.equal(result.current.winningTeam, "JOKER")
  unmount()
})

test("본인이 패배 진영이면 outcome은 lose다", () => {
  resetStore()
  seedEndedStore({ winner: "CITIZEN", selfTeam: "JOKER" })

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.equal(result.current.outcome, "lose")
  assert.equal(result.current.winningTeam, "CITIZEN")
  unmount()
})

test("서버가 정체 공개를 내려주지 않으므로 다른 참가자의 역할을 채워 넣지 않는다", () => {
  resetStore()
  seedEndedStore({ winner: "CITIZEN", selfTeam: "CITIZEN" })

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.deepEqual(result.current.players, [])
  assert.equal(result.current.mvp, null)
  unmount()
})

test("winResult 참조가 그대로면 리렌더해도 같은 view model 참조를 유지한다(useMemo 안정성)", () => {
  resetStore()
  seedEndedStore({ winner: "JOKER", selfTeam: "JOKER" })

  const { result, rerender, unmount } = renderHook(() => useGameResultData())
  const first = result.current
  rerender()

  assert.equal(result.current, first)
  unmount()
})
