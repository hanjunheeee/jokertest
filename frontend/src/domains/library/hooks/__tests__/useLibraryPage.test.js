import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

// content/index.js는 .md?raw 원고를 불러오는데, 이는 Vite 전용 문법이라 node --test에서는
// 그대로 실행할 수 없다(ERR_UNKNOWN_FILE_EXTENSION). 훅의 페이지 수 계산 로직만 검증하면
// 되므로, 다른 훅 테스트(friendFavorites.test.js)와 같은 방식으로 콘텐츠 경계를 모킹한다.
const FORBIDDEN_RECORDS_PAGE_COUNT = 3

mock.module("../../content/index.js", {
  namedExports: {
    FORBIDDEN_RECORDS_PAGE_COUNT,
  },
})

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
const { LIBRARY_TABS } = await import("../../constants/libraryTabs.js")
const { useLibraryPage, getLibraryPageCount } = await import("../useLibraryPage.js")

test("초대받은 자들 탭의 페이지 수는 1이다", () => {
  assert.equal(getLibraryPageCount(LIBRARY_TABS.invitedGuests.id), 1)
})

test("금지된 기록 탭의 페이지 수는 콘텐츠 페이지 수와 같다", () => {
  assert.equal(getLibraryPageCount(LIBRARY_TABS.forbiddenRecords.id), FORBIDDEN_RECORDS_PAGE_COUNT)
})

test("초기 페이지 인덱스는 0이고 이전 페이지로 갈 수 없다", () => {
  const { result } = renderHook(() => useLibraryPage(LIBRARY_TABS.forbiddenRecords.id))

  assert.equal(result.current.pageIndex, 0)
  assert.equal(result.current.canGoPrev, false)
})

test("다음 페이지로 이동하면 인덱스가 증가한다", () => {
  const { result } = renderHook(() => useLibraryPage(LIBRARY_TABS.forbiddenRecords.id))

  act(() => result.current.goNext())

  assert.equal(result.current.pageIndex, 1)
  assert.equal(result.current.canGoPrev, true)
})

test("마지막 페이지에서는 다음 페이지로 넘어갈 수 없다", () => {
  const { result } = renderHook(() => useLibraryPage(LIBRARY_TABS.forbiddenRecords.id))

  for (let i = 0; i < FORBIDDEN_RECORDS_PAGE_COUNT + 3; i += 1) {
    act(() => result.current.goNext())
  }

  assert.equal(result.current.pageIndex, FORBIDDEN_RECORDS_PAGE_COUNT - 1)
  assert.equal(result.current.canGoNext, false)
})

test("초대받은 자들 탭은 페이지 이동이 항상 첫 페이지에 고정된다", () => {
  const { result } = renderHook(() => useLibraryPage(LIBRARY_TABS.invitedGuests.id))

  act(() => result.current.goNext())

  assert.equal(result.current.pageIndex, 0)
  assert.equal(result.current.canGoNext, false)
  assert.equal(result.current.canGoPrev, false)
})

test("탭마다 페이지 인덱스가 독립적으로 유지된다", () => {
  const { result, rerender } = renderHook(
    ({ tabId }) => useLibraryPage(tabId),
    { initialProps: { tabId: LIBRARY_TABS.forbiddenRecords.id } },
  )

  act(() => result.current.goNext())
  assert.equal(result.current.pageIndex, 1)

  rerender({ tabId: LIBRARY_TABS.invitedGuests.id })
  assert.equal(result.current.pageIndex, 0)

  rerender({ tabId: LIBRARY_TABS.forbiddenRecords.id })
  assert.equal(result.current.pageIndex, 1)
})
