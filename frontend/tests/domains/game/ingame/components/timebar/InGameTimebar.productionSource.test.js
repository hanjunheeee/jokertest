import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../../../../../../src/domains/game/ingame/components/timebar/InGameTimebar.jsx", import.meta.url)
const pageUrl = new URL("../../../../../../src/domains/game/ingame/pages/InGamePage.jsx", import.meta.url)

test("확대 시 타이머바·게이지 컴포넌트를 마운트하고 텍스트 status 줄은 그리지 않는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /InGamePhaseTurnTimerPanel/)
  assert.match(source, /frameExpanded/)
  assert.doesNotMatch(source, /INGAME_TIMEBAR_STATUS_CLASS/)
})

test("문구를 컴포넌트가 스스로 만들거나 store·소켓에서 읽지 않는다(호출부가 canonical state에서 파생해 넘긴다)", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.doesNotMatch(source, /시간입니다/)
  assert.doesNotMatch(source, /낮 —/)
  assert.doesNotMatch(source, /재판/)
  assert.doesNotMatch(source, /useInGameStore/)
  assert.doesNotMatch(source, /socket/i)
})

test("타임바는 phaseTurnDeadline prop으로 확대 타이머를 구동한다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /phaseTurnDeadline/)
  assert.match(source, /InGamePhaseTurnTimerPanel/)
  assert.doesNotMatch(source, /TIMER_FALLBACK_LABEL/)
  assert.doesNotMatch(source, /useInGameStore/)
})

test("시간흐름바 우측 상단에 확대 버튼 에셋이 배치된다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /INGAME_TIMEBAR_ASSETS\.expandButton/)
  assert.match(source, /data-ingame-timebar-expand/)
  assert.match(source, /INGAME_TIMEBAR_EXPAND_BTN_CLASS/)
})

test("기존 day/phase 표시 로직(제 N일 라벨·단계 노드·활성 노드 판정)은 그대로 남아 있다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /const dayLabel = `제 \$\{day\}일`/)
  assert.match(source, /INGAME_DAY_TIMEBAR_PHASES\.map/)
  assert.match(source, /active=\{phase\.id === activePhaseId\}/)
})

test("투표현황 토글은 timebar가 아니라 InGamePage의 우측 하단 패널에 배선된다", async () => {
  const timebarSource = await readFile(componentUrl, "utf8")
  assert.doesNotMatch(timebarSource, /InGameVoteToggleButton/)
  assert.doesNotMatch(timebarSource, /onVoteStatusClick/)

  const pageSource = await readFile(pageUrl, "utf8")
  assert.match(pageSource, /import InGameCornerActionPanel from "\.\.\/components\/actions\/InGameCornerActionPanel\.jsx"/)
  assert.match(pageSource, /<InGameCornerActionPanel onVoteStatusClick=\{\(\) => setVoteStatusOpen\(true\)\} \/>/)
})

test("AC-02: InGamePage가 InGameBackground를 실제 화면 트리에 그린다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /import InGameBackground from "\.\.\/components\/InGameBackground\.jsx"/)
  assert.match(source, /<InGameBackground \/>/)
  assert.doesNotMatch(source, /INGAME_ASSETS\.bg/)
  assert.doesNotMatch(source, /motion\.img/)
})

test("AC-02: InGamePage가 타임바에 statusLabel·phaseTurnDeadline을 넘긴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(
    source,
    /import \{ selectInGameTimebarStatusLabel \} from "\.\.\/utils\/selectInGameTimebarStatusMessage\.js"/,
  )
  assert.match(
    source,
    /import \{ selectInGameTimebarPhaseDeadline \} from "\.\.\/utils\/timebar\/phaseDeadline\.js"/,
  )
  assert.match(source, /const timebarStatusLabel = selectInGameTimebarStatusLabel\(gameState\)/)
  assert.match(source, /statusLabel=\{timebarStatusLabel\}/)
  assert.match(source, /phaseTurnDeadline=\{phaseTurnDeadline\}/)
  assert.match(source, /timerPlacement=\{timerPlacement\}/)
})

test("AC-05: 페이지가 스냅샷 동기화 상태를 받아 guard 순수 함수에 그대로 넘긴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /const snapshotSyncStatus = useInGameSessionSnapshotSync\(\)/)
  assert.match(
    source,
    /from "\.\.\/utils\/selectInGameSessionGuard\.js"/,
  )
  assert.match(
    source,
    /if \(!shouldRedirectOutOfInGame\(\{ snapshotSyncStatus, gameId, gameState \}\)\) return/,
  )
  assert.match(source, /\[gameId, gameState, navigate, snapshotSyncStatus\]/)
  assert.doesNotMatch(source, /=== "checking"/)
})

test("원격 은닉 릴 배선은 들어오지 않고, 개인 결과·밤 성공 연출은 로컬 훅으로 배선된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.doesNotMatch(source, /statusRole/)
  assert.doesNotMatch(source, /InGameKillRevealOverlay/)
  assert.doesNotMatch(source, /useInGameKillReveal/)

  assert.match(
    source,
    /useInGameResultNavigation\(\{\s*hold: identityRebindPending\s*\|\| nightSuccessPresentation\.open \|\| nightSuccessPresentation\.pending,\s*\}\)/,
  )
  assert.match(source, /const identityRebindPending = useInGameSnapshotRebindPending\(\)/)
  assert.match(source, /useInGameSnapshotRebindPending,\s*\} from "\.\.\/hooks\/useInGameSessionSnapshotSync\.js"/)

  assert.match(
    source,
    /import \{ useInGameNightPrivateResult \} from "\.\.\/hooks\/useInGameNightPrivateResult\.js"/,
  )
  assert.match(source, /hold: roleReveal\.open \|\| nightSuccessPresentation\.open/)

  const privateOccurrences = source.match(/<InGameNightPrivateResultOverlay\b/g) ?? []
  assert.equal(privateOccurrences.length, 1, "InGameNightPrivateResultOverlay은 정확히 한 번만 마운트돼야 한다")
  const privateBlock = source.match(/<InGameNightPrivateResultOverlay[\s\S]*?\/>/)
  assert.notEqual(privateBlock, null, "InGameNightPrivateResultOverlay 마운트 블록을 찾을 수 없다")
  for (const prop of [
    /open=\{nightPrivateResult\.open && !nightPresentationWaitOpen\}/,
    /kind=\{nightPrivateResult\.kind\}/,
    /label=\{nightPrivateResult\.label\}/,
    /onConfirm=\{nightPrivateResult\.confirm\}/,
  ]) {
    assert.match(privateBlock[0], prop, `InGameNightPrivateResultOverlay의 ${prop} 배선이 없다`)
  }

  assert.match(
    source,
    /const surfaceLocked =\s*interactionBlocked \|\| nightPrivateResult\.open \|\| deadChoiceOpen/,
  )
  assert.match(source, /inert=\{surfaceLocked \|\| undefined\}/)
})
