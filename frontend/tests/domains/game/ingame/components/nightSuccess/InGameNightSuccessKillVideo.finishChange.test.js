// 밤 성공 영상: 재생 중 끝 알림 함수가 바뀌어도(다시 연결 등) 영상을 처음부터 다시 틀지 않음
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
installDomGlobal("requestAnimationFrame", () => 1)
installDomGlobal("cancelAnimationFrame", () => {})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

dom.window.HTMLCanvasElement.prototype.getContext = function getContext() {
  return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {}, createImageData: () => ({ data: new Uint8ClampedArray(4) }) }
}
let playCalls = 0
dom.window.HTMLMediaElement.prototype.play = function play() {
  playCalls += 1
  return Promise.resolve()
}
dom.window.HTMLMediaElement.prototype.pause = function pause() {}

register(new URL("../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: { getSfxMix: () => ({ gain: 1, muted: true }), subscribeSfxMix: () => () => {} },
})

const { act, render, cleanup, fireEvent } = await import("@testing-library/react")
const { default: KillVideo } = await import(
  "../../../../../../src/domains/game/ingame/components/nightSuccess/InGameNightSuccessKillVideo.jsx"
)

test.afterEach(() => {
  cleanup()
  playCalls = 0
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

test("finish만 바뀌면 다시 재생하지 않고, 끝나면 새 finish를 한 번 부름", async () => {
  const first = []
  const second = []
  const view = render(React.createElement(KillVideo, { eventId: "e1", src: "/v.mp4", finish: (o) => first.push(o) }))
  await flush()
  assert.equal(playCalls, 1)

  view.rerender(React.createElement(KillVideo, { eventId: "e1", src: "/v.mp4", finish: (o) => second.push(o) }))
  await flush()
  assert.equal(playCalls, 1, "끝 알림 함수만 바뀌면 처음부터 다시 틀지 않음")

  fireEvent(view.container.querySelector("video"), new dom.window.Event("ended"))
  assert.deepEqual(first, [])
  assert.deepEqual(second, ["COMPLETED"])
})

test("사건이 바뀌면 새로 재생함", async () => {
  const view = render(React.createElement(KillVideo, { eventId: "e1", src: "/v.mp4", finish: () => {} }))
  await flush()
  view.rerender(React.createElement(KillVideo, { eventId: "e2", src: "/v.mp4", finish: () => {} }))
  await flush()
  assert.equal(playCalls, 2)
})
