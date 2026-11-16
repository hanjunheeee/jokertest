// PC 카드 메뉴의 꺼진 까닭 글이 눈에 보이는 줄로 나오는지 시험 (토론 중 안내·죽은 사람 안내, 켜진 항목엔 없음) — 인게임 화면을 그려 봄
// 목록 A03-낮투표.md 번호 A03-F-254~256 (돌리기: node --experimental-test-module-mocks --test tests/a03-day-vote/goG2-menu-reason.test.js)
import test from "node:test"
import assert from "node:assert/strict"
import { cardOf, click, fakeSocket, menuItems, renderPage, resetAll, seat } from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

// 열린 카드 메뉴의 보이는 까닭 줄들 → [{ text, hiddenClass, readOnce }]
// hiddenClass = 숨김 글자(sr-only) 모양인지, readOnce = 읽기 도구엔 숨김(단추 설명으로 한 번만 읽히게)
function reasonLines() {
  return [...document.querySelectorAll('[role="menu"] [data-ingame-card-menu-reason]')].map((el) => ({
    text: el.textContent.trim(),
    hiddenClass: el.classList.contains("sr-only") || el.classList.contains("hidden"),
    readOnce: el.getAttribute("aria-hidden") === "true",
  }))
}
// n명 판 화면에서 index번 자리 카드 메뉴 열기
async function openMenu(index, seatOptions) {
  seat({ phase: "DAY", ...seatOptions })
  await renderPage(fakeSocket())
  await click(cardOf(index))
  const item = menuItems().find((entry) => entry.name === "투표하기")
  assert.ok(item, "카드 메뉴에 투표하기 항목이 없음 (준비 잘못)")
  return item
}

test("A03-F-254 6명 판 토론 중: 꺼진 \"투표하기\" 아래 보이는 줄 \"토론 중입니다. 투표는 아직 열리지 않았습니다.\"", async () => {
  const item = await openMenu(2, { n: 6, dayPhase: "DAY_DISCUSSION" })
  assert.equal(item.enabled, false)
  assert.deepEqual(reasonLines(), [{ text: "토론 중입니다. 투표는 아직 열리지 않았습니다.", hiddenClass: false, readOnce: true }])
})

test("A03-F-255 7명 판 투표 중 죽은 나: 꺼진 \"투표하기\" 아래 보이는 줄 \"사망한 플레이어는 행동할 수 없습니다\"", async () => {
  const item = await openMenu(3, { n: 7, dayPhase: "DAY_VOTE", dead: [0] })
  assert.equal(item.enabled, false)
  assert.deepEqual(reasonLines(), [{ text: "사망한 플레이어는 행동할 수 없습니다", hiddenClass: false, readOnce: true }])
})

test("A03-F-256 5명 판 투표 중 산 나: 켜진 \"투표하기\"엔 까닭 줄 없음", async () => {
  const item = await openMenu(1, { n: 5, dayPhase: "DAY_VOTE" })
  assert.equal(item.enabled, true)
  assert.deepEqual(reasonLines(), [])
})
