// 채팅 목록: 위로 올려 읽는 중엔 새 메시지가 와도 안 끌어내림, 바닥 근처면 내림, 새 글 알림은 바깥 칸(role=log)
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
const frames = []
installDomGlobal("requestAnimationFrame", (cb) => { frames.push(cb); return frames.length })
installDomGlobal("cancelAnimationFrame", () => {})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../../../src/domains/game/ingame/components/InGamePlayerSessionContext.js", {
  namedExports: { useInGamePlayerSessionContext: () => ({ players: [], localPlayerId: null, getThemeByPlayerId: () => null, getThemeStylesByPlayerId: () => null }) },
})

const { render, cleanup, act, fireEvent } = await import("@testing-library/react")
const { default: MessageList } = await import(
  "../../../../../../src/domains/game/ingame/components/chat/InGameChatMessageList.jsx"
)

const msg = (id) => ({ id, playerId: "p", senderName: "A", text: `t${id}`, sentAt: 0 })
function runFrames() {
  act(() => { while (frames.length) frames.shift()(0) })
}
function fakeScrollBox(el) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 1000 })
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => 200 })
}

test.afterEach(() => { cleanup(); frames.length = 0 })

test("위로 올려 읽는 중이면 새 메시지가 와도 그 자리, 바닥 근처면 맨 아래로", () => {
  const view = render(React.createElement(MessageList, { messages: [msg(1)] }))
  const box = view.container.querySelector("[role='log']")
  assert.ok(box, "새 글 알림 칸이 없음")
  assert.equal(view.container.querySelector("ul[role]"), null, "목록 ul은 목록 구조 그대로여야 함")
  fakeScrollBox(box)
  runFrames()
  assert.equal(box.scrollTop, 1000, "처음엔 맨 아래")

  box.scrollTop = 100
  fireEvent.scroll(box)
  view.rerender(React.createElement(MessageList, { messages: [msg(1), msg(2)] }))
  runFrames()
  assert.equal(box.scrollTop, 100, "읽는 중인데 끌어내림")

  box.scrollTop = 790
  fireEvent.scroll(box)
  view.rerender(React.createElement(MessageList, { messages: [msg(1), msg(2), msg(3)] }))
  runFrames()
  assert.equal(box.scrollTop, 1000)
})
