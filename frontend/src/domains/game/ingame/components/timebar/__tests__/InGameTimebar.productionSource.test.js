import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const componentUrl = new URL("../InGameTimebar.jsx", import.meta.url)

/**
 * InGameTimebar.jsx는 .jsx라서 이 저장소의 node:test 실행에는 로더가 없어 직접 렌더링할 수
 * 없다(InGameActionPanel.productionSource.test.js와 동일한 제약). raw source 검증으로 옛
 * "투표 현황" 트리거 배선이 완전히 제거됐는지 증명한다.
 */

test("InGameTimebar는 옛 투표현황 토글 버튼(InGameVoteToggleButton)을 더 이상 import/렌더링하지 않는다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.doesNotMatch(source, /InGameVoteToggleButton/)
  assert.doesNotMatch(source, /onVoteStatusClick/)
})

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

test("기존 day/phase 표시 로직(제 N일 라벨·단계 노드·활성 노드 판정)은 그대로 남아 있다", async () => {
  const source = await readFile(componentUrl, "utf8")
  assert.match(source, /const dayLabel = `제 \$\{day\}일`/)
  assert.match(source, /INGAME_DAY_TIMEBAR_PHASES\.map/)
  assert.match(source, /active=\{phase\.id === activePhaseId\}/)
})
