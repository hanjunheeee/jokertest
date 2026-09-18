import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameTimebar.jsx", import.meta.url)
const pageUrl = new URL("../../../pages/InGamePage.jsx", import.meta.url)

/**
 * InGameTimebar.jsx·InGamePage.jsx는 .jsx라서 이 저장소의 node:test 실행에는 로더가 없어 직접
 * 렌더링할 수 없다(InGameActionPanel.productionSource.test.js와 동일한 제약). raw source
 * 검증으로 상태 문구 배선과 실제 화면 트리 연결을 증명한다.
 */

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

test("로컬 투표현황 토글 배선(onVoteStatusClick)은 이식 뒤에도 그대로 남는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /import InGameVoteToggleButton from "\.\.\/vote\/InGameVoteToggleButton\.jsx"/)
  assert.match(source, /<InGameVoteToggleButton onClick=\{onVoteStatusClick\} \/>/)
})

test("AC-02: InGamePage가 InGameBackground를 실제 화면 트리에 그린다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.match(source, /import InGameBackground from "\.\.\/components\/InGameBackground\.jsx"/)
  assert.match(source, /<InGameBackground \/>/)
  // 배경은 InGameBackground 하나가 담당한다 — 페이지가 배경 이미지를 직접 그리지 않는다.
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

// 리다이렉트 규칙 자체는 selectInGameSessionGuard.test.js가 실제 값으로 검증한다. 여기서는
// 페이지가 그 규칙을 직접 다시 쓰지 않고 그대로 호출해 쓴다는 배선만 확인한다.
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
  // 페이지가 "checking" 판단을 따로 복제해두면 두 곳이 어긋날 수 있다 — 판단은 guard 한 곳뿐이다.
  assert.doesNotMatch(source, /=== "checking"/)
})

// UI-13에서는 이 세 배선(원격 은닉 릴·개인 결과·사망 연출)이 아직 들어오지 않았음을 확인했다.
// 그중 개인 결과·사망 연출은 UI-14가 로컬 계약(store nightPrivateResult, night_result_applied·
// 재판 처형 사망자)으로 들여오는 것이 요구사항이라, 같은 관심사(페이지에 무엇이 배선돼 있는가)를
// 그대로 두고 기대값만 이 슬라이스의 계약으로 옮긴다. 원격 은닉 릴(statusRole)은 여전히 금지다 —
// 밤 턴 은닉 계산은 로컬이 다르게 푸는 문제라 어느 슬라이스에서도 가져오지 않는다.
test("원격 은닉 릴 배선은 들어오지 않고, 개인 결과·사망 연출은 로컬 훅으로 배선된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.doesNotMatch(source, /statusRole/)

  // 사망 연출: 로컬 훅에서 받아 오버레이로 넘기고, 결과 페이지 이동을 큐가 빌 때까지 보류한다.
  assert.match(source, /import \{ useInGameKillReveal \} from "\.\.\/hooks\/useInGameKillReveal\.js"/)
  assert.match(source, /const killReveal = useInGameKillReveal\(\{ hold: roleReveal\.open \}\)/)
  assert.match(source, /useInGameResultNavigation\(\{ hold: killReveal\.open \|\| killReveal\.pending \}\)/)

  // 밤 개인 결과: 사망 연출 뒤 순서로 열리고, 확인 콜백은 store를 비우는 훅의 것을 그대로 쓴다.
  assert.match(
    source,
    /import \{ useInGameNightPrivateResult \} from "\.\.\/hooks\/useInGameNightPrivateResult\.js"/,
  )
  assert.match(source, /hold: roleReveal\.open \|\| killReveal\.open/)

  // 두 오버레이는 각각 정확히 한 번 마운트되고 훅 상태를 그대로 받는다.
  for (const mount of [
    {
      tag: "InGameKillRevealOverlay",
      props: [/open=\{killReveal\.open\}/, /revealId=\{killReveal\.revealId\}/, /message=\{killReveal\.message\}/, /onConsume=\{killReveal\.consume\}/],
    },
    {
      tag: "InGameNightPrivateResultOverlay",
      props: [/open=\{nightPrivateResult\.open\}/, /kind=\{nightPrivateResult\.kind\}/, /label=\{nightPrivateResult\.label\}/, /onConfirm=\{nightPrivateResult\.confirm\}/],
    },
  ]) {
    const occurrences = source.match(new RegExp(`<${mount.tag}\\b`, "g")) ?? []
    assert.equal(occurrences.length, 1, `${mount.tag}은 정확히 한 번만 마운트돼야 한다`)
    const block = source.match(new RegExp(`<${mount.tag}[\\s\\S]*?/>`))
    assert.notEqual(block, null, `${mount.tag} 마운트 블록을 찾을 수 없다`)
    for (const prop of mount.props) {
      assert.match(block[0], prop, `${mount.tag}의 ${prop} 배선이 없다`)
    }
  }

  // 두 오버레이가 떠 있는 동안에도 아래 게임 표면은 잠긴다(오버레이 스택의 판단에 더해서만).
  // F-23(AC-06): 확정 사망 선택창도 같은 잠금에 참여한다 — 선택을 받는 동안 뒤의 보드·채팅·
  // 투표가 눌리면 안 된다. 줄바꿈이 들어갈 수 있으므로 공백을 유연하게 본다.
  assert.match(
    source,
    /const surfaceLocked =\s*interactionBlocked \|\| killReveal\.open \|\| nightPrivateResult\.open \|\| deadChoiceOpen/,
  )
  assert.match(source, /inert=\{surfaceLocked \|\| undefined\}/)
})
