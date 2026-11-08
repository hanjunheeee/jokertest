// 재판 연출 문지기: 피고를 보드 목록에서 못 찾아도 연출(과 그 안 채팅)을 띄움, 판정 버튼은 개발 빌드에서만
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
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

let boardPlayers = []
mock.module("../../../../../../src/domains/game/ingame/components/InGamePlayerSessionContext.js", {
  namedExports: { useInGamePlayerSessionContext: () => ({ players: boardPlayers, localPlayerId: "me" }) },
})
mock.module("../../../../../../src/domains/game/ingame/components/chat/InGameChatSessionContext.js", {
  namedExports: { useInGameChatSessionContext: () => ({ messages: [] }) },
})
const { render, cleanup, act } = await import("@testing-library/react")
const { default: Gate } = await import(
  "../../../../../../src/domains/game/ingame/components/tribunalPresentation/InGameTribunalPresentationGate.jsx"
)
const { useInGameStore } = await import("../../../../../../src/domains/game/ingame/store/ingameStore.js")

function seed() {
  act(() => {
    useInGameStore.setState({
      gameId: "g1",
      state: {
        id: "g1", phase: "TRIBUNAL", dayIndex: 1,
        tribunal: { defendantUuid: "d1", resolved: false },
        players: [{ uuid: "d1", nickname: "피고", alive: true }],
        self: { uuid: "me" },
      },
    })
  })
}

test.afterEach(() => {
  cleanup()
  boardPlayers = []
})

test("피고가 보드 목록에 없어도 연출을 띄우고 이름은 판 명단에서", () => {
  seed()
  const view = render(React.createElement(Gate))
  assert.ok(view.container.querySelector("[data-ingame-tribunal-presentation]"), "연출이 안 뜸")
  assert.ok(view.container.textContent.includes("피고"))
})

test("개발 빌드가 아니면 판정 버튼 글자를 안 넘김", () => {
  seed()
  boardPlayers = [{ id: "d1", nickname: "피고" }]
  const view = render(React.createElement(Gate))
  assert.ok(view.container.querySelector("[data-ingame-tribunal-presentation]"))
  assert.equal(view.container.querySelector("[data-dev-tribunal-resolve]"), null)
})
