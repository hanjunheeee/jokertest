import test from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { JSDOM } from "jsdom"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("KeyboardEvent", dom.window.KeyboardEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { render } = await import("@testing-library/react")
const { default: InGameNightPrivateResultOverlay } = await import("../InGameNightPrivateResultOverlay.js")
const {
  INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
  INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL,
} = await import("../../../constants/nightPrivateResult/ingameNightPrivateResult.js")

function renderOverlay(props) {
  return render(React.createElement(InGameNightPrivateResultOverlay, props))
}

function findConfirmButton(container) {
  return [...container.querySelectorAll("button")].find(
    (b) => b.textContent === INGAME_NIGHT_PRIVATE_RESULT_CONFIRM_LABEL,
  )
}

test("open이 false이거나 label이 비어 있으면 아무 것도 렌더링하지 않는다", () => {
  const a = renderOverlay({ open: false, kind: "INVESTIGATE", label: "홍길동 님은 시민 진영입니다", onConfirm: () => {} })
  assert.equal(a.container.querySelector("[role='dialog']"), null)
  a.unmount()

  const b = renderOverlay({ open: true, kind: "INVESTIGATE", label: null, onConfirm: () => {} })
  assert.equal(b.container.querySelector("[role='dialog']"), null)
  b.unmount()

  const c = renderOverlay({ open: true, kind: "INVESTIGATE", label: "", onConfirm: () => {} })
  assert.equal(c.container.querySelector("[role='dialog']"), null)
  c.unmount()
})

test("열리면 파치먼트 모달 안에 결과 문구와 확인 버튼을 렌더한다", () => {
  const { container, unmount } = renderOverlay({
    open: true,
    kind: "CONFIRM",
    label: "홍길동 님의 역할은 마녀사냥꾼입니다",
    onConfirm: () => {},
  })

  const wrapper = container.querySelector("[data-ingame-night-private-result]")
  assert.notEqual(wrapper, null)
  assert.equal(wrapper.getAttribute("data-ingame-night-private-result"), "CONFIRM")

  const dialog = container.querySelector("[role='dialog']")
  assert.notEqual(dialog, null)
  assert.equal(dialog.getAttribute("aria-modal"), "true")
  assert.equal(dialog.getAttribute("aria-label"), INGAME_NIGHT_PRIVATE_RESULT_DIALOG_LABEL)

  assert.equal(container.querySelector("p")?.textContent, "홍길동 님의 역할은 마녀사냥꾼입니다")
  assert.notEqual(findConfirmButton(container), undefined)
  unmount()
})

test("확인 버튼과 backdrop 클릭 모두 onConfirm을 호출한다", () => {
  let confirmCalls = 0
  const { container, unmount } = renderOverlay({
    open: true,
    kind: "INVESTIGATE",
    label: "홍길동 님은 광대 진영입니다",
    onConfirm: () => {
      confirmCalls += 1
    },
  })

  act(() => {
    findConfirmButton(container).dispatchEvent(new Event("click", { bubbles: true }))
  })
  assert.equal(confirmCalls, 1)

  const backdrop = [...container.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === INGAME_NIGHT_PRIVATE_RESULT_BACKDROP_LABEL,
  )
  assert.notEqual(backdrop, undefined)
  act(() => {
    backdrop.dispatchEvent(new Event("click", { bubbles: true }))
  })
  assert.equal(confirmCalls, 2)
  unmount()
})

test("Escape 키는 확인과 같은 처리를 하고, 닫힌 뒤에는 더 이상 반응하지 않는다", () => {
  let confirmCalls = 0
  const { rerender, unmount } = renderOverlay({
    open: true,
    kind: "INVESTIGATE",
    label: "홍길동 님은 시민 진영입니다",
    onConfirm: () => {
      confirmCalls += 1
    },
  })

  act(() => {
    window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }))
  })
  assert.equal(confirmCalls, 1)

  act(() => {
    window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter" }))
  })
  assert.equal(confirmCalls, 1, "Escape 외의 키는 닫지 않는다")

  rerender(
    React.createElement(InGameNightPrivateResultOverlay, {
      open: false,
      kind: "INVESTIGATE",
      label: "홍길동 님은 시민 진영입니다",
      onConfirm: () => {
        confirmCalls += 1
      },
    }),
  )
  act(() => {
    window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }))
  })
  assert.equal(confirmCalls, 1, "닫힌 뒤에는 keydown 리스너가 해제돼 있어야 한다")
  unmount()
})

test("열릴 때 키보드 초점이 확인 버튼으로 옮겨간다(뒤쪽 컨트롤로 입력이 새지 않는다)", () => {
  const { container, unmount } = renderOverlay({
    open: true,
    kind: "CONFIRM",
    label: "홍길동 님의 역할은 의사입니다",
    onConfirm: () => {},
  })

  assert.equal(document.activeElement, findConfirmButton(container))
  unmount()
})
