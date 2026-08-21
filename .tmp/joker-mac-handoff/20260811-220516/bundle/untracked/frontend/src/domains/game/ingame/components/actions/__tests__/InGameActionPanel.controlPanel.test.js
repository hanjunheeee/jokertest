import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameActionPanel.jsx", import.meta.url)

/**
 * InGameActionPanel.jsx는 실제 JSX 문법을 쓰는 .jsx 파일이라 이 저장소의 node:test 실행에는
 * JSX 로더가 없어 직접 import/렌더링할 수 없다(InGameActionPanel.productionSource.test.js와
 * 동일한 제약 — 그 파일의 주석 참고). 그래서 여기서도 raw source 문자열 검증으로 production
 * 배선을 증명한다.
 */

test("컨트롤 패널은 useInGameControlPanelLayout으로 compact/expanded 상태를 관리한다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /import \{ useInGameControlPanelLayout \} from "..\/..\/hooks\/useInGameControlPanelLayout\.js"/)
  assert.match(source, /useInGameControlPanelLayout\(\)/)
})

test("패널은 우측 하단에 앵커링되고(z-30, absolute bottom/right), expanded일 때만 더 큰 max-width/max-height를 쓴다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /CONTROL_PANEL_BASE_CLASS\s*=\s*\n?\s*"absolute bottom-\[.*\] right-\[.*\] z-30/)
  assert.match(source, /CONTROL_PANEL_COMPACT_SIZE_CLASS/)
  assert.match(source, /CONTROL_PANEL_EXPANDED_SIZE_CLASS/)
  assert.match(source, /expanded \? CONTROL_PANEL_EXPANDED_SIZE_CLASS : CONTROL_PANEL_COMPACT_SIZE_CLASS/)
})

test("펼치기/접기 버튼은 접근 가능한 aria-label과 aria-expanded를 노출하고, 클릭 핸들러는 순수 토글이다(gameplay setter 호출 없음)", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /aria-expanded=\{expanded\}/)
  assert.match(source, /aria-label=\{expanded \? "컨트롤 패널 접기" : "컨트롤 패널 펼치기"\}/)
  assert.match(source, /onClick=\{toggleExpanded\}/)
})

test("접고 펴는 토글은 어떤 소켓 emit도 만들지 않는다 — toggleExpanded는 훅에서 온 로컬 상태 setter일 뿐이다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const toggleButtonBlockMatch = source.match(/<button[\s\S]*?onClick=\{toggleExpanded\}[\s\S]*?<\/button>/)
  assert.notEqual(toggleButtonBlockMatch, null, "toggleExpanded 버튼 블록을 찾을 수 없다")
  assert.doesNotMatch(toggleButtonBlockMatch[0], /emit|Socket/)
})

test("접고 펴는 토글은 게임 진행 중 선택값(밤 대상·낮 투표 대상·재판 투표)을 건드리지 않는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const toggleButtonBlockMatch = source.match(/<button[\s\S]*?onClick=\{toggleExpanded\}[\s\S]*?<\/button>/)
  assert.notEqual(toggleButtonBlockMatch, null)
  assert.doesNotMatch(
    toggleButtonBlockMatch[0],
    /setSelectedNightTargetId|setSelectedDayVoteTargetId|setSelectedTribunalVote/,
  )
})

test("compact/expanded와 무관하게 기존 enabled/disabled/pending/error 배선은 그대로 남아있다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /disabled=\{!dayVoteControlsEnabled \|\| dayVoteStatus === "submitting"\}/)
  assert.match(source, /disabled=\{!nightActionControlsEnabled \|\| nightActionStatus !== "idle" \|\| !hasTarget \|\| nightActionsLocked\}/)
  assert.match(source, /disabled=\{!tribunalVoteControlsEnabled\}/)
  assert.match(source, /dayVoteError \?/)
  assert.match(source, /nightActionError \?/)
  assert.match(source, /tribunalVoteError \?/)
})

test("이벤트 로그 섹션은 expanded일 때만 렌더링된다(compact는 게임 조작에 집중)", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(
    source,
    /\{expanded \? \(\s*<div className=\{INGAME_ACTION_SECTION_CLASS\}>\s*<div className=\{CONTROL_PANEL_SECTION_HEADER_ROW_CLASS\}>\s*<span aria-hidden="true" className=\{CONTROL_PANEL_SECTION_ACCENT_CLASS\} \/>\s*<p className=\{INGAME_ACTION_CAPTION_CLASS\}>이벤트 로그<\/p>/,
  )
})

test("낮 투표/재판/밤 행동 컨트롤은 여전히 정확히 한 번씩만 렌더링된다(패널 재배치로 중복되지 않는다)", async () => {
  const source = await readFile(componentUrl, "utf8")
  const dayVoteButtonOccurrences = source.match(/onClick=\{submitDayVote\}/g) ?? []
  const tribunalSubmitOccurrences = source.match(/onClick=\{\(\) => submitTribunalVote\(selectedTribunalVote\)\}/g) ?? []
  const nightSubmitOccurrences = source.match(/onClick=\{submitNightAction\}/g) ?? []
  assert.equal(dayVoteButtonOccurrences.length, 1)
  assert.equal(tribunalSubmitOccurrences.length, 1)
  assert.equal(nightSubmitOccurrences.length, 1)
})
