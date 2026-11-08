// 인게임 창 공용 훅: 겹친 창은 맨 위만 Esc로 닫힘, 초점은 창 안으로 갔다가 닫으면 돌아옴, Tab은 창 안에서 돎
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const sfx = []
mock.module("../../../../../src/shared/hooks/useSfxRuntime.js", {
  namedExports: { dispatchUiSfx: (kind) => sfx.push(kind) },
})

const { render, cleanup, fireEvent, act } = await import("@testing-library/react")
const { useInGameModalLayer } = await import("../../../../../src/domains/game/ingame/hooks/useInGameModalLayer.js")

function Layer({ name, open, onClose }) {
  const ref = React.useRef(null)
  useInGameModalLayer({ open, onClose, containerRef: ref })
  if (!open) return null
  return React.createElement("div", { ref, tabIndex: -1, "data-layer": name },
    React.createElement("button", { type: "button" }, `${name}-1`),
    React.createElement("button", { type: "button" }, `${name}-2`),
  )
}

test.afterEach(() => {
  cleanup()
  sfx.length = 0
})

test("겹친 두 창에서 Esc 한 번은 맨 위만 닫고 취소음도 한 번", () => {
  const closed = []
  function App() {
    const [a, setA] = React.useState(true)
    const [b, setB] = React.useState(true)
    return React.createElement(React.Fragment, null,
      React.createElement(Layer, { name: "a", open: a, onClose: () => { closed.push("a"); setA(false) } }),
      React.createElement(Layer, { name: "b", open: b, onClose: () => { closed.push("b"); setB(false) } }),
    )
  }
  render(React.createElement(App))
  act(() => { fireEvent.keyDown(window, { key: "Escape" }) })
  assert.deepEqual(closed, ["b"])
  assert.deepEqual(sfx, ["ui-cancel"])
  act(() => { fireEvent.keyDown(window, { key: "Escape" }) })
  assert.deepEqual(closed, ["b", "a"])
})

test("열면 창 안 첫 버튼으로 초점, Tab은 창 안에서 돌고, 닫으면 원래 자리로", () => {
  const opener = document.createElement("button")
  document.body.appendChild(opener)
  opener.focus()
  const view = render(React.createElement(Layer, { name: "x", open: true, onClose: () => {} }))
  assert.equal(document.activeElement.textContent, "x-1")

  const last = view.getByText("x-2")
  last.focus()
  act(() => { fireEvent.keyDown(window, { key: "Tab" }) })
  assert.equal(document.activeElement.textContent, "x-1", "마지막에서 Tab이면 처음으로")

  view.rerender(React.createElement(Layer, { name: "x", open: false, onClose: () => {} }))
  assert.equal(document.activeElement, opener)
  opener.remove()
})
