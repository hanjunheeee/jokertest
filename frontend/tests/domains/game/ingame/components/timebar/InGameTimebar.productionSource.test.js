import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../../../../../../src/domains/game/ingame/components/timebar/InGameTimebar.jsx", import.meta.url)
const pageUrl = new URL("../../../../../../src/domains/game/ingame/pages/InGamePage.jsx", import.meta.url)

test("statusMessage prop을 받아 전용 스타일 상수로 그대로 렌더한다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /statusMessage = null/)
  assert.match(source, /INGAME_TIMEBAR_STATUS_CLASS/)
  assert.match(source, /<p className=\{INGAME_TIMEBAR_STATUS_CLASS\}>\{statusMessage\}<\/p>/)
})

test("문구가 비어 있으면(ENDED 등) 줄 자체를 그리지 않는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /typeof statusMessage === "string" && statusMessage\.length > 0 \?/)
})

test("문구를 컴포넌트가 스스로 만들거나 store·소켓에서 읽지 않는다(호출부가 canonical state에서 파생해 넘긴다)", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.doesNotMatch(source, /시간입니다/)
  assert.doesNotMatch(source, /낮 —/)
  assert.doesNotMatch(source, /재판/)
  assert.doesNotMatch(source, /useInGameStore/)
  assert.doesNotMatch(source, /socket/i)
})

test("옛 밤 역할 턴 전용 줄(nightTurnRole·nightTurnRemainingSec prop)은 statusMessage 한 줄로 합쳐졌다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.doesNotMatch(source, /nightTurnRole/)
  assert.doesNotMatch(source, /nightTurnRemainingSec/)
  assert.doesNotMatch(source, /INGAME_TIMEBAR_NIGHT_TURN/)
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

test("AC-02: InGamePage가 타임바에 canonical state에서 파생한 statusMessage를 넘긴다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(
    source,
    /import \{ selectInGameTimebarStatusMessage \} from "\.\.\/utils\/selectInGameTimebarStatusMessage\.js"/,
  )
  assert.match(
    source,
    /statusMessage=\{selectInGameTimebarStatusMessage\(gameState, nightTurnRemainingSec\)\}/,
  )
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
