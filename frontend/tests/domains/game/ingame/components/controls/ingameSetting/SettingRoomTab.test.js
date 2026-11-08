// 방관리 탭: 저장 실패만 붉은 오류·바로 알림, 불러오는 중 안내는 보통 글
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
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

register(new URL("../../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

let hookValue = null
mock.module("../../../../../../../src/domains/game/ingame/hooks/useNextRoomSettings.js", {
  namedExports: { useNextRoomSettings: () => hookValue },
})

const { render, cleanup } = await import("@testing-library/react")
const { default: SettingRoomTab } = await import(
  "../../../../../../../src/domains/game/ingame/components/controls/ingameSetting/SettingRoomTab.jsx"
)

const base = { enabled: false, canToggle: false, canDisable: true, setKeepSettings: () => {}, retry: () => {} }

test.afterEach(() => cleanup())

test("불러오는 중 안내는 status, 붉은 글 아님", () => {
  hookValue = { ...base, statusMessage: "방 설정을 불러오는 중입니다.", canRetry: false }
  const view = render(React.createElement(SettingRoomTab))
  assert.equal(view.container.querySelector("[role='alert']"), null)
  const note = view.container.querySelector("[role='status']")
  assert.ok(note)
  assert.equal(note.className.includes("ffb3a7"), false)
})

test("저장 실패는 alert와 다시 시도 버튼", () => {
  hookValue = { ...base, statusMessage: "저장하지 못했습니다.", canRetry: true }
  const view = render(React.createElement(SettingRoomTab))
  const alert = view.container.querySelector("[role='alert']")
  assert.ok(alert)
  assert.ok(alert.textContent.includes("다시 시도"))
})
