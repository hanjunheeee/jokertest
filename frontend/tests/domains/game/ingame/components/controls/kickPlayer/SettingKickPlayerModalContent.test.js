// 추방 창 내용: 소속 id 없는 줄이 함께 "확인 중"이 되지 않음, 실패 코드는 안내 글로
import test from "node:test"
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
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("requestAnimationFrame", () => 1)
installDomGlobal("cancelAnimationFrame", () => {})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, cleanup } = await import("@testing-library/react")
const { default: Content } = await import(
  "../../../../../../../src/domains/game/ingame/components/controls/kickPlayer/SettingKickPlayerModalContent.jsx"
)
const { KICK_REQUEST_STATUS } = await import("../../../../../../../src/domains/game/ingame/constants/ingameKick.js")
const { INGAME_KICK_PLAYER_MODAL_COPY, KICK_ERROR_FALLBACK_MESSAGE } = await import(
  "../../../../../../../src/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerData.js"
)

test.afterEach(() => cleanup())

const targets = [
  { uuid: "a", nickname: "A", membershipId: null },
  { uuid: "b", nickname: "B", membershipId: null },
]

test("소속 id가 없으면 uuid로 비교해 고른 줄만 확인 중", () => {
  const view = render(React.createElement(Content, { targets, pendingTarget: targets[0] }))
  const pending = view.container.querySelectorAll(`[aria-label="${INGAME_KICK_PLAYER_MODAL_COPY.pendingAriaLabel}"]`)
  assert.equal(pending.length, 1, "고른 줄 하나만 확인 중이어야 함")
})

test("실패 코드는 그대로 안 보이고 안내 글로", () => {
  const view = render(React.createElement(Content, {
    targets, status: KICK_REQUEST_STATUS.FAILED, errorCode: "NOT_CONNECTED",
  }))
  const error = view.getByRole("alert")
  assert.equal(error.textContent.includes("NOT_CONNECTED"), false)
  assert.ok(error.textContent.length > 0)

  cleanup()
  const unknown = render(React.createElement(Content, {
    targets, status: KICK_REQUEST_STATUS.FAILED, errorCode: "WHATEVER",
  }))
  assert.equal(unknown.getByRole("alert").textContent.trim(), KICK_ERROR_FALLBACK_MESSAGE)
})
