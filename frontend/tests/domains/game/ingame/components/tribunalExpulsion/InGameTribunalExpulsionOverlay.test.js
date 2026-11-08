// 재판 추방 연출 창: 연달아 온 두 번째 영상도 재생되는지, 영상이 멈추면 건너뛰기가 뜨는지
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", (cb) => globalThis.setTimeout(() => cb(0), 0))
installDomGlobal("cancelAnimationFrame", (id) => globalThis.clearTimeout(id))
// 창의 시간 함수도 가짜 시계를 따르게 함
dom.window.setTimeout = (...args) => globalThis.setTimeout(...args)
dom.window.clearTimeout = (id) => globalThis.clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { act, render, cleanup, fireEvent } = await import("@testing-library/react")
const { default: Overlay } = await import(
  "../../../../../../src/domains/game/ingame/components/tribunalExpulsion/InGameTribunalExpulsionOverlay.jsx"
)
const { HOLD_MS, FADE_MS, VIDEO_WATCHDOG_MS, SKIP_LABEL } = await import(
  "../../../../../../src/domains/game/ingame/constants/ingameTribunalExpulsionPresentation.js"
)

let playCalls = 0
dom.window.HTMLMediaElement.prototype.play = function play() {
  playCalls += 1
  return Promise.resolve()
}
dom.window.HTMLMediaElement.prototype.pause = function pause() {}

test.beforeEach(() => {
  playCalls = 0
  mock.timers.enable({ apis: ["setTimeout"] })
})
test.afterEach(() => {
  cleanup()
  mock.timers.reset()
})

async function tick(ms) {
  await act(async () => {
    mock.timers.tick(ms)
    await Promise.resolve()
  })
}

test("연달아 온 두 번째 추방 연출도 영상을 그리고 재생함", async () => {
  const done = []
  const props = { open: true, message: "A 추방", onComplete: (id) => done.push(id) }
  const view = render(React.createElement(Overlay, { ...props, presentationId: "p1" }))
  assert.equal(playCalls, 1)

  // 첫 영상 끝 → 멈춤 → 어두워짐 → 문구
  fireEvent(view.container.querySelector("video"), new dom.window.Event("ended"))
  await tick(HOLD_MS)
  await tick(FADE_MS)
  assert.equal(view.container.querySelector("video"), null)
  fireEvent.click(view.container.querySelector("[data-ingame-tribunal-expulsion]"))
  assert.deepEqual(done, ["p1"])

  // 문구 단계에서 다음 연출로 바뀜
  view.rerender(React.createElement(Overlay, { ...props, message: "B 추방", presentationId: "p2" }))
  assert.ok(view.container.querySelector("video"), "두 번째 연출은 영상부터")
  assert.equal(playCalls, 2, "두 번째 영상도 재생 시작")
})

test("영상이 끝 알림 없이 멈추면 건너뛰기 버튼이 떠서 문구로 넘어감", async () => {
  const view = render(React.createElement(Overlay, { open: true, presentationId: "p1", message: "A 추방" }))
  assert.equal(view.queryByText(SKIP_LABEL), null)
  await tick(VIDEO_WATCHDOG_MS)
  const skip = view.getByText(SKIP_LABEL)
  fireEvent.click(skip)
  assert.equal(view.container.querySelector("video"), null)
  assert.ok(view.getByText("A 추방"))
})

test("닫히면 아무것도 안 그림", () => {
  const view = render(React.createElement(Overlay, { open: false, presentationId: "p1" }))
  assert.equal(view.container.innerHTML, "")
})
