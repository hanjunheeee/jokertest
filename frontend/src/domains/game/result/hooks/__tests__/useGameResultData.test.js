import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// renderHook(@testing-library/react)이 내부적으로 document를 참조하므로, 이 저장소의 node:test
// 실행(순수 node:test, jsdom 환경 아님)에서는 mount 전에 최소 DOM 전역을 설치해야 한다 —
// useInGameKillReveal.test.js와 동일한 설치 관례를 그대로 따른다.
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

const REVEALS = [
  { uuid: "p1", nickname: "P1", role: "JOKER", team: "JOKER", alive: true },
  { uuid: "p2", nickname: "P2", role: "CITIZEN", team: "CITIZEN", alive: false },
  { uuid: "p3", nickname: "P3", role: "DOCTOR", team: "CITIZEN", alive: true },
]

function seedEndedStore({ winner = "JOKER", selfUuid = "p1", winResult } = {}) {
  act(() => {
    useInGameStore.setState({
      gameId: "game-1",
      state: {
        id: "game-1",
        phase: "ENDED",
        dayIndex: 2,
        players: REVEALS.map(({ uuid, nickname, alive }) => ({ uuid, nickname, alive })),
        self: { uuid: selfUuid, nickname: "P", role: "JOKER", team: "JOKER", hasActedThisPhase: false },
        winResult: winResult ?? { winner, reveals: REVEALS, mvp: null },
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
      state: { id: "game-1", phase: "ENDED", dayIndex: 2, players: [], self: { uuid: "p1" }, winResult: null },
    })
  })

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.equal(result.current, null)
  unmount()
})

test("ENDED winResult가 있으면 본인 팀 기준 outcome과 reveals 순서대로의 players를 조립한다", () => {
  resetStore()
  seedEndedStore({ winner: "JOKER", selfUuid: "p1" })

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.equal(result.current.outcome, "win")
  assert.deepEqual(
    result.current.players.map((p) => p.id),
    ["p1", "p2", "p3"],
  )
  assert.deepEqual(
    result.current.players.map((p) => p.job),
    ["광대", "귀족", "주치의"],
  )
  assert.equal(result.current.mvp, null)
  unmount()
})

test("본인이 패배 진영이면 outcome은 lose다", () => {
  resetStore()
  seedEndedStore({ winner: "CITIZEN", selfUuid: "p1" })

  const { result, unmount } = renderHook(() => useGameResultData())

  assert.equal(result.current.outcome, "lose")
  unmount()
})

test("winResult 참조가 그대로면 리렌더해도 같은 view model 참조를 유지한다(useMemo 안정성)", () => {
  resetStore()
  seedEndedStore({ winner: "JOKER", selfUuid: "p1" })

  const { result, rerender, unmount } = renderHook(() => useGameResultData())
  const first = result.current
  rerender()

  assert.equal(result.current, first)
  unmount()
})
