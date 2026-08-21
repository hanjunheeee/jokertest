import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const pageUrl = new URL("../InGamePage.jsx", import.meta.url)

/**
 * InGamePage.jsx는 .jsx라서 이 저장소의 node:test 실행에는 로더가 없어 직접 렌더링할 수 없다
 * (InGameActionPanel.productionSource.test.js와 동일한 제약). 대신 raw source 검증으로
 * "우측 하단 컨트롤 패널이 정확히 하나만 마운트되고, 옛 투표현황 트리거/팝업 배선이 production
 * 경로에서 완전히 제거됐는지"를 증명한다.
 */

test("InGamePage는 InGameActionPanel(컨트롤 패널)을 정확히 한 번만 마운트한다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const occurrences = source.match(/<InGameActionPanel\b/g) ?? []
  assert.equal(occurrences.length, 1, "컨트롤 패널은 중복 마운트되면 안 된다")
})

test("옛 '투표 현황' 트리거→팝업 UX(voteStatusOpen state, onVoteStatusClick, InGameVoteStatusPanel)는 더 이상 production 배선에 없다", async () => {
  const source = await readFile(pageUrl, "utf8")
  assert.doesNotMatch(source, /voteStatusOpen/)
  assert.doesNotMatch(source, /onVoteStatusClick/)
  assert.doesNotMatch(source, /InGameVoteStatusPanel/)
})

test("InGameTimebar는 더 이상 onVoteStatusClick을 전달받지 않는다(옛 트리거 버튼이 자연히 렌더되지 않는다)", async () => {
  const source = await readFile(pageUrl, "utf8")
  const timebarBlockMatch = source.match(/<InGameTimebar[\s\S]*?\/>/)
  assert.notEqual(timebarBlockMatch, null)
  assert.doesNotMatch(timebarBlockMatch[0], /onVoteStatusClick/)
})

test("컨트롤 패널은 기존 useInGameActionPanel 데이터 흐름과 interactionBlocked를 그대로 전달받는다(오버레이 우선순위 유지)", async () => {
  const source = await readFile(pageUrl, "utf8")
  const panelBlockMatch = source.match(/<InGameActionPanel[\s\S]*?\/>/)
  assert.notEqual(panelBlockMatch, null)
  assert.match(panelBlockMatch[0], /onOpenRoleReveal=\{roleReveal\.reopen\}/)
  assert.match(panelBlockMatch[0], /roleRevealAvailable=\{Boolean\(roleReveal\.roleInfo\)\}/)
  assert.match(panelBlockMatch[0], /interactionBlocked=\{interactionBlocked\}/)
})

test("역할 공개/사망 연출/단계 진입/밤 턴 안내 오버레이는 여전히 InGameActionPanel이 속한 상호작용 래퍼 바깥(아래)에서 렌더된다", async () => {
  const source = await readFile(pageUrl, "utf8")
  const panelIndex = source.indexOf("<InGameActionPanel")
  const interactionWrapperCloseIndex = source.indexOf("</InGamePlayerSessionProvider>")
  const roleRevealIndex = source.indexOf("<InGameRoleRevealOverlay")
  const killRevealIndex = source.indexOf("<InGameKillRevealOverlay")
  const phaseEntranceIndex = source.indexOf("<InGamePhaseEntranceOverlay")
  const nightTurnIndex = source.indexOf("<InGameNightTurnAnnouncementOverlay")

  assert.ok(panelIndex > -1 && interactionWrapperCloseIndex > -1)
  assert.ok(panelIndex < interactionWrapperCloseIndex, "컨트롤 패널은 상호작용 래퍼 안에 있어야 한다")
  for (const overlayIndex of [roleRevealIndex, killRevealIndex, phaseEntranceIndex, nightTurnIndex]) {
    assert.ok(overlayIndex > interactionWrapperCloseIndex, "오버레이는 상호작용 래퍼 바깥에서 렌더돼야 cinematic 우선순위가 유지된다")
  }
})
