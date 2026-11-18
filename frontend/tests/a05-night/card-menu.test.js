// 밤 화면 시험(화면 부품): 카드를 눌러 뜨는 메뉴에 밤 행동 단추가 있는지·눌리는지, 인원별 켜진 수, 둘째 밤 다시 켜짐, 단추 읽기 이름
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-111~130·167·170~177·182~185·187·188·190, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/card-menu.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")

test.afterEach(() => kit.reset())

// 밤 행동 단추로 볼 글 (직업 행동 이름 + 못 하는 날 기본 이름 + 낸 뒤 취소)
const NIGHT_LABELS = new Set([...Object.values(kit.NIGHT_ACTION_LABELS), "밤 행동", "취소하기"])

// 카드 메뉴의 밤 단추 상태: 단추 없음 = "없음", 잠김 = "고를 수 없음", 눌림 = "고름" (보고 나서 메뉴 닫음)
function menuState(view, index) {
  const items = kit.openCardMenu(view.container, kit.NICKS[index])
  const night = items.find((button) => NIGHT_LABELS.has(kit.shownLabel(button))) ?? null
  if (items.length > 0) kit.act(() => { kit.fireEvent.keyDown(document, { key: "Escape" }) })
  if (!night) return "없음"
  return night.disabled ? "고를 수 없음" : "고름"
}

// "고를 수 없음"은 단추가 없거나 잠긴 것 (눌러서 고를 수 없으면 됨)
function assertMatches(actual, expected) {
  if (expected === "고를 수 없음") assert.notEqual(actual, "고름")
  else assert.equal(actual, expected)
}

// 내 차례가 열린 판: 10명, 0 나·1 같은 직업 동료·2 산 다른 직업(광대 화면이면 의사, 아니면 광대)·3 죽은 사람·4 산 시민
function myTurnTable(role, extra = {}) {
  const dayIndex = role === "WITCH_HUNTER" ? 2 : 1
  const t = kit.openNight({ n: 10, me: 0, role, allies: [1], dead: [3], dayIndex, ...extra })
  const view = kit.mountTable()
  t.turnStarts(role)
  return { t, view }
}

// 2-1 표: 직업마다 자기·동료·산 다른 직업·죽은 사람·산 시민
const EXPECTED = {
  JOKER: ["없음", "없음", "고름", "고를 수 없음", "고름"],
  DOCTOR: ["고름", "고름", "고름", "고를 수 없음", "고름"],
  GUARD: ["없음", "고름", "고름", "고를 수 없음", "고름"],
  WITCH_HUNTER: ["없음", "고를 수 없음", "고를 수 없음", "고름", "고를 수 없음"],
}
const CARD_NAMES = ["자기", "동료", "산 다른 직업", "죽은 사람", "산 시민"]
let menuNo = 111
for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
  EXPECTED[role].forEach((expected, index) => {
    const no = `A05-F-${menuNo}`
    menuNo += 1
    test(`${no} 10명 ${role} 내 차례 카드 메뉴: ${CARD_NAMES[index]} 카드 밤 항목 = ${expected}`, () => {
      const { view } = myTurnTable(role)
      assertMatches(menuState(view, index), expected)
    })
  })
}

test("A05-F-167 10명 첫 밤 마녀사냥꾼 화면: 처형된 사람 카드에 확인 항목이 어느 차례에도 없음", () => {
  const t = kit.openNight({ n: 10, me: 0, role: "WITCH_HUNTER", dead: [3], dayIndex: 1 })
  const view = kit.mountTable()
  const seen = []
  for (const role of ["JOKER", "DOCTOR", "GUARD"]) {
    t.turnStarts(role)
    seen.push(menuState(view, 3))
    t.turnEnds(role)
  }
  assert.deepEqual(seen, ["없음", "없음", "없음"])
})

// 인원별 광대 카드 메뉴 켜진 항목 수 (첫 밤, 아무도 안 죽음, 광대 2명이면 1이 동료)
for (const [no, n, jokers, expected] of [
  ["A05-F-170", 5, 1, 4],
  ["A05-F-171", 6, 2, 4],
  ["A05-F-172", 7, 1, 6],
  ["A05-F-173", 8, 2, 6],
  ["A05-F-174", 10, 2, 8],
]) {
  test(`${no} ${n}명 광대${jokers} 광대 화면: 카드 메뉴 켜진 암살 항목 수 = ${expected}`, () => {
    const t = kit.openNight({ n, me: 0, role: "JOKER", allies: jokers === 2 ? [1] : [] })
    const view = kit.mountTable()
    t.turnStarts("JOKER")
    const states = Array.from({ length: n }, (_, index) => menuState(view, index))
    assert.equal(states.filter((state) => state === "고름").length, expected)
  })
}

// 둘째 밤 같은 사람 항목 다시 켜짐 (첫 밤 A=3 고름, A는 안 죽음)
for (const [no, role] of [["A05-F-175", "DOCTOR"], ["A05-F-176", "GUARD"], ["A05-F-177", "JOKER"]]) {
  test(`${no} 8명 ${role}: 첫 밤 A 고름 → 둘째 밤 A 카드 ${kit.NIGHT_ACTION_LABELS[role]} 항목 다시 켜짐`, async () => {
    const t = kit.openNight({ n: 8, me: 0, role })
    const view = kit.mountTable()
    t.turnStarts(role)
    const first = kit.openNightItem(view.container, kit.NICKS[3], role)
    assert.ok(first, "첫 밤 항목 없음 (준비 잘못)")
    kit.act(() => { kit.fireEvent.click(first) })
    await kit.settle()
    assert.equal(t.nightSubmits().length, 1, "첫 밤 보냄이 안 됨 (준비 잘못)")
    t.turnEnds(role)
    t.actionsResolved()
    t.nightApplied({ victim: null })
    t.dayToNight()
    t.turnStarts(role)
    const again = kit.nightMenuItem(view.container, kit.NICKS[3], role)
    assert.ok(again, "둘째 밤 A 카드에 항목 없음")
    assert.equal(again.disabled, false)
  })
}

// 대상 단추 읽기 이름에 대상 닉네임 (화면 읽기 프로그램이 누구에게 하는지 알게)
for (const [no, role] of [["A05-F-182", "JOKER"], ["A05-F-183", "DOCTOR"], ["A05-F-184", "GUARD"], ["A05-F-185", "WITCH_HUNTER"]]) {
  test(`${no} 10명 ${role} 카드 메뉴 밤 항목 단추의 읽기 이름에 대상 닉네임이 들어감`, () => {
    const { view } = myTurnTable(role)
    const index = role === "WITCH_HUNTER" ? 3 : 4
    const item = kit.openNightItem(view.container, kit.NICKS[index], role)
    assert.ok(item, "밤 항목 단추 없음 (준비 잘못)")
    // 읽기 이름: aria-label이 있으면 그것, 없으면 글자
    const accessibleName = item.getAttribute("aria-label") ?? item.textContent
    assert.match(accessibleName, new RegExp(kit.NICKS[index]))
  })
}

test("A05-F-187 [지금 동작] 6명 광대 화면: 끊긴 산 시민 카드에도 암살 항목 있음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "JOKER", disconnected: [4] })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  assert.equal(menuState(view, 4), "고름")
})

test("A05-F-188 10명 둘째 밤 죽은 사람 0명 마녀사냥꾼 화면: 산 카드 어디에도 눌리는 확인 항목 없음", () => {
  const t = kit.openNight({ n: 10, me: 0, role: "WITCH_HUNTER", dayIndex: 2 })
  const view = kit.mountTable()
  t.turnStarts("WITCH_HUNTER")
  const states = Array.from({ length: 10 }, (_, index) => menuState(view, index))
  assert.equal(states.filter((state) => state === "고름").length, 0)
})

test("A05-F-190 7명 광대2 화면: 동료 광대 카드 메뉴엔 밤 항목 없음, 시민 카드엔 있음", () => {
  const t = kit.openNight({ n: 7, me: 0, role: "JOKER", allies: [1] })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  assert.equal(menuState(view, 1), "없음")
  assert.equal(menuState(view, 4), "고름")
})
