import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  ROOM_LIST_ENTER_BTN_CLASS,
  ROOM_LIST_FOOTER_CLASS,
  ROOM_LIST_SHELL_CLASS,
} from "../roomListLayout.js"
import {
  MATCHING_ACTION_BTN_CLASS,
  MATCHING_ACTION_BTN_ROW_CLASS,
} from "../../../matching/constants/matchingPopupStyles.js"
import { SOUND_CONTROL_CLASSES } from "../../../../../shared/constants/soundControlLayout.js"
import { GAME_VIEWPORT_MAX_WIDTH_PX } from "../../../../../shared/layouts/constants/viewportLayout.js"

/**
 * /multiplay의 "선택한 방 입장" 버튼·방목록 셸 정렬 회귀 방지 스위트다. 양쪽 좌표를
 * 하드코딩하지 않고 실제 production 상수·소스에서 뽑아 계산하므로, 셸 폭이나 footer
 * pr이 나중에 바뀌면 이 테스트가 깨진다.
 * (.jsx는 이 저장소의 node:test 실행에 JSX 로더가 없어 raw source로 읽는다 —
 * InGameActionPanel.visualPolish.test.js와 같은 제약·같은 방식.)
 */

const modePageControlsUrl = new URL("../../components/ModePageControls.jsx", import.meta.url)
const matchingPageControlsUrl = new URL(
  "../../../matching/components/MatchingPageControls.jsx",
  import.meta.url,
)
const matchingPopupPanelUrl = new URL(
  "../../../matching/components/MatchingPopupPanel.jsx",
  import.meta.url,
)
const gameSetupPageControlsUrl = new URL(
  "../../../setup/components/GameSetupPageControls.jsx",
  import.meta.url,
)
const gameSetupPanelUrl = new URL("../../../setup/components/GameSetupPanel.jsx", import.meta.url)
const gameSetupCreateButtonUrl = new URL(
  "../../../setup/components/GameSetupCreateButton.jsx",
  import.meta.url,
)

const ROOT_FONT_SIZE_PX = 16
const TAILWIND_SPACING_UNIT_PX = 4
const TAILWIND_SM_BREAKPOINT_PX = 640

// 검사 대상 뷰포트 폭. 게임 화면 열이 1192px 고정 설계라 그보다 좁은 구간(768·1024)과
// 열 폭이 고정되고 사운드 폭만 vw로 계속 커지는 구간(1280 이상)을 함께 본다.
const VIEWPORT_WIDTHS_PX = [768, 1024, 1280, 1366, 1440, 1536, 1920]

// 매칭·게임 만들기 화면의 주 조작 버튼은 팝업 폭이 vw에 비례해 줄어드는 대신 사운드 폭은
// clamp 하한(210.3px)에서 멈추기 때문에, 768px에서는 매칭 버튼 행 오른쪽 끝(583px)이 사운드
// 왼쪽 경계(534px)를 약 49px 넘는다. 다만 그 폭에서는 게임 열(1192px 고정) 자체가 이미
// 설계 범위를 벗어나 목록 셸도 가로로 넘치는 상태이고, 두 화면의 팝업 스타일은 이번 변경의
// 대상 파일이 아니다. 그래서 이 두 검사는 설계 범위(1024px 이상)만 보장한다 —
// 768px 구간을 손대려면 matchingPopupStyles.js·GameSetupPanel 쪽 별도 슬라이스가 필요하다.
const DESIGNED_VIEWPORT_WIDTHS_PX = VIEWPORT_WIDTHS_PX.filter((width) => width >= 1024)

// 매칭 버튼의 group-hover:scale-[1.1](matchingPopupStyles.js)이 이 저장소에서 쓰는 가장 큰
// hover 확대다. 게임 만들기 버튼의 .interactive-scale은 1.02(index.css)라 이보다 작으므로,
// 두 화면 모두 이 값으로 재면 보수적인 판정이 된다.
const MAX_HOVER_SCALE = 1.1

/** 괄호 깊이를 세면서 최상위 콤마만 기준으로 CSS 함수 인자를 나눈다 */
/** @param text 괄호 안쪽 인자 문자열 */
/** @flow 문자를 훑으며 depth 0의 콤마에서만 잘라낸다 */
function splitTopLevelArgs(text) {
  const args = []
  let depth = 0
  let current = ""
  for (const char of text) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === "," && depth === 0) {
      args.push(current)
      current = ""
      continue
    }
    current += char
  }
  args.push(current)
  return args
}

/** CSS 길이 식(clamp/min/max, rem·vw·%·px)을 주어진 뷰포트 기준 px 수치로 환산한다 */
/** @param expr 길이 식 문자열 */
/** @param viewportWidth vw 환산에 쓰는 뷰포트 폭(px) */
/** @param percentBasisPx %를 쓸 때의 기준 폭(px). 안 쓰면 null */
/** @flow clamp/min/max면 인자를 재귀로 환산해 합성하고, 아니면 단위별로 곱한다 */
function resolveLengthPx(expr, viewportWidth, percentBasisPx = null) {
  const value = String(expr).trim()
  const call = value.match(/^(clamp|min|max)\(([\s\S]*)\)$/)
  if (call) {
    const parts = splitTopLevelArgs(call[2]).map((part) =>
      resolveLengthPx(part, viewportWidth, percentBasisPx),
    )
    if (call[1] === "min") return Math.min(...parts)
    if (call[1] === "max") return Math.max(...parts)
    assert.equal(parts.length, 3, `clamp 인자는 3개여야 한다: ${expr}`)
    return Math.max(parts[0], Math.min(parts[1], parts[2]))
  }

  const number = Number.parseFloat(value)
  assert.ok(Number.isFinite(number), `길이로 해석할 수 없다: ${expr}`)
  if (value.endsWith("rem")) return number * ROOT_FONT_SIZE_PX
  if (value.endsWith("vw")) return (number * viewportWidth) / 100
  if (value.endsWith("%")) {
    assert.ok(percentBasisPx != null, `%를 환산하려면 기준 폭이 필요하다: ${expr}`)
    return (number * percentBasisPx) / 100
  }
  return number
}

/** Tailwind arbitrary value 클래스(prefix-[...])의 괄호 안 값을 꺼낸다 */
/** @param classString 클래스 문자열(또는 raw source) */
/** @param utilityPrefix 대괄호 앞 접두사(예: "pr-", "max-w-") */
function readArbitraryValue(classString, utilityPrefix) {
  const match = classString.match(new RegExp(`(?:^|\\s)${utilityPrefix}\\[([^\\]]+)\\]`))
  assert.notEqual(match, null, `${utilityPrefix}[...]를 찾지 못했다`)
  return match[1]
}

/** 사운드 컨트롤의 실제 가로 폭 — 아이콘(음소거 버튼) + 겹침 보정 + 슬라이더 바 */
/** @param viewportWidth 뷰포트 폭(px) */
function soundControlWidthPx(viewportWidth) {
  const iconWidth = resolveLengthPx(
    readArbitraryValue(SOUND_CONTROL_CLASSES.iconSize, "w-"),
    viewportWidth,
  )
  const barWidth = resolveLengthPx(
    readArbitraryValue(SOUND_CONTROL_CLASSES.barWidth, "w-"),
    viewportWidth,
  )
  const overlap = readArbitraryValue(SOUND_CONTROL_CLASSES.iconOverlap, "-mr-")
  assert.match(overlap, /%$/, "iconOverlap은 아이콘 폭 대비 퍼센트다")
  return iconWidth * (1 - Number.parseFloat(overlap) / 100) + barWidth
}

/** 사운드 래퍼의 우측 오프셋 — sm 이상에서는 sm:right-N이 이긴다 */
/** @param wrapperSource 래퍼 div를 담은 컴포넌트 raw source */
/** @param viewportWidth 뷰포트 폭(px) */
/** @flow sm 브레이크포인트 이상이면 sm:right-N, 아니면 기본 right-N을 쓴다 */
function soundRightOffsetPx(wrapperSource, viewportWidth) {
  const base = wrapperSource.match(/(?:^|\s)right-(\d+)/)
  const small = wrapperSource.match(/\ssm:right-(\d+)/)
  assert.notEqual(base, null, "사운드 래퍼의 right-N을 찾지 못했다")
  assert.notEqual(small, null, "사운드 래퍼의 sm:right-N을 찾지 못했다")
  const step = viewportWidth >= TAILWIND_SM_BREAKPOINT_PX ? Number(small[1]) : Number(base[1])
  return step * TAILWIND_SPACING_UNIT_PX
}

/** 게임 화면 열의 폭 — .viewport-shell__game은 min(100%, 1192px)이다 */
/** @param viewportWidth 뷰포트 폭(px) */
function gameColumnWidthPx(viewportWidth) {
  return Math.min(viewportWidth, GAME_VIEWPORT_MAX_WIDTH_PX)
}

/** 사운드 컨트롤 왼쪽 경계의 열 좌표 — 이 지점부터 오른쪽은 사운드 위젯 차지다 */
/** @param wrapperSource 래퍼 div를 담은 컴포넌트 raw source */
/** @param viewportWidth 뷰포트 폭(px) */
function soundControlLeftEdgePx(wrapperSource, viewportWidth) {
  return (
    gameColumnWidthPx(viewportWidth) -
    soundRightOffsetPx(wrapperSource, viewportWidth) -
    soundControlWidthPx(viewportWidth)
  )
}

/** 목록 셸의 폭(열 폭으로 제한)과 좌우 안쪽 여백을 함께 계산한다 */
/** @param viewportWidth 뷰포트 폭(px) */
function roomListShellBoxPx(viewportWidth) {
  const width = Math.min(
    gameColumnWidthPx(viewportWidth),
    resolveLengthPx(readArbitraryValue(ROOM_LIST_SHELL_CLASS, "w-"), viewportWidth),
  )
  const padding = resolveLengthPx(readArbitraryValue(ROOM_LIST_SHELL_CLASS, "px-"), viewportWidth)
  return { width, padding }
}

/** 방목록 셸 콘텐츠 영역의 오른쪽 끝(패널·입장 버튼이 맞추는 기준선) */
/** @param viewportWidth 뷰포트 폭(px) */
function roomListShellContentRightEdgePx(viewportWidth) {
  const { width, padding } = roomListShellBoxPx(viewportWidth)
  return (gameColumnWidthPx(viewportWidth) + width) / 2 - padding
}

/** footer는 justify-end라 입장 버튼의 오른쪽 끝은 pr 여백만으로 결정된다 */
/** @param viewportWidth 뷰포트 폭(px) */
function enterButtonRightEdgePx(viewportWidth) {
  const { width, padding } = roomListShellBoxPx(viewportWidth)
  const footerPadding = resolveLengthPx(
    readArbitraryValue(ROOM_LIST_FOOTER_CLASS, "pr-"),
    viewportWidth,
  )
  return (gameColumnWidthPx(viewportWidth) + width) / 2 - padding - footerPadding
}

/** 열 가운데 정렬된 내용의 오른쪽 끝 좌표(패널 scale과 hover 확대를 함께 반영) */
/** @param params.viewportWidth 뷰포트 폭(px) */
/** @param params.contentWidth 정렬된 내용의 폭(px, scale 적용 전) */
/** @param params.scale 패널에 걸린 scale 배율 */
/** @param params.hoverGrowth 오른쪽 끝 요소가 hover로 오른쪽으로 커지는 양(px, scale 적용 전) */
function centeredRightEdgePx({ viewportWidth, contentWidth, scale, hoverGrowth }) {
  return gameColumnWidthPx(viewportWidth) / 2 + (contentWidth / 2 + hoverGrowth) * scale
}

/** raw source에서 패널 wrapper의 scale-[N] 배율을 읽는다(group-hover:scale-은 제외) */
/** @param source 패널 컴포넌트 raw source */
function readPanelScale(source) {
  const match = source.match(/(?:^|\s)scale-\[([\d.]+)\]/)
  assert.notEqual(match, null, "패널 wrapper의 scale-[N]을 찾지 못했다")
  return Number.parseFloat(match[1])
}

test("입장 버튼은 방목록 셸 오른쪽 끝(패널과 같은 기준선)에 맞춰진다", () => {
  for (const viewportWidth of VIEWPORT_WIDTHS_PX) {
    const buttonRight = enterButtonRightEdgePx(viewportWidth)
    const shellRight = roomListShellContentRightEdgePx(viewportWidth)
    assert.ok(
      Math.abs(buttonRight - shellRight) < 0.01,
      `${viewportWidth}px에서 입장 버튼(오른쪽 ${buttonRight.toFixed(1)}px)이 ` +
        `방목록 셸 오른쪽(${shellRight.toFixed(1)}px)과 ${Math.abs(buttonRight - shellRight).toFixed(1)}px 어긋난다`,
    )
  }
})

test("footer 우측 여백을 준 뒤에도 입장 버튼이 들어갈 폭이 남는다", () => {
  const buttonMinWidth = resolveLengthPx(
    readArbitraryValue(ROOM_LIST_ENTER_BTN_CLASS, "min-w-"),
    // min-w의 clamp 상한(7.75rem)이 걸리는 넓은 화면 기준으로 잰다.
    1920,
  )

  for (const viewportWidth of VIEWPORT_WIDTHS_PX) {
    const { width, padding } = roomListShellBoxPx(viewportWidth)
    const footerPadding = resolveLengthPx(
      readArbitraryValue(ROOM_LIST_FOOTER_CLASS, "pr-"),
      viewportWidth,
    )
    const usableWidth = width - padding * 2 - footerPadding
    assert.ok(
      usableWidth > buttonMinWidth,
      `${viewportWidth}px에서 footer 남는 폭 ${usableWidth.toFixed(1)}px가 ` +
        `입장 버튼 최소폭 ${buttonMinWidth.toFixed(1)}px보다 작다`,
    )
  }
})

test("footer의 pointer-events-none과 입장 버튼의 pointer-events-auto는 항상 짝을 이룬다", () => {
  // 여백을 줘도 footer 박스 자체는 사운드 컨트롤 위를 지나가므로 빈 영역은 클릭을 흘려보내야
  // 하고(none), 실제 조작 대상인 버튼은 다시 받아야 한다(auto). 한쪽만 있으면 버튼이 죽는다.
  assert.match(ROOM_LIST_FOOTER_CLASS, /(?:^|\s)pointer-events-none(?:\s|$)/)
  assert.match(ROOM_LIST_ENTER_BTN_CLASS, /(?:^|\s)pointer-events-auto(?:\s|$)/)
  assert.doesNotMatch(ROOM_LIST_ENTER_BTN_CLASS, /pointer-events-none/)
})

test("매칭 화면의 주 조작 버튼 행은 사운드 컨트롤과 겹치지 않는다(수정 대상 아님)", async () => {
  const controls = await readFile(matchingPageControlsUrl, "utf8")
  const panel = await readFile(matchingPopupPanelUrl, "utf8")

  // 사운드 래퍼는 z-30이라 스태킹 컨텍스트를 만들고, 버튼 행은 가운데 정렬이라
  // 오른쪽 아래로 흐르지 않는다 — /multiplay와 달라 그대로 둔다.
  assert.match(controls, /absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6/)
  assert.match(MATCHING_ACTION_BTN_ROW_CLASS, /(?:^|\s)mx-auto(?:\s|$)/)
  assert.match(MATCHING_ACTION_BTN_ROW_CLASS, /(?:^|\s)justify-center(?:\s|$)/)

  const scale = readPanelScale(panel)
  const buttonWidthExpr = readArbitraryValue(MATCHING_ACTION_BTN_CLASS, "w-")
  const gapExpr = readArbitraryValue(MATCHING_ACTION_BTN_ROW_CLASS, "gap-x-")
  const rowMaxExpr = readArbitraryValue(MATCHING_ACTION_BTN_ROW_CLASS, "max-w-")
  const panelWidthExpr = readArbitraryValue(panel, "w-")

  for (const viewportWidth of DESIGNED_VIEWPORT_WIDTHS_PX) {
    const panelWidth = Math.min(
      gameColumnWidthPx(viewportWidth),
      resolveLengthPx(panelWidthExpr, viewportWidth),
    )
    const buttonWidth = resolveLengthPx(buttonWidthExpr, viewportWidth)
    const gap = resolveLengthPx(gapExpr, viewportWidth)
    // 방장 화면이 버튼 3개(준비완료·게임시작·방 삭제하기)로 가장 넓다. flex-wrap이라
    // 실제 점유 폭은 max-w를 넘지 못한다.
    const rowWidth = Math.min(
      buttonWidth * 3 + gap * 2,
      resolveLengthPx(rowMaxExpr, viewportWidth, panelWidth),
    )
    const rightEdge = centeredRightEdgePx({
      viewportWidth,
      contentWidth: rowWidth,
      scale,
      hoverGrowth: (buttonWidth * (MAX_HOVER_SCALE - 1)) / 2,
    })
    const soundLeft = soundControlLeftEdgePx(controls, viewportWidth)
    assert.ok(
      rightEdge <= soundLeft,
      `${viewportWidth}px에서 매칭 버튼 행(오른쪽 ${rightEdge.toFixed(1)}px)이 ` +
        `사운드 컨트롤(왼쪽 ${soundLeft.toFixed(1)}px)과 겹친다`,
    )
  }
})

test("게임 만들기 화면의 방 생성 버튼은 사운드 컨트롤과 겹치지 않는다(수정 대상 아님)", async () => {
  const controls = await readFile(gameSetupPageControlsUrl, "utf8")
  const panel = await readFile(gameSetupPanelUrl, "utf8")
  const createButton = await readFile(gameSetupCreateButtonUrl, "utf8")

  assert.match(controls, /absolute bottom-4 right-4 z-30 sm:bottom-6 sm:right-6/)
  assert.match(createButton, /(?:^|\s)mx-auto(?:\s|")/)

  const scale = readPanelScale(panel)
  const panelWidthExpr = readArbitraryValue(panel, "w-")
  const buttonWidthExpr = readArbitraryValue(createButton, "w-")

  for (const viewportWidth of DESIGNED_VIEWPORT_WIDTHS_PX) {
    const panelWidth = Math.min(
      gameColumnWidthPx(viewportWidth),
      resolveLengthPx(panelWidthExpr, viewportWidth),
    )
    const buttonWidth = Math.min(panelWidth, resolveLengthPx(buttonWidthExpr, viewportWidth))
    const rightEdge = centeredRightEdgePx({
      viewportWidth,
      contentWidth: buttonWidth,
      scale,
      hoverGrowth: (buttonWidth * (MAX_HOVER_SCALE - 1)) / 2,
    })
    const soundLeft = soundControlLeftEdgePx(controls, viewportWidth)
    assert.ok(
      rightEdge <= soundLeft,
      `${viewportWidth}px에서 게임 만들기 버튼(오른쪽 ${rightEdge.toFixed(1)}px)이 ` +
        `사운드 컨트롤(왼쪽 ${soundLeft.toFixed(1)}px)과 겹친다`,
    )
  }
})
