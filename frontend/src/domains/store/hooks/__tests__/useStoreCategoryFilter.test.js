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
const { STORE_CATEGORIES } = await import("../../constants/storeFilterOptions.js")
const { getStoreItemsByCategory } = await import("../../constants/storeItems.js")
const { useStoreCategoryFilter } = await import("../useStoreCategoryFilter.js")

test("초기 선택 카테고리는 STORE_CATEGORIES의 첫 번째다", () => {
  const { result } = renderHook(() => useStoreCategoryFilter())

  assert.equal(result.current.activeCategory, STORE_CATEGORIES[0])
  assert.deepEqual(result.current.categories, STORE_CATEGORIES)
})

test("다른 카테고리를 선택하면 활성 카테고리가 전환된다", () => {
  const { result } = renderHook(() => useStoreCategoryFilter())

  const nextCategory = STORE_CATEGORIES[1]
  act(() => result.current.selectCategory(nextCategory))

  assert.equal(result.current.activeCategory, nextCategory)
})

test("같은 카테고리를 다시 선택하면 선택이 해제된다", () => {
  const { result } = renderHook(() => useStoreCategoryFilter())

  const current = result.current.activeCategory
  act(() => result.current.selectCategory(current))

  assert.equal(result.current.activeCategory, null)
})

test("카테고리 변경 전후로 필터링된 상품 목록이 바뀐다", () => {
  const { result } = renderHook(() => useStoreCategoryFilter())

  const beforeCategory = result.current.activeCategory
  const beforeItems = getStoreItemsByCategory(beforeCategory)
  assert.ok(beforeItems.every((item) => item.category === beforeCategory))

  const nextCategory = STORE_CATEGORIES.find((label) => label !== beforeCategory)
  act(() => result.current.selectCategory(nextCategory))

  const afterItems = getStoreItemsByCategory(result.current.activeCategory)
  assert.equal(result.current.activeCategory, nextCategory)
  assert.ok(afterItems.every((item) => item.category === nextCategory))
})
