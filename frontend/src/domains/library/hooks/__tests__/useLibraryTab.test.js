import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// renderHook은 DOM 전역이 필요하다. 설치 방식은 기존 훅 테스트(useSoundSettings.test.js)와 동일하다.
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
const { LIBRARY_TABS, getLibraryTab, getOtherLibraryTab } = await import("../../constants/libraryTabs.js")
const { useLibraryTab } = await import("../useLibraryTab.js")

test("초기 목차는 금지된 기록이다", () => {
  const { result } = renderHook(() => useLibraryTab())

  assert.equal(result.current.activeTabId, LIBRARY_TABS.forbiddenRecords.id)
})

test("목차를 초대받은 자들 스프레드로 전환할 수 있다", () => {
  const { result } = renderHook(() => useLibraryTab())

  act(() => result.current.setActiveTabId(LIBRARY_TABS.invitedGuests.id))

  assert.equal(result.current.activeTabId, LIBRARY_TABS.invitedGuests.id)
})

test("초대받은 자들에서 금지된 기록 스프레드로 되돌아갈 수 있다", () => {
  const { result } = renderHook(() => useLibraryTab(LIBRARY_TABS.invitedGuests.id))

  act(() => result.current.setActiveTabId(LIBRARY_TABS.forbiddenRecords.id))

  assert.equal(result.current.activeTabId, LIBRARY_TABS.forbiddenRecords.id)
})

test("getLibraryTab은 id에 맞는 목차 정보를 반환한다", () => {
  assert.equal(getLibraryTab("forbiddenRecords").id, LIBRARY_TABS.forbiddenRecords.id)
  assert.equal(getLibraryTab("invitedGuests").id, LIBRARY_TABS.invitedGuests.id)
})

test("getOtherLibraryTab은 현재 탭이 아닌 다른 목차를 반환한다", () => {
  assert.equal(getOtherLibraryTab("forbiddenRecords").id, LIBRARY_TABS.invitedGuests.id)
  assert.equal(getOtherLibraryTab("invitedGuests").id, LIBRARY_TABS.forbiddenRecords.id)
})
