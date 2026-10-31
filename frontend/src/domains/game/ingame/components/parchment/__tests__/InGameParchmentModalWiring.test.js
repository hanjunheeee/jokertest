import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { createElement } from "react"
import { JSDOM } from "jsdom"
import { cleanup, fireEvent, render } from "@testing-library/react"
import InGamePhaseEntranceOverlay from "../../phaseEntrance/InGamePhaseEntranceOverlay.js"
import { getInGameParchmentModalVariant } from "../../../constants/parchment/ingameParchmentModalVariants.js"

const pageUrl = new URL("../../../pages/InGamePage.jsx", import.meta.url)
const roleRevealUrl = new URL("../../roleReveal/InGameRoleRevealOverlay.jsx", import.meta.url)
const nightTurnUrl = new URL("../../nightTurn/InGameNightTurnAnnouncementOverlay.jsx", import.meta.url)
const phaseEntranceUrl = new URL("../../phaseEntrance/InGamePhaseEntranceOverlay.js", import.meta.url)

const PARCHMENT_IMAGE_PATH = "/frame/양피지 모달.png"
const CONFIRM_BUTTON_IMAGE_PATH = "/button/버튼(수락 및 긍정).png"

let overlayDom = null

function ensureClientEnvironment() {
  if (globalThis.document?.body) return

  overlayDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
  globalThis.window = overlayDom.window
  globalThis.document = overlayDom.window.document
  globalThis.HTMLElement = overlayDom.window.HTMLElement
  globalThis.Node = overlayDom.window.Node
  globalThis.MutationObserver = overlayDom.window.MutationObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
}

function decodeAssetSrc(src) {
  return decodeURI(src ?? "").normalize("NFC")
}

function renderPhaseEntrance(props) {
  ensureClientEnvironment()
  return render(createElement(InGamePhaseEntranceOverlay, props))
}

test("DAY/NIGHT 진입 오버레이는 새 파치먼트 셸이 그리는 backdrop·양피지·확인 버튼을 실제로 마운트한다", () => {
  try {
    renderPhaseEntrance({ open: true, phase: "DAY", onConfirm: () => {} })

    const wrapper = document.querySelector('[data-ingame-phase-entrance="DAY"]')
    assert.notEqual(wrapper, null, "phase entrance 래퍼가 화면 트리에 없다")

    const variant = getInGameParchmentModalVariant("phaseEntrance")
    const backdrop = wrapper.querySelector(`button[aria-label="${variant.backdropLabel}"]`)
    assert.notEqual(backdrop, null, "셸의 backdrop 버튼이 없다")

    const dialog = wrapper.querySelector('[role="dialog"][aria-modal="true"]')
    assert.notEqual(dialog, null, "셸의 dialog 레이어가 없다")
    assert.equal(dialog.getAttribute("aria-label"), variant.dialogLabel)

    const parchmentImage = dialog.querySelector('img[aria-hidden="true"]')
    assert.notEqual(parchmentImage, null, "양피지 배경 이미지가 없다")
    assert.equal(decodeAssetSrc(parchmentImage.getAttribute("src")), PARCHMENT_IMAGE_PATH.normalize("NFC"))

    assert.equal(dialog.textContent.includes("낮이 되었습니다"), true)
    const confirmButton = dialog.querySelector('button[aria-label="확인"]')
    assert.notEqual(confirmButton, null, "공용 확인 버튼이 없다")
    const confirmImage = confirmButton.querySelector("img")
    assert.notEqual(confirmImage, null)
    assert.equal(
      decodeAssetSrc(confirmImage.getAttribute("src")),
      CONFIRM_BUTTON_IMAGE_PATH.normalize("NFC"),
    )
  } finally {
    cleanup()
  }
})

test("확인 버튼·backdrop 클릭·Escape 세 경로가 모두 같은 닫기 콜백으로 모인다", () => {
  const variant = getInGameParchmentModalVariant("phaseEntrance")

  for (const [pathName, dismiss] of [
    ["확인 버튼", (root) => fireEvent.click(root.querySelector('button[aria-label="확인"]'))],
    [
      "backdrop",
      (root) => fireEvent.click(root.querySelector(`button[aria-label="${variant.backdropLabel}"]`)),
    ],
    ["Escape", () => fireEvent.keyDown(globalThis.window, { key: "Escape" })],
  ]) {
    const calls = []
    try {
      renderPhaseEntrance({ open: true, phase: "NIGHT", onConfirm: () => calls.push(pathName) })
      const wrapper = document.querySelector('[data-ingame-phase-entrance="NIGHT"]')
      assert.notEqual(wrapper, null)

      dismiss(wrapper)
      assert.deepEqual(calls, [pathName], `${pathName} 경로가 닫기 콜백을 부르지 않았다`)
    } finally {
      cleanup()
    }
  }
})

test("open이 아니거나 DAY/NIGHT가 아닌 phase에서는 셸을 아예 마운트하지 않는다", () => {
  try {
    renderPhaseEntrance({ open: false, phase: "DAY", onConfirm: () => {} })
    assert.equal(document.querySelector("[data-ingame-phase-entrance]"), null)
    cleanup()

    renderPhaseEntrance({ open: true, phase: "TRIBUNAL", onConfirm: () => {} })
    assert.equal(document.querySelector("[data-ingame-phase-entrance]"), null)
  } finally {
    cleanup()
  }
})

test("InGamePage는 새 셸을 쓰는 세 오버레이를 각각 정확히 한 번 마운트하고 오버레이 스택 상태를 그대로 넘긴다", async () => {
  const source = await readFile(pageUrl, "utf8")

  const mounts = [
    {
      tag: "InGameNightTurnAnnouncementOverlay",
      importPath: "../components/nightTurn/InGameNightTurnAnnouncementOverlay.jsx",
      props: [
        /open=\{nightTurn\.open && !nightPresentationWaitOpen\}/,
        /announcement=\{nightTurn\.announcement\}/,
        /onClose=\{nightTurn\.close\}/,
      ],
    },
    {
      tag: "InGamePhaseEntranceOverlay",
      importPath: "../components/phaseEntrance/InGamePhaseEntranceOverlay.js",
      props: [
        /open=\{phaseEntrance\.open && !nightPresentationWaitOpen\}/,
        /phase=\{phaseEntrance\.phase\}/,
        /onConfirm=\{phaseEntrance\.confirm\}/,
      ],
    },
    {
      tag: "InGameRoleRevealOverlay",
      importPath: "../components/roleReveal/InGameRoleRevealOverlay.jsx",
      props: [/open=\{roleReveal\.open\}/, /onClose=\{roleReveal\.close\}/, /roleInfo=\{roleReveal\.roleInfo\}/],
    },
  ]

  assert.match(source, /useInGameOverlayStack\(\)/)
  assert.match(source, /const \{ roleReveal, phaseEntrance, nightTurn, interactionBlocked \} =/)

  for (const mount of mounts) {
    assert.match(
      source,
      new RegExp(`import ${mount.tag} from "${mount.importPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${mount.tag} import가 없다`,
    )

    const occurrences = source.match(new RegExp(`<${mount.tag}\\b`, "g")) ?? []
    assert.equal(occurrences.length, 1, `${mount.tag}은 정확히 한 번만 마운트돼야 한다`)

    const block = source.match(new RegExp(`<${mount.tag}[\\s\\S]*?/>`))
    assert.notEqual(block, null, `${mount.tag} 마운트 블록을 찾을 수 없다`)
    for (const prop of mount.props) {
      assert.match(block[0], prop, `${mount.tag}의 ${prop} 배선이 없다`)
    }
  }

  assert.match(source, /\{nightPresentationWaitOpen \? null : \(\s*<InGameRoleRevealOverlay/)
})

test("세 오버레이는 각자 새 파치먼트 셸에 물려 있고, 셸이 아는 variantKey만 쓴다", async () => {
  const wirings = [
    {
      url: roleRevealUrl,
      shellImport: /import InGameParchmentModalAnimated from "\.\.\/parchment\/InGameParchmentModalAnimated\.jsx"/,
      shellUse: /<InGameParchmentModalAnimated\b/,
      variantKey: "roleReveal",
      variantUse: /variantKey="roleReveal"/,
      dismiss: /onDismiss=\{onClose\}/,
    },
    {
      url: nightTurnUrl,
      shellImport: /import InGameParchmentModalAnimated from "\.\.\/parchment\/InGameParchmentModalAnimated\.jsx"/,
      shellUse: /<InGameParchmentModalAnimated\b/,
      variantKey: "nightTurn",
      variantUse: /variantKey="nightTurn"/,
      dismiss: /onDismiss=\{onClose\}/,
    },
    {
      url: phaseEntranceUrl,
      shellImport: /import InGameParchmentModalBase from "\.\.\/parchment\/InGameParchmentModalBase\.js"/,
      shellUse: /createElement\(InGameParchmentModalBase, \{/,
      variantKey: "phaseEntrance",
      variantUse: /variantKey: "phaseEntrance"/,
      dismiss: /onDismiss: onConfirm/,
    },
  ]

  for (const wiring of wirings) {
    const source = await readFile(wiring.url, "utf8")
    assert.match(source, wiring.shellImport, `${wiring.variantKey}: 셸 import가 없다`)
    assert.match(source, wiring.shellUse, `${wiring.variantKey}: 셸을 렌더하지 않는다`)
    assert.match(source, wiring.variantUse, `${wiring.variantKey}: variantKey 배선이 없다`)
    assert.match(source, wiring.dismiss, `${wiring.variantKey}: 닫기 콜백이 셸로 이어지지 않는다`)

    const variant = getInGameParchmentModalVariant(wiring.variantKey)
    assert.equal(typeof variant.backdropLabel, "string")
    assert.equal(typeof variant.dialogLabel, "string")
  }
})
