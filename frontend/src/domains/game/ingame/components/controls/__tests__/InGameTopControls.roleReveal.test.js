/**
 * CN V-2 AC-02 — 상단 버튼 줄의 "내 역할 보기".
 *
 * 제어 패널(InGameActionPanel)이 삭제되면서 자기 역할 공개 입구가 이 줄로 옮겨왔다. 대역 없이
 * 실제 InGameTopControls·실제 ControlButton·실제 PublicAsset을 렌더한다 — 버튼을 빈 mock으로
 * 바꾸면 "자산 경로가 실제 파일을 가리키는가"가 검증에서 빠진다.
 *
 *   · roleRevealAvailable이면 기존 버튼들 **뒤에** 역할 보기 버튼이 하나 붙는다
 *   · 그 아이콘은 실제로 존재하는 public 자산을 가리킨다
 *   · 클릭은 onOpenRoleReveal을 정확히 1회 부른다
 *   · roleRevealAvailable이 아니면 버튼 자체가 없고 콜백도 0회다
 */
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

register(new URL("../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { render, cleanup, fireEvent } = await import("@testing-library/react")
const {
  default: InGameTopControls,
  INGAME_ROLE_REVEAL_BUTTON_LABEL,
  INGAME_ROLE_REVEAL_BUTTON_SRC,
} = await import("../InGameTopControls.jsx")

const REPO_ROOT = new URL("../../../../../../../../", import.meta.url)

const buttonByLabel = (container, label) =>
  container.querySelector(`button[aria-label="${label}"]`)

/** 이 줄이 그린 버튼들의 aria-label 순서. 기존 버튼의 순서·존재가 보존되는지 본다. */
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
  // PublicAsset은 요청 경로를 NFC로 정규화해 인코딩한다 — 상수 자체는 NFD다.
  assert.equal(image.getAttribute("src"), encodeURI(INGAME_ROLE_REVEAL_BUTTON_SRC.normalize("NFC")))

  // 그리고 그 경로가 가리키는 파일이 저장소에 실제로 있다(없는 자산을 가리키는 버튼을 막는다).
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
  // 남은 버튼 중 어느 것도 역할 공개를 부르지 않는다.
  for (const node of view.container.querySelectorAll("button")) fireEvent.click(node)
  assert.equal(onOpenRoleReveal.mock.callCount(), 0, "다른 버튼이 역할 공개를 불렀다")
})
