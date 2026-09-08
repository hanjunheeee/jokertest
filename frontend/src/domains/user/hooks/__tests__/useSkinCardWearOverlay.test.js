import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// renderHook은 DOM 전역이 필요하다. 설치 방식은 기존 훅 테스트(useLibraryTab.test.js)와 동일하다.
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
const { useSkinCardWearOverlay } = await import("../useSkinCardWearOverlay.js")

test("오버레이는 닫힌 상태로 시작한다", () => {
  const { result } = renderHook(() => useSkinCardWearOverlay())

  assert.equal(result.current.open, false)
})

test("openOverlay를 부르면 오버레이가 열린다", () => {
  const { result } = renderHook(() => useSkinCardWearOverlay())

  act(() => result.current.openOverlay())

  assert.equal(result.current.open, true)
})

test("closeOverlay를 부르면 열린 오버레이가 다시 닫힌다", () => {
  const { result } = renderHook(() => useSkinCardWearOverlay())

  act(() => result.current.openOverlay())
  act(() => result.current.closeOverlay())

  assert.equal(result.current.open, false)
})

test("이미 열린 상태에서 openOverlay를 다시 불러도 열린 상태를 유지한다", () => {
  const { result } = renderHook(() => useSkinCardWearOverlay())

  act(() => result.current.openOverlay())
  act(() => result.current.openOverlay())

  assert.equal(result.current.open, true)
})
