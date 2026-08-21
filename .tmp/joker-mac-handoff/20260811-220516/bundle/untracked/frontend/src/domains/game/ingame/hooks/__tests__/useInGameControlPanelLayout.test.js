import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
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
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")
const {
  useInGameControlPanelLayout,
  INGAME_CONTROL_PANEL_MODE_COMPACT,
  INGAME_CONTROL_PANEL_MODE_EXPANDED,
} = await import("../useInGameControlPanelLayout.js")

test("기본값은 compact다", () => {
  const hook = renderHook(() => useInGameControlPanelLayout())
  assert.equal(hook.result.current.expanded, false)
  assert.equal(hook.result.current.mode, INGAME_CONTROL_PANEL_MODE_COMPACT)
  hook.unmount()
})

test("expand()를 호출하면 expanded가 true, mode가 'expanded'로 바뀐다", () => {
  const hook = renderHook(() => useInGameControlPanelLayout())

  act(() => {
    hook.result.current.expand()
  })

  assert.equal(hook.result.current.expanded, true)
  assert.equal(hook.result.current.mode, INGAME_CONTROL_PANEL_MODE_EXPANDED)
  hook.unmount()
})

test("collapse()를 호출하면 expanded가 다시 false, mode가 'compact'로 돌아간다", () => {
  const hook = renderHook(() => useInGameControlPanelLayout({ defaultExpanded: true }))
  assert.equal(hook.result.current.expanded, true)

  act(() => {
    hook.result.current.collapse()
  })

  assert.equal(hook.result.current.expanded, false)
  assert.equal(hook.result.current.mode, INGAME_CONTROL_PANEL_MODE_COMPACT)
  hook.unmount()
})

test("toggle()은 매 호출마다 상태를 뒤집는다", () => {
  const hook = renderHook(() => useInGameControlPanelLayout())

  act(() => {
    hook.result.current.toggle()
  })
  assert.equal(hook.result.current.expanded, true)

  act(() => {
    hook.result.current.toggle()
  })
  assert.equal(hook.result.current.expanded, false)
  hook.unmount()
})

test("defaultExpanded:true로 시작할 수 있다", () => {
  const hook = renderHook(() => useInGameControlPanelLayout({ defaultExpanded: true }))
  assert.equal(hook.result.current.expanded, true)
  assert.equal(hook.result.current.mode, INGAME_CONTROL_PANEL_MODE_EXPANDED)
  hook.unmount()
})

test("expand/collapse/toggle는 socket이나 store를 전혀 참조하지 않는다(순수 로컬 UI 상태) — 소스에 emit/getSocket/useInGameStore가 없다", async () => {
  const { readFile } = await import("node:fs/promises")
  const source = await readFile(new URL("../useInGameControlPanelLayout.js", import.meta.url), "utf8")
  assert.doesNotMatch(source, /getSocket|emitWithAck|useInGameStore|\.emit\(/)
})
