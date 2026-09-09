import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameActionPanel.jsx", import.meta.url)
const pickerUrl = new URL("../InGameTargetPicker.jsx", import.meta.url)

/**
 * 이 스위트는 컨트롤 패널 이식으로 들어온 시각 요소(phase 배지, 주요 액션 아웃라인, 이벤트
 * 카운트 배지, 대상 카드 아바타)가 실제 production 소스에 배선돼 있는지 증명한다.
 * InGameActionPanel.jsx/InGameTargetPicker.jsx는 .jsx라 이 저장소의 node:test 실행에는 JSX
 * 로더가 없어 직접 렌더링할 수 없으므로, raw source 검증으로 배선을 증명한다.
 *
 * 원격 UI(feature/ui-Phase1complete)에서 가져왔고, 두 곳만 이 저장소의 계약에 맞췄다.
 * (1) phase 배지는 낮 하위 구간(dayPhase)까지 보여준다 — 같은 DAY라도 토론/투표에서 할 수
 *     있는 일이 다르기 때문이다.
 * (2) 주요 액션 개수와 건너뛰기 버튼의 disabled 식은 로컬 훅 계약(nightActionsLocked 하나로
 *     합쳐진 잠금 + 토론 준비·밤 종료 컨트롤)을 따른다.
 */

test("헤더는 phase 배지(CONTROL_PANEL_PHASE_BADGE_CLASS)와 '제 N일' 타이틀을 함께 보여주고, 낮에는 하위 구간까지 비춘다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(
    source,
    /<span className=\{CONTROL_PANEL_PHASE_BADGE_CLASS\}>\s*\{gameState\.phase === "DAY" && dayPhase \? dayPhase : gameState\.phase\}\s*<\/span>/,
  )
  assert.match(source, /<p className=\{INGAME_ACTION_TITLE_CLASS\}>제 \{gameState\.dayIndex\}일<\/p>/)
})

test("승리 배지는 여전히 getInGameWinResultLabel(gameState.winResult)일 때만 렌더된다(조건부 로직 불변)", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(
    source,
    /\{getInGameWinResultLabel\(gameState\.winResult\) \? \(\s*<p className=\{CONTROL_PANEL_WIN_BADGE_CLASS\}>/,
  )
})

test("제출/집계/판정 버튼만 주요 액션 아웃라인을 쓰고, 기권/건너뛰기 버튼은 그대로 기본 스타일이다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const primaryOccurrences =
    source.match(/className=\{`\$\{INGAME_ACTION_BUTTON_CLASS\} \$\{CONTROL_PANEL_PRIMARY_ACTION_EXTRA_CLASS\}`\}/g) ?? []
  // 투표 시작 준비, 투표, 낮 집계, 재판 투표 제출, 재판 판정, 행동 확정, 밤 종료 —
  // 일곱 개의 "앞으로 나아가는" 액션.
  assert.equal(primaryOccurrences.length, 7)

  // 버튼 블록 전체를 [\s\S]*?로 잘라내면(파일 안에 <button이 여럿이라) 이전 버튼들까지 함께
  // 걸려 오탐이 난다 — 대신 "그 버튼 바로 위 className이 순수 INGAME_ACTION_BUTTON_CLASS인 채로
  // onClick={abstainDayVote/skipNightAction}로 곧장 이어지는지"를 직접 확인해 정확히 그
  // 버튼 하나만 겨냥한다.
  assert.match(
    source,
    /className=\{INGAME_ACTION_BUTTON_CLASS\}\s*\n\s*disabled=\{!dayVoteControlsEnabled \|\| dayVoteStatus === "submitting"\}\s*\n\s*onClick=\{abstainDayVote\}/,
  )
  assert.match(
    source,
    /className=\{INGAME_ACTION_BUTTON_CLASS\}\s*\n\s*disabled=\{nightActionStatus === "submitting" \|\| nightActionsLocked\}\s*\n\s*onClick=\{skipNightAction\}/,
  )
})

test("이벤트 로그 캡션 옆에는 latestEvents가 있을 때만 개수 배지가 붙는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(
    source,
    /<p className=\{INGAME_ACTION_CAPTION_CLASS\}>이벤트 로그<\/p>\s*\{latestEvents\.length \? \(\s*<span className=\{CONTROL_PANEL_EVENT_COUNT_BADGE_CLASS\}>\{latestEvents\.length\}<\/span>\s*\) : null\}/,
  )
})

test("에러 배너는 여전히 error 값 하나만 조건으로 렌더되고(장식 아이콘 추가는 조건 로직에 영향 없음), INGAME_ACTION_ERROR_BANNER_CLASS를 그대로 쓴다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(
    source,
    /\{error \? \(\s*<p className=\{INGAME_ACTION_ERROR_BANNER_CLASS\}>\s*<span aria-hidden="true"[^>]*>⚠<\/span>\s*\{error\}\s*<\/p>\s*\) : null\}/,
  )
})

test("내 역할 보기 버튼의 disabled/onClick 배선은 장식 아이콘 추가와 무관하게 그대로다", async () => {
  const source = await readFile(componentUrl, "utf8")
  const roleRevealBlockMatch = source.match(/<button[\s\S]*?onClick=\{onOpenRoleReveal\}[\s\S]*?<\/button>/)
  assert.notEqual(roleRevealBlockMatch, null)
  assert.match(roleRevealBlockMatch[0], /disabled=\{!roleRevealAvailable \|\| interactionBlocked\}/)
  assert.match(roleRevealBlockMatch[0], />\s*내 역할 보기/)
})

test("InGameTargetPicker 카드는 이니셜 아바타(TARGET_CARD_AVATAR_CLASS)를 추가로 보여주되, 상태 dot·이름·onSelect·disabled 배선은 그대로다", async () => {
  const source = await readFile(pickerUrl, "utf8")
  assert.match(source, /className=\{TARGET_CARD_AVATAR_CLASS\}/)
  assert.match(source, /resolveInitial\(player\)/)
  assert.match(source, /className=\{INGAME_ACTION_TARGET_NAME_CLASS\}>\{player\.name\}/)
  assert.match(source, /aria-hidden="true"\s+className=\{resolveStatusDotClass\(player\)\}/)
  assert.match(source, /onClick=\{\(\) => onSelect\(player\.id\)\}/)
  assert.match(
    source,
    /disabled=\{disabled \|\| !player\.connected \|\| player\.selectable === false\}/,
  )
})

test("아바타 이니셜은 이름이 비어 있어도 안전한 기본값(?)을 반환한다(런타임 크래시 없음)", async () => {
  const source = await readFile(pickerUrl, "utf8")
  assert.match(
    source,
    /function resolveInitial\(player\) \{\s*return typeof player\.name === "string" && player\.name\.length > 0 \? player\.name\.slice\(0, 1\) : "\?"\s*\}/,
  )
})
