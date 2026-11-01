import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MouseEvent", dom.window.MouseEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, cleanup, fireEvent } = await import("@testing-library/react")
const {
  default: InGameTopControls,
  INGAME_ROLE_REVEAL_BUTTON_LABEL,
  INGAME_ROLE_REVEAL_BUTTON_SRC,
} = await import("../../../../../../src/domains/game/ingame/components/controls/InGameTopControls.jsx")

const REPO_ROOT = new URL("../../../../../../../", import.meta.url)

const buttonByLabel = (container, label) =>
  container.querySelector(`button[aria-label="${label}"]`)

const labelsOf = (container) =>
  [...container.querySelectorAll("button")].map((node) => node.getAttribute("aria-label"))

function renderControls(props = {}) {
  return render(React.createElement(InGameTopControls, {
    onExitClick: () => {},
    onMenuClick: () => {},
    onSettingsClick: () => {},
    ...props,
  }))
}

test.afterEach(() => { cleanup() })

test("AC-02: roleRevealAvailable이면 기존 버튼 순서를 보존한 채 마지막에 역할 보기 버튼이 붙는다", () => {
  const view = renderControls({ roleRevealAvailable: true, onOpenRoleReveal: () => {} })

  assert.deepEqual(labelsOf(view.container), [
    "게임 나가기", "플레이어별 전적목록", "인게임 설정", INGAME_ROLE_REVEAL_BUTTON_LABEL,
  ], "기존 버튼의 순서가 바뀌었거나 역할 보기 버튼이 마지막이 아니다")
})

test("AC-02: 역할 보기 버튼의 아이콘은 실제로 존재하는 public 자산을 가리킨다", async () => {
  const { access } = await import("node:fs/promises")
  const view = renderControls({ roleRevealAvailable: true, onOpenRoleReveal: () => {} })

  const image = buttonByLabel(view.container, INGAME_ROLE_REVEAL_BUTTON_LABEL).querySelector("img")
  assert.notEqual(image, null, "역할 보기 버튼이 아이콘을 그리지 않았다")
  assert.equal(image.getAttribute("src"), encodeURI(INGAME_ROLE_REVEAL_BUTTON_SRC.normalize("NFC")))

  const assetUrl = new URL(
    `frontend/public${INGAME_ROLE_REVEAL_BUTTON_SRC.normalize("NFC")}`, REPO_ROOT)
  await access(assetUrl)
})

test("AC-02: 역할 보기 버튼 클릭은 onOpenRoleReveal을 정확히 1회 부른다", () => {
  const onOpenRoleReveal = mock.fn()
  const view = renderControls({ roleRevealAvailable: true, onOpenRoleReveal })

  fireEvent.click(buttonByLabel(view.container, INGAME_ROLE_REVEAL_BUTTON_LABEL))
  assert.equal(onOpenRoleReveal.mock.callCount(), 1, "역할 보기 클릭이 정확히 1회가 아니다")
})

test("AC-02: roleRevealAvailable이 아니면 버튼 자체가 없고 콜백도 0회다", () => {
  const onOpenRoleReveal = mock.fn()
  const view = renderControls({ roleRevealAvailable: false, onOpenRoleReveal })

  assert.equal(buttonByLabel(view.container, INGAME_ROLE_REVEAL_BUTTON_LABEL), null,
    "공개할 역할이 없는데 역할 보기 버튼이 떴다")
  assert.deepEqual(labelsOf(view.container), ["게임 나가기", "플레이어별 전적목록", "인게임 설정"])
  for (const node of view.container.querySelectorAll("button")) fireEvent.click(node)
  assert.equal(onOpenRoleReveal.mock.callCount(), 0, "다른 버튼이 역할 공개를 불렀다")
})
