// 밤 화면 시험(화면 상태): 직업마다 밤 대상 목록에 누가 있고 누구를 고를 수 있는지, 인원별 고를 수 있는 수
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-001~020·071~086·095, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/targets.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")

test.afterEach(() => kit.reset())

// 판을 열고 화면을 그려 행동 칸이 쓰는 밤 대상 목록을 꺼냄
function targetsOf(options) {
  kit.openNight(options)
  const view = kit.mountTable()
  return view.probe.ctx.nightActionTargets
}

// 자리 번호로 목록 칸 찾기 → "없음" / "고를 수 없음" / "고름"
function stateOf(targets, index) {
  const entry = targets.find((target) => target.id === kit.uuidOf(index))
  if (!entry) return "없음"
  return entry.selectable ? "고름" : "고를 수 없음"
}

const selectableCount = (targets) => targets.filter((target) => target.selectable).length

// 광대 화면: 7명 광대2(0 나·1 동료), 2 의사, 3 첫날 처형된 시민, 4 산 시민, 첫 밤
const JOKER_TABLE = { n: 7, me: 0, role: "JOKER", allies: [1], dead: [3], dayIndex: 1 }
for (const [no, label, index, expected] of [
  ["A05-F-001", "자기", 0, "없음"],
  ["A05-F-002", "동료 광대", 1, "고를 수 없음"],
  ["A05-F-003", "산 의사", 2, "고름"],
  ["A05-F-004", "죽은 시민", 3, "고를 수 없음"],
  ["A05-F-005", "산 시민", 4, "고름"],
]) {
  test(`${no} 7명 광대2 광대 화면 대상 목록: ${label} = ${expected}`, () => {
    assert.equal(stateOf(targetsOf(JOKER_TABLE), index), expected)
  })
}

// 의사 화면: 8명 직접{의사2}(0 나·1 동료), 2 산 광대, 3 죽은 시민, 4 산 시민, 첫 밤
const DOCTOR_TABLE = { n: 8, me: 0, role: "DOCTOR", allies: [1], dead: [3], dayIndex: 1 }
for (const [no, label, index, expected] of [
  ["A05-F-006", "자기", 0, "고름"],
  ["A05-F-007", "동료 의사", 1, "고름"],
  ["A05-F-008", "산 광대", 2, "고름"],
  ["A05-F-009", "죽은 사람", 3, "고를 수 없음"],
  ["A05-F-010", "산 시민", 4, "고름"],
]) {
  test(`${no} 8명 의사2 의사 화면 대상 목록: ${label} = ${expected}`, () => {
    assert.equal(stateOf(targetsOf(DOCTOR_TABLE), index), expected)
  })
}

// 경비원 화면: 8명 직접{경비원2}(0 나·1 동료), 2 산 광대, 3 죽은 시민, 4 산 시민, 첫 밤
const GUARD_TABLE = { n: 8, me: 0, role: "GUARD", allies: [1], dead: [3], dayIndex: 1 }
test("A05-F-011 [지금 동작] 8명 경비원2 경비원 화면: 자기는 목록에 없음", () => {
  assert.equal(stateOf(targetsOf(GUARD_TABLE), 0), "없음")
})
for (const [no, label, index, expected] of [
  ["A05-F-012", "동료 경비원", 1, "고름"],
  ["A05-F-013", "산 광대", 2, "고름"],
  ["A05-F-014", "죽은 사람", 3, "고를 수 없음"],
  ["A05-F-015", "산 시민", 4, "고름"],
]) {
  test(`${no} 8명 경비원2 경비원 화면 대상 목록: ${label} = ${expected}`, () => {
    assert.equal(stateOf(targetsOf(GUARD_TABLE), index), expected)
  })
}

// 마녀사냥꾼 화면: 10명(0 나·1 산 동료 마녀), 2 산 광대, 3 처형된 시민, 4 산 시민, 둘째 밤
const HUNTER_TABLE = { n: 10, me: 0, role: "WITCH_HUNTER", allies: [1], dead: [3], dayIndex: 2 }
for (const [no, label, index, expected] of [
  ["A05-F-016", "자기", 0, "없음"],
  ["A05-F-017", "산 동료 마녀사냥꾼", 1, "고를 수 없음"],
  ["A05-F-018", "산 광대", 2, "고를 수 없음"],
  ["A05-F-019", "죽은 시민", 3, "고름"],
  ["A05-F-020", "산 시민", 4, "고를 수 없음"],
]) {
  test(`${no} 10명 둘째 밤 마녀사냥꾼 화면 대상 목록: ${label} = ${expected}`, () => {
    assert.equal(stateOf(targetsOf(HUNTER_TABLE), index), expected)
  })
}

test("A05-F-071 10명 둘째 밤 죽은 사람 0명: 마녀사냥꾼 화면 목록은 전부 고를 수 없음", () => {
  const targets = targetsOf({ n: 10, me: 0, role: "WITCH_HUNTER", dayIndex: 2 })
  assert.equal(targets.length, 9)
  assert.equal(selectableCount(targets), 0)
})

test("A05-F-072 10명 둘째 밤 처형된 사람(3)·암살된 사람(5) 둘 다 마녀사냥꾼이 고름", () => {
  const targets = targetsOf({ n: 10, me: 0, role: "WITCH_HUNTER", dead: [3, 5], dayIndex: 2 })
  assert.equal(stateOf(targets, 3), "고름")
  assert.equal(stateOf(targets, 5), "고름")
  assert.equal(selectableCount(targets), 2)
})

// 광대 화면 고를 수 있는 수 (첫 밤, 아무도 안 죽음, 광대 2명이면 1이 동료)
for (const [no, n, jokers, expected] of [
  ["A05-F-073", 5, 1, 4],
  ["A05-F-074", 6, 2, 4],
  ["A05-F-075", 7, 1, 6],
  ["A05-F-076", 8, 2, 6],
  ["A05-F-077", 9, 1, 8],
  ["A05-F-078", 10, 2, 8],
]) {
  test(`${no} ${n}명 광대${jokers} 첫 밤 광대 화면 고를 수 있는 수 = ${expected}`, () => {
    const targets = targetsOf({ n, me: 0, role: "JOKER", allies: jokers === 2 ? [1] : [], dayIndex: 1 })
    assert.equal(selectableCount(targets), expected)
  })
}

// 의사 화면 고를 수 있는 수 (자기 포함)
for (const [no, label, options, expected] of [
  ["A05-F-079", "6명 의사1", { n: 6 }, 6],
  ["A05-F-080", "8명 의사2", { n: 8, allies: [1] }, 8],
  ["A05-F-081", "6명 중 1명 죽음", { n: 6, dead: [3] }, 5],
  ["A05-F-082", "10명", { n: 10 }, 10],
]) {
  test(`${no} ${label} 의사 화면 고를 수 있는 수 = ${expected} (자기 포함)`, () => {
    const targets = targetsOf({ me: 0, role: "DOCTOR", dayIndex: 1, ...options })
    assert.equal(selectableCount(targets), expected)
  })
}

// 경비원 화면 고를 수 있는 수 (자기 빼고, 동료 포함)
for (const [no, label, options, expected] of [
  ["A05-F-083", "8명 경비원1", { n: 8 }, 7],
  ["A05-F-084", "8명 경비원2", { n: 8, allies: [1] }, 7],
  ["A05-F-085", "8명 중 2명 죽음", { n: 8, dead: [3, 4] }, 5],
  ["A05-F-086", "10명", { n: 10 }, 9],
]) {
  test(`${no} ${label} 경비원 화면 고를 수 있는 수 = ${expected} (자기 빼고·동료 포함)`, () => {
    const targets = targetsOf({ me: 0, role: "GUARD", dayIndex: 1, ...options })
    assert.equal(selectableCount(targets), expected)
  })
}

test("A05-F-095 [지금 동작] 6명 광대 화면: 끊긴 산 시민도 고르고, 끊김 표시는 따로 붙음", () => {
  const targets = targetsOf({ n: 6, me: 0, role: "JOKER", disconnected: [4], dayIndex: 1 })
  const entry = targets.find((target) => target.id === kit.uuidOf(4))
  assert.equal(entry.selectable, true)
  assert.equal(entry.connected, false)
})
