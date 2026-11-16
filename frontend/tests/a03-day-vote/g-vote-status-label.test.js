// 투표 현황 창 글 시험: 끊긴 피고 판정은 우리말 결과 글, 첫 줄 이름표는 값 뜻(산 사람 수)대로 "투표 가능"
// 목록 A03-낮투표.md A03-F-243·257 (화면 부품), 돌리기(frontend): node --experimental-test-module-mocks --test tests/a03-day-vote/g-vote-status-label.test.js
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

// 값 칸 바로 앞 이름 칸 글 (같은 줄의 dt)
const termOf = (testId) => document.querySelector(`[data-testid="${testId}"]`)?.previousElementSibling?.textContent ?? null

test("A03-F-257 7명 판 1표 6기권 판정 뒤 투표 현황 → 첫 줄 이름표 \"투표 가능\" 값 7, 기권 6, \"득표\" 이름표 없음", async () => {
  const socket = fakeSocket()
  seat({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE" })
  await renderPage(socket)
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 }))
  await click(buttonByName("투표 현황 열기"))
  const terms = [...document.querySelectorAll('dl[aria-label="낮 투표 집계"] dt')].map((dt) => dt.textContent)
  assert.deepEqual(
    {
      voteTerm: termOf("vote-status-public-vote-count"),
      voteValue: document.querySelector('[data-testid="vote-status-public-vote-count"]')?.textContent ?? null,
      abstainValue: document.querySelector('[data-testid="vote-status-public-abstain-count"]')?.textContent ?? null,
      hasOldTerm: terms.includes("득표"),
    },
    { voteTerm: "투표 가능", voteValue: "7", abstainValue: "6", hasOldTerm: false },
  )
})
