import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameActionPanel.jsx", import.meta.url)
const pickerUrl = new URL("../InGameTargetPicker.jsx", import.meta.url)
const pageUrl = new URL("../../../pages/InGamePage.jsx", import.meta.url)

/**
 * 이 스위트는 "프레임은 그대로 두고 안쪽 프레젠테이션만 다듬는다" 슬라이스(컨트롤 패널 시각
 * 리디자인)의 구조 회귀를 지킨다. InGameActionPanel.jsx는 .jsx라 이 저장소의 node:test
 * 실행에는 JSX 로더가 없어 직접 렌더링할 수 없으므로(다른 InGameActionPanel.*.test.js와
 * 동일한 제약), 여기서도 raw source 검증으로 실제 production 배선을 증명한다.
 */

test("헤더/유틸리티/각 phase 섹션이 캡션(INGAME_ACTION_CAPTION_CLASS)으로 구분돼 있다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const captionOccurrences = source.match(/className=\{INGAME_ACTION_CAPTION_CLASS\}/g) ?? []
  // 낮 투표 · 재판 · 밤 행동 · 이벤트 로그, 네 섹션 각각 캡션 한 줄씩(악센트 바와 함께 묶인다).
  assert.equal(captionOccurrences.length, 4)
  assert.match(source, />투표 대상 선택</)
  assert.match(source, />유무죄 판단</)
  assert.match(source, />밤 행동</)
  assert.match(source, />이벤트 로그</)
})

test("각 phase 섹션 캡션은 CONTROL_PANEL_SECTION_ACCENT_CLASS 악센트 바와 한 행에 묶여 층위감을 준다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const accentRowOccurrences =
    source.match(
      /<div className=\{CONTROL_PANEL_SECTION_HEADER_ROW_CLASS\}>\s*<span aria-hidden="true" className=\{CONTROL_PANEL_SECTION_ACCENT_CLASS\} \/>\s*<p className=\{INGAME_ACTION_CAPTION_CLASS\}>/g,
    ) ?? []
  assert.equal(accentRowOccurrences.length, 4)
})

test("DAY/NIGHT 두 phase 모두 InGameTargetPicker로 참가자 대상 영역을 렌더한다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const pickerOccurrences = source.match(/<InGameTargetPicker\b/g) ?? []
  assert.equal(pickerOccurrences.length, 2)
})

test("낮 투표·재판·밤 행동 버튼 행은 공통 INGAME_ACTION_BUTTON_ROW_CLASS를 재사용한다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const rowOccurrences = source.match(/className=\{INGAME_ACTION_BUTTON_ROW_CLASS\}/g) ?? []
  assert.equal(rowOccurrences.length, 3)
})

test("프레임 셸(PublicAsset+panelFrame)은 여전히 콘텐츠보다 먼저 렌더되는 컨트롤 패널의 루트 레이어다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const frameWrapIndex = source.indexOf("CONTROL_PANEL_FRAME_WRAP_CLASS} ${sizeClass}")
  const frameAssetIndex = source.indexOf("src={INGAME_VOTE_ASSETS.panelFrame}", frameWrapIndex)
  const contentWrapIndex = source.indexOf("CONTROL_PANEL_CONTENT_WRAP_CLASS}", frameWrapIndex)
  const headerIndex = source.indexOf("INGAME_ACTION_HEADER_CLASS", frameWrapIndex)

  assert.ok(frameWrapIndex > -1, "sizeClass를 쓰는 프레임 래퍼를 찾을 수 없다")
  assert.ok(
    frameWrapIndex < frameAssetIndex && frameAssetIndex < contentWrapIndex && contentWrapIndex < headerIndex,
    "프레임 이미지는 콘텐츠 래퍼보다 먼저, 콘텐츠 래퍼는 헤더보다 먼저 와야 셸이 조작 UI를 감싼다",
  )
})

test("내 역할 보기 버튼은 여전히 onOpenRoleReveal·roleRevealAvailable·interactionBlocked를 그대로 사용한다(콜백 pass-through)", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /onClick=\{onOpenRoleReveal\}/)
  assert.match(source, /disabled=\{!roleRevealAvailable \|\| interactionBlocked\}/)
})

test("InGamePage는 여전히 컨트롤 패널을 정확히 한 번만 마운트하고 콜백 props를 그대로 전달한다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const occurrences = source.match(/<InGameActionPanel\b/g) ?? []
  assert.equal(occurrences.length, 1, "컨트롤 패널은 중복 마운트되면 안 된다")

  const panelBlockMatch = source.match(/<InGameActionPanel[\s\S]*?\/>/)
  assert.notEqual(panelBlockMatch, null)
  assert.match(panelBlockMatch[0], /onOpenRoleReveal=\{roleReveal\.reopen\}/)
  assert.match(panelBlockMatch[0], /roleRevealAvailable=\{Boolean\(roleReveal\.roleInfo\)\}/)
  assert.match(panelBlockMatch[0], /interactionBlocked=\{interactionBlocked\}/)
})

test("InGameTargetPicker 카드는 상태 dot과 이름/상태 표시를 갖고, onSelect·disabled 배선은 그대로다", async () => {
  const source = await readFile(pickerUrl, "utf8")
  assert.match(source, /onClick=\{\(\) => onSelect\(player\.id\)\}/)
  assert.match(
    source,
    /disabled=\{disabled \|\| !player\.alive \|\| !player\.connected \|\| player\.selectable === false\}/,
  )
  assert.match(source, /aria-hidden="true"\s+className=\{resolveStatusDotClass\(player\)\}/)
})
