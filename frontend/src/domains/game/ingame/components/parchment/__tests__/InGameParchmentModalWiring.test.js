import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { createElement } from "react"
import { JSDOM } from "jsdom"
import { cleanup, fireEvent, render } from "@testing-library/react"
import InGamePhaseEntranceOverlay from "../../phaseEntrance/InGamePhaseEntranceOverlay.js"
import { getInGameParchmentModalVariant } from "../../../constants/parchment/ingameParchmentModalVariants.js"

// ---------------------------------------------------------------------------
// AC-02 · 새로 이식된 양피지 모달 셸이 실제 화면 트리에 연결돼 있는가
//
// 이 저장소의 node:test 실행에는 JSX 로더가 없다. 그래서 두 가지를 나눠 증명한다.
//
// (1) 실제 렌더 — InGamePhaseEntranceOverlay → InGameParchmentModalBase →
//     InGameParchmentPanelBase / InGameParchmentConfirmButton 체인은 전부 .js(createElement)라
//     변환기 없이 그대로 마운트할 수 있다. 그래서 이 오버레이 하나는 "새 셸이 그리는 진짜
//     DOM"(backdrop·dialog·양피지 배경·확인 버튼)과 열림·확인·닫힘 세 경로를 실물로 검증한다.
//     세 오버레이가 공유하는 것이 바로 이 셸이므로, 셸 자체의 동작은 여기서 한 번 고정된다.
//
// (2) 소스 배선 — InGamePage.jsx와 두 .jsx 오버레이는 렌더할 수 없으므로, production 소스에서
//     "페이지가 세 오버레이를 각각 정확히 한 번 마운트하고 오버레이 상태를 그대로 넘긴다" ·
//     "세 오버레이가 각자 어느 셸에 어떤 variantKey로 물려 있다"를 확인한다.
// ---------------------------------------------------------------------------

const pageUrl = new URL("../../../pages/InGamePage.jsx", import.meta.url)
const roleRevealUrl = new URL("../../roleReveal/InGameRoleRevealOverlay.jsx", import.meta.url)
const nightTurnUrl = new URL("../../nightTurn/InGameNightTurnAnnouncementOverlay.jsx", import.meta.url)
const phaseEntranceUrl = new URL("../../phaseEntrance/InGamePhaseEntranceOverlay.js", import.meta.url)

/** 양피지 셸이 실제로 그리는 public 에셋(URL 인코딩을 되돌린 원본 경로로 비교한다). */
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

/** src 속성을 사람이 읽는 원본 경로로 되돌린다(publicAsset은 NFC 정규화 + encodeURI를 한다). */
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

    // 양피지 배경 — 이 이식의 핵심 에셋이 진짜 <img src>까지 이어지는지 본다.
    const parchmentImage = dialog.querySelector('img[aria-hidden="true"]')
    assert.notEqual(parchmentImage, null, "양피지 배경 이미지가 없다")
    assert.equal(decodeAssetSrc(parchmentImage.getAttribute("src")), PARCHMENT_IMAGE_PATH.normalize("NFC"))

    // 진입 문구와 공용 확인 버튼(이미지 + 라벨)이 같은 양피지 안에 있다.
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
      props: [/open=\{nightTurn\.open\}/, /announcement=\{nightTurn\.announcement\}/, /onClose=\{nightTurn\.close\}/],
    },
    {
      tag: "InGamePhaseEntranceOverlay",
      importPath: "../components/phaseEntrance/InGamePhaseEntranceOverlay.js",
      props: [/open=\{phaseEntrance\.open\}/, /phase=\{phaseEntrance\.phase\}/, /onConfirm=\{phaseEntrance\.confirm\}/],
    },
    {
      tag: "InGameRoleRevealOverlay",
      importPath: "../components/roleReveal/InGameRoleRevealOverlay.jsx",
      props: [/open=\{roleReveal\.open\}/, /onClose=\{roleReveal\.close\}/, /roleInfo=\{roleReveal\.roleInfo\}/],
    },
  ]

  // 세 오버레이의 열림 상태는 모두 이 훅 하나가 정한다 — 페이지가 각자 따로 판정하지 않는다.
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

    // variantKey 오타는 셸이 던지므로(getInGameParchmentModalVariant), 실제 표에서 확인한다.
    const variant = getInGameParchmentModalVariant(wiring.variantKey)
    assert.equal(typeof variant.backdropLabel, "string")
    assert.equal(typeof variant.dialogLabel, "string")
  }
})
