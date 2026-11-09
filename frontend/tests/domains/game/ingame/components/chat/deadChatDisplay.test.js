// 죽은 사람끼리 채팅 표시 (사용자 결정 2026-11-09): 채팅 칸 위 "죽은 사람끼리", 죽은 사람 말은 회색, 낮 채팅과 시각 순으로 섞임
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
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("requestAnimationFrame", () => 1)
installDomGlobal("cancelAnimationFrame", () => {})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const THEME = { color: "#ff0000" }
mock.module("../../../../../../src/domains/game/ingame/components/InGamePlayerSessionContext.js", {
  namedExports: { useInGamePlayerSessionContext: () => ({ players: [], localPlayerId: null, getThemeByPlayerId: () => null, getThemeStylesByPlayerId: () => THEME }) },
})

const { render, cleanup } = await import("@testing-library/react")
const { default: InGameChatContent } = await import(
  "../../../../../../src/domains/game/ingame/components/chat/InGameChatContent.jsx"
)
const { default: InGameChatCloseupOverlay } = await import(
  "../../../../../../src/domains/game/ingame/components/chat/InGameChatCloseupOverlay.jsx"
)
const { mergeChatMessagesByTime } = await import(
  "../../../../../../src/domains/game/ingame/utils/mergeChatMessages.js"
)

test.afterEach(() => { cleanup() })

const base = { draft: "", onDraftChange: () => {}, onSend: () => {} }
const messages = [
  { id: "d1", playerId: "a", senderName: "산사람", text: "낮 말", sentAt: 1, channel: "DAY" },
  { id: "x1", playerId: "b", senderName: "죽은이", text: "죽은 말", sentAt: 2, channel: "DEAD" },
]

test("죽은 뒤 채팅 칸: 위에 '죽은 사람끼리', 죽은 사람 말 줄은 회색이고 낮 말은 테마 색 그대로", () => {
  const view = render(React.createElement(InGameChatContent, { ...base, messages, isDeadChat: true }))
  const badge = view.container.querySelector("[data-dead-chat-badge]")
  assert.ok(badge, "죽은 사람끼리 표시가 없음")
  assert.equal(badge.textContent, "죽은 사람끼리")

  const deadRow = view.container.querySelector("li[data-chat-channel='DEAD']")
  const dayRow = view.container.querySelector("li[data-chat-channel='DAY']")
  assert.ok(deadRow && dayRow)
  for (const span of deadRow.querySelectorAll("span")) {
    assert.equal(span.style.color, "rgb(169, 169, 169)", "죽은 사람 말은 회색")
  }
  assert.equal(dayRow.querySelector("span").style.color, "rgb(255, 0, 0)", "낮 말은 테마 색")
})

test("채팅 크게 보기 창에도 죽은 뒤엔 '죽은 사람끼리' 표시 (채팅 틀이 넘긴 isDeadChat을 내용에 전달)", () => {
  const view = render(React.createElement(InGameChatCloseupOverlay, { ...base, open: true, onClose: () => {}, messages, isDeadChat: true }))
  const badge = document.body.querySelector("[role='dialog'] [data-dead-chat-badge]")
  assert.ok(badge, "크게 보기 창에 죽은 사람끼리 표시가 없음")
  view.unmount()

  const alive = render(React.createElement(InGameChatCloseupOverlay, { ...base, open: true, onClose: () => {}, messages }))
  assert.equal(document.body.querySelector("[role='dialog'] [data-dead-chat-badge]"), null)
  alive.unmount()
})

test("산 사람 채팅 칸엔 '죽은 사람끼리' 표시가 없음", () => {
  const view = render(React.createElement(InGameChatContent, { ...base, messages: [messages[0]] }))
  assert.equal(view.container.querySelector("[data-dead-chat-badge]"), null)
})

test("채팅 목록 섞기: 보낸 시각 순, 같은 시각은 넣은 순서, 이상한 시각은 맨 뒤", () => {
  const merged = mergeChatMessagesByTime(
    [{ id: "a", sentAt: 3 }, { id: "b", sentAt: 1 }],
    [{ id: "c", sentAt: 1 }, { id: "d", sentAt: Number.NaN }],
    null,
  )
  assert.deepEqual(merged.map((m) => m.id), ["b", "c", "a", "d"])
})
