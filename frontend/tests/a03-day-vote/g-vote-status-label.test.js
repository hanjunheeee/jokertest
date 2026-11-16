// 투표 현황 창의 판정 결과 글 시험: 뽑힌 사람이 끊겨 재판이 없던 낮은 영어 값이 아니라 우리말 글로 보임
// 목록 A03-낮투표.md A03-F-243 (화면 부품), 돌리기(frontend): node --experimental-test-module-mocks --test tests/a03-day-vote/g-vote-status-label.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { buttonByName, click, dayResolved, fakeSocket, fire, renderPage, resetAll, seat } from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

test("A03-F-243 6명 판 DEFENDANT_DISCONNECTED 판정 뒤 투표 현황 → 결과 칸 \"재판 대상의 연결이 끊겨 재판 없음\" (영어 값 안 보임)", async () => {
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderPage(socket)
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "DEFENDANT_DISCONNECTED", alive: 6, abstain: 1 }))
  await click(buttonByName("투표 현황 열기"))
  const outcome = document.querySelector('[data-testid="vote-status-outcome"]')
  assert.ok(outcome !== null, "투표 현황 결과 칸이 없음")
  assert.equal(outcome.textContent, "재판 대상의 연결이 끊겨 재판 없음")
})
