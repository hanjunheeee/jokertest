import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// renderHook(@testing-library/react)이 내부적으로 document를 참조하므로, mount 전에 최소 DOM
// 전역을 설치한다 — useGameSessionSocketEvents.nightTurn.test.js와 동일한 설치 관례다.
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

// 라우터 없이 훅만 마운트하므로 useNavigate를 기록용 fake로 교체한다(nightTurn 테스트와 동일 관례).
const navigateCalls = []
mock.module("react-router-dom", {
  namedExports: { useNavigate: () => (...args) => navigateCalls.push(args) },
})

const { renderHook } = await import("@testing-library/react")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { useInGameResultNavigation } = await import("../useInGameResultNavigation.js")

const WIN_RESULT = {
  winner: "CITIZEN",
  reveals: [{ uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", alive: true }],
  mvp: null,
}

function seed({ phase, winResult = null }) {
  act(() => {
    useInGameStore.setState({
      gameId: "game-1",
      state: {
        id: "game-1",
        phase,
        dayIndex: 2,
        players: [{ uuid: "p1", nickname: "P1", alive: true }],
        self: { uuid: "p1", nickname: "P1", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
        winResult,
      },
    })
  })
}

function reset() {
  navigateCalls.length = 0
  act(() => {
    useInGameStore.setState({ gameId: null, state: null })
  })
}

test("ENDED + winResult + 사망 연출 없음이면 결과 페이지로 정확히 한 번 이동한다", () => {
  reset()
  seed({ phase: "ENDED", winResult: WIN_RESULT })

  const { unmount } = renderHook(() => useInGameResultNavigation({ hold: false }))

  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]])
  unmount()
})

test("사망 연출이 남아 있으면(hold) 기다렸다가, 큐가 다 빈 뒤에 이동한다", () => {
  reset()
  seed({ phase: "ENDED", winResult: WIN_RESULT })

  const { rerender, unmount } = renderHook((props) => useInGameResultNavigation(props), {
    initialProps: { hold: true },
  })

  assert.equal(navigateCalls.length, 0, "연출이 남아 있는 동안에는 이동하지 않는다")

  rerender({ hold: false })

  assert.deepEqual(navigateCalls, [["/gameresult", { replace: true }]])
  unmount()
})

test("종료되지 않은 phase(DAY/TRIBUNAL/NIGHT)에서는 이동하지 않는다", () => {
  for (const phase of ["DAY", "TRIBUNAL", "NIGHT"]) {
    reset()
    seed({ phase })

    const { unmount } = renderHook(() => useInGameResultNavigation({ hold: false }))

    assert.equal(navigateCalls.length, 0, `phase=${phase}`)
    unmount()
  }
})

test("ENDED인데 winResult가 없으면 이동하지 않는다(결과 페이지가 즉시 로비로 튕겨 나가므로)", () => {
  reset()
  seed({ phase: "ENDED", winResult: null })

  const { unmount } = renderHook(() => useInGameResultNavigation({ hold: false }))

  assert.equal(navigateCalls.length, 0)
  unmount()
})

test("리렌더를 반복해도 navigate는 한 번만 호출된다", () => {
  reset()
  seed({ phase: "ENDED", winResult: WIN_RESULT })

  const { rerender, unmount } = renderHook((props) => useInGameResultNavigation(props), {
    initialProps: { hold: false },
  })
  rerender({ hold: false })
  rerender({ hold: true })
  rerender({ hold: false })

  assert.equal(navigateCalls.length, 1)
  unmount()
})

test("이동해도 store의 winResult는 그대로 남는다(결과 페이지가 읽어야 하므로)", () => {
  reset()
  seed({ phase: "ENDED", winResult: WIN_RESULT })

  const { unmount } = renderHook(() => useInGameResultNavigation({ hold: false }))

  assert.equal(useInGameStore.getState().state.winResult, WIN_RESULT)
  assert.equal(useInGameStore.getState().gameId, "game-1")
  unmount()
})
