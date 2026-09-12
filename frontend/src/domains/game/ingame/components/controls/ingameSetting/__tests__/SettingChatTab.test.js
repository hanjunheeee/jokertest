import assert from "node:assert/strict"
import test from "node:test"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// 이 저장소의 node:test 실행에는 기본 JSX 로더가 없다 — testSupport/jsxNodeLoaderHooks.mjs가
// 만든 module.register() ESM 훅을 재사용해 실제 SettingChatTab.jsx를 그대로 마운트한다.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

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
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, fireEvent, cleanup } = await import("@testing-library/react")
test.afterEach(() => cleanup())

const { default: SettingChatTab } = await import("../SettingChatTab.jsx")
const { useSettingsStore } = await import("../../../../../../settings/store/settingsStore.js")
const { INGAME_SETTING_CHAT_SLIDER, INGAME_SETTING_CHAT_CHECKBOXES } = await import(
  "../../../../constants/controls/ingameSetting/ingameSettingData.js"
)

test.beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({ chatChecks: null, chatTextSize: null })
})

test("F-15(AC-02): 저장된 적 없으면 ingameSettingData.js의 기본값을 그대로 보여준다", () => {
  const { getByRole } = render(React.createElement(SettingChatTab))

  const slider = getByRole("slider", { name: INGAME_SETTING_CHAT_SLIDER.label })
  assert.equal(slider.value, String(INGAME_SETTING_CHAT_SLIDER.defaultValue))

  for (const { label, defaultChecked } of INGAME_SETTING_CHAT_CHECKBOXES) {
    const checkbox = getByRole("checkbox", { name: label })
    assert.equal(checkbox.getAttribute("aria-checked"), String(defaultChecked))
  }
})

test("F-15(AC-02/AC-06): 채팅 글자 크기를 바꾸면 store에 반영되고, 다시 마운트해도 유지된다", () => {
  const first = render(React.createElement(SettingChatTab))
  const slider = first.getByRole("slider", { name: INGAME_SETTING_CHAT_SLIDER.label })

  fireEvent.change(slider, { target: { value: "17" } })
  assert.equal(useSettingsStore.getState().chatTextSize, 17)
  first.unmount()

  const second = render(React.createElement(SettingChatTab))
  assert.equal(
    second.getByRole("slider", { name: INGAME_SETTING_CHAT_SLIDER.label }).value,
    "17",
  )
})

test("F-15(AC-02/AC-04): 닉네임 색상 표시 체크박스를 바꾸면 store의 chatChecks에 반영된다", () => {
  const { getByRole } = render(React.createElement(SettingChatTab))
  const checkbox = getByRole("checkbox", { name: "닉네임 색상 표시" })
  const before = checkbox.getAttribute("aria-checked")

  fireEvent.click(checkbox)

  assert.notEqual(checkbox.getAttribute("aria-checked"), before)
  assert.equal(
    useSettingsStore.getState().chatChecks["nickname-color"],
    checkbox.getAttribute("aria-checked") === "true",
  )
})

test("F-15(AC-02): 채팅 시간 표시 체크박스를 바꾸면 다른 체크박스 값은 그대로다", () => {
  const { getByRole } = render(React.createElement(SettingChatTab))
  const showTime = getByRole("checkbox", { name: "채팅 시간 표시" })
  const nicknameColor = getByRole("checkbox", { name: "닉네임 색상 표시" })
  const nicknameColorBefore = nicknameColor.getAttribute("aria-checked")

  fireEvent.click(showTime)

  assert.equal(useSettingsStore.getState().chatChecks["show-time"], true)
  assert.equal(nicknameColor.getAttribute("aria-checked"), nicknameColorBefore)
})
