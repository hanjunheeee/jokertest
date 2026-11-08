// 단계 타이머 진행 훅: 짧은 간격으로만 다시 셈, 마감 지나면 멈춤
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
let rafCalls = 0
installDomGlobal("requestAnimationFrame", () => { rafCalls += 1; return 1 })
installDomGlobal("cancelAnimationFrame", () => {})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { useTurnProgress, TURN_PROGRESS_TICK_MS } = await import(
  "../../../../../../src/domains/game/ingame/hooks/timebar/useTurnProgress.js"
)

test.beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 })
  rafCalls = 0
})
test.afterEach(() => {
  cleanup()
  mock.timers.reset()
})

test("마감까지 짧은 간격으로 줄고, 마감 뒤엔 더 안 셈", () => {
  let renders = 0
  const deadline = 1_000_000 + 2000
  const { result } = renderHook(() => {
    renders += 1
    return useTurnProgress(deadline)
  })
  assert.equal(result.current.remainingRatio, 1)
  assert.equal(result.current.remainingSec, 2)

  act(() => { mock.timers.tick(1000) })
  assert.equal(result.current.remainingSec, 1)
  assert.ok(result.current.remainingRatio > 0.45 && result.current.remainingRatio < 0.55)

  act(() => { mock.timers.tick(1000) })
  assert.equal(result.current.remainingSec, 0)
  assert.equal(result.current.remainingRatio, 0)
  const rendersAtDeadline = renders
  // 2초 동안 그리기 횟수가 (2초 / 간격) 정도로 묶임 (화면 그리기마다 아님)
  assert.ok(rendersAtDeadline <= Math.ceil(2000 / TURN_PROGRESS_TICK_MS) + 3, `그리기 ${rendersAtDeadline}번`)

  act(() => { mock.timers.tick(5000) })
  assert.equal(renders, rendersAtDeadline, "마감 뒤에도 다시 셈")
  assert.equal(rafCalls, 0)
})

test("마감이 없으면 빈 게이지·남은 초 없음", () => {
  const { result, rerender } = renderHook(({ d }) => useTurnProgress(d), { initialProps: { d: 1_000_000 + 3000 } })
  assert.equal(result.current.remainingSec, 3)
  rerender({ d: null })
  assert.deepEqual(result.current, { remainingRatio: 0, remainingSec: null })
})
