// 같은 직업 동료 표시 시험(화면 부품): 판 카드의 동료 표시(배지)·카드 읽기 이름·카드 메뉴 밤 단추 읽기 이름 (결정 2026-11-16 아침 7번, 내 화면에만·시민은 없음)
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-191~200, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/g-ally-badge.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")

test.afterEach(() => kit.reset())

const cardOf = (view, index) => view.container.querySelector(`[data-ingame-player-nickname="${kit.NICKS[index]}"]`)
// 그 카드의 동료 표시 글 (표시가 없으면 null), 예: 의사 화면의 동료 카드 → "동료 의사"
const badgeOf = (view, index) => cardOf(view, index).querySelector("[data-ingame-ally-badge]")?.getAttribute("data-ingame-ally-badge") ?? null
// 판 전체의 동료 표시를 자리 순서로
const badges = (view, n) => Array.from({ length: n }, (_, index) => badgeOf(view, index))
// 카드 누름 칸의 읽기 이름 (없으면 null)
const cardName = (view, index) => kit.cardButton(view.container, kit.NICKS[index]).getAttribute("aria-label")

// 직업 4 × 동료 1명: 그 사람 카드에만 "동료 ○○" 표시, 보이는 글은 "동료"
let no = 191
for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
  const id = `A05-F-${no}`
  no += 1
  test(`${id} 8명 ${role} 화면(동료 = 1번 자리): 1번 카드에만 "동료 ${kit.ROLE_LABELS[role]}" 표시, 내 카드·남 카드엔 없음`, () => {
    kit.openNight({ n: 8, me: 0, role, allies: [1], dayIndex: role === "WITCH_HUNTER" ? 2 : 1 })
    const view = kit.mountTable()
    const expected = Array.from({ length: 8 }, (_, index) => (index === 1 ? `동료 ${kit.ROLE_LABELS[role]}` : null))
    assert.deepEqual(badges(view, 8), expected)
    assert.equal(cardOf(view, 1).querySelector("[data-ingame-ally-badge]").textContent, "동료")
  })
}

test("A05-F-195 10명 시민 화면: 어느 카드에도 동료 표시 없음", () => {
  kit.openNight({ n: 10, me: 0, role: "CITIZEN" })
  const view = kit.mountTable()
  assert.deepEqual(badges(view, 10), Array.from({ length: 10 }, () => null))
})

test("A05-F-196 6명 의사 화면 동료 없음(혼자 의사): 동료 표시 0개", () => {
  kit.openNight({ n: 6, me: 0, role: "DOCTOR", allies: [] })
  const view = kit.mountTable()
  assert.deepEqual(badges(view, 6), Array.from({ length: 6 }, () => null))
})

test("A05-F-197 7명 의사 화면: 동료 카드 읽기 이름 \"지영 · 동료 의사\", 동료 아닌 카드는 따로 붙인 읽기 이름 없음", () => {
  kit.openNight({ n: 7, me: 0, role: "DOCTOR", allies: [1] })
  const view = kit.mountTable()
  assert.equal(cardName(view, 1), `${kit.NICKS[1]} · 동료 의사`)
  assert.equal(cardName(view, 4), null)
  assert.equal(cardName(view, 0), null)
})

test("A05-F-198 7명 광대 화면 죽은 동료: 읽기 이름 뒤에 상태가 붙음 \"지영 · 동료 광대, 사망\", 표시는 그대로", () => {
  kit.openNight({ n: 7, me: 0, role: "JOKER", allies: [1], dead: [1] })
  const view = kit.mountTable()
  assert.equal(cardName(view, 1), `${kit.NICKS[1]} · 동료 광대, 사망`)
  assert.equal(badgeOf(view, 1), "동료 광대")
})

test("A05-F-199 7명 의사 내 차례: 동료 카드 메뉴 보호 단추 읽기 이름 \"지영 · 동료 의사 보호\", 보이는 글은 \"보호\"", () => {
  const t = kit.openNight({ n: 7, me: 0, role: "DOCTOR", allies: [1] })
  const view = kit.mountTable()
  t.turnStarts("DOCTOR")
  const item = kit.openNightItem(view.container, kit.NICKS[1], "DOCTOR")
  assert.ok(item, "보호 단추 없음 (준비 잘못)")
  assert.equal(item.getAttribute("aria-label"), `${kit.NICKS[1]} · 동료 의사 보호`)
  assert.equal(kit.shownLabel(item), "보호")
})

test("A05-F-200 7명 광대 내 차례: 동료 아닌 카드 메뉴 암살 단추 읽기 이름 \"준호 암살\"(동료 글 없음), 보이는 글은 \"암살\"", () => {
  const t = kit.openNight({ n: 7, me: 0, role: "JOKER", allies: [1] })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  const item = kit.openNightItem(view.container, kit.NICKS[4], "JOKER")
  assert.ok(item, "암살 단추 없음 (준비 잘못)")
  assert.equal(item.getAttribute("aria-label"), `${kit.NICKS[4]} 암살`)
  assert.equal(kit.shownLabel(item), "암살")
})
