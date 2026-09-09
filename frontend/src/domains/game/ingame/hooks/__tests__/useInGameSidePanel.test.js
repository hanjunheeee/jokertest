import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// 이 훅은 React state만 쓰고 DOM에 의존하지 않지만, renderHook을 쓰려면 DOM 전역이
// 필요하다. 설치 방식은 기존 훅 테스트(useSoundSettings.test.js)와 동일하다.
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
const {
  INGAME_SIDE_PANEL_RECORDS,
  INGAME_SIDE_PANEL_SETTINGS,
  useInGameSidePanel,
} = await import("../useInGameSidePanel.js")

test("처음에는 어떤 패널도 열려 있지 않다", () => {
  const { result } = renderHook(() => useInGameSidePanel())

  assert.equal(result.current.openPanel, null)
  assert.equal(result.current.recordsOpen, false)
  assert.equal(result.current.settingsOpen, false)
})

test("메뉴 버튼(openRecords)은 기록 패널만 연다", () => {
  const { result } = renderHook(() => useInGameSidePanel())

  act(() => result.current.openRecords())

  assert.equal(result.current.openPanel, INGAME_SIDE_PANEL_RECORDS)
  assert.equal(result.current.recordsOpen, true)
  assert.equal(result.current.settingsOpen, false)
})

test("설정 버튼(openSettings)은 설정 패널만 연다", () => {
  const { result } = renderHook(() => useInGameSidePanel())

  act(() => result.current.openSettings())

  assert.equal(result.current.openPanel, INGAME_SIDE_PANEL_SETTINGS)
  assert.equal(result.current.settingsOpen, true)
  assert.equal(result.current.recordsOpen, false)
})

test("두 버튼은 서로를 배타적으로 닫는다 — 동시에 열리지 않는다", () => {
  const { result } = renderHook(() => useInGameSidePanel())

  act(() => result.current.openRecords())
  act(() => result.current.openSettings())

  assert.equal(result.current.settingsOpen, true)
  assert.equal(result.current.recordsOpen, false, "설정을 열면 기록 패널은 닫힌다")

  act(() => result.current.openRecords())

  assert.equal(result.current.recordsOpen, true)
  assert.equal(result.current.settingsOpen, false, "기록을 열면 설정 패널은 닫힌다")
})

test("close는 열려 있던 패널을 닫는다", () => {
  const { result } = renderHook(() => useInGameSidePanel())

  act(() => result.current.openSettings())
  act(() => result.current.close())

  assert.equal(result.current.openPanel, null)
  assert.equal(result.current.recordsOpen, false)
  assert.equal(result.current.settingsOpen, false)
})
