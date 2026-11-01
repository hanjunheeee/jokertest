import test from "node:test"
import assert from "node:assert/strict"
import { act } from "react"
import { JSDOM } from "jsdom"

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
const { SOUND_SETTING_VOLUMES } = await import("../../../../src/shared/constants/soundSettings.js")
const { useSoundSettings } = await import("../../../../src/shared/hooks/useSoundSettings.js")

test("초기값은 soundSettings 상수의 defaultValue와 같다", () => {
  const { result } = renderHook(() => useSoundSettings())

  for (const { id, defaultValue } of SOUND_SETTING_VOLUMES) {
    assert.equal(result.current.volumes[id], defaultValue)
  }
})

test("한 항목을 갱신해도 다른 항목 값은 그대로다", () => {
  const { result } = renderHook(() => useSoundSettings())

  const [first, second] = SOUND_SETTING_VOLUMES
  const untouchedBefore = result.current.volumes[second.id]

  act(() => result.current.setVolume(first.id, 42))

  assert.equal(result.current.volumes[first.id], 42)
  assert.equal(result.current.volumes[second.id], untouchedBefore)
})

test("항목별로 독립적으로 갱신할 수 있다", () => {
  const { result } = renderHook(() => useSoundSettings())

  for (const { id } of SOUND_SETTING_VOLUMES) {
    act(() => result.current.setVolume(id, 7))
  }

  for (const { id } of SOUND_SETTING_VOLUMES) {
    assert.equal(result.current.volumes[id], 7)
  }
})
