// 밤 화면 시험(화면 부품): 밤 결과 뒤 카드 판 — 희생자 카드 사망 표시(직업 그림은 그대로), 살렸으면 사망 카드 없음, 내가 죽으면 행동 칸 없어짐
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-164~166, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/board.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")

test.afterEach(() => kit.reset())

const cardOf = (container, index) => container.querySelector(`[data-ingame-player-nickname="${kit.NICKS[index]}"]`)
// 카드 맨 처음 그림 = 초상(직업 그림)
const portraitSrc = (container, index) => cardOf(container, index).querySelector("img")?.getAttribute("src") ?? null
const deadCards = (container) => [...container.querySelectorAll('[data-ingame-player-status="dead"]')]
  .map((card) => card.getAttribute("data-ingame-player-nickname"))

test("A05-F-164 6명 밤 결과 희생자 A(서연) → A 카드 \"사망\" 표시, 직업 그림은 안 바뀜", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  const view = kit.mountTable()
  const before = portraitSrc(view.container, 3)
  t.nightApplied({ victim: 3 })
  const card = cardOf(view.container, 3)
  assert.equal(card.getAttribute("data-ingame-player-status"), "dead")
  assert.match(card.textContent, /사망/)
  assert.deepEqual(deadCards(view.container), [kit.NICKS[3]])
  assert.ok(before, "초상 그림 없음 (준비 잘못)")
  assert.equal(portraitSrc(view.container, 3), before)
})

test("A05-F-165 6명 의사가 살린 밤 결과 → 사망 표시 카드 0", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  const view = kit.mountTable()
  t.nightApplied({ victim: null }) // 의사가 살린 밤 (서버 값은 광대가 안 죽인 밤과 같음)
  assert.deepEqual(deadCards(view.container), [])
})

test("A05-F-166 6명 희생자 = 나(의사) → 다음 밤 의사 차례에도 행동 칸 고르기 없음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "DOCTOR" })
  const view = kit.mountTable()
  t.nightApplied({ victim: 0 })
  t.dayToNight()
  assert.equal(t.store().state.phase, "NIGHT", "둘째 밤으로 못 감 (준비 잘못)")
  t.turnStarts("DOCTOR")
  // 죽은 사람 화면엔 건너뛰기 단추가 아예 없음 (C-026), 카드 밤 단추는 없거나 잠김
  assert.equal(kit.skipButton(view.container) === null, true, "죽은 사람 화면에 건너뛰기 단추가 있음")
  for (const index of [0, 4]) {
    const item = kit.nightMenuItem(view.container, kit.NICKS[index], "DOCTOR")
    assert.notEqual(item?.disabled, false, `${kit.NICKS[index]} 카드 보호 단추가 눌림`)
  }
})
