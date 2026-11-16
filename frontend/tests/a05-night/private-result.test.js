// 밤 화면 시험(화면 상태): 내게만 오는 밤 결과(조사·확인·암살 실패)가 내 직업일 때만 글이 되는지, 그 글에 닉네임·직업 이름
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-044~060·096·108·109, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/private-result.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")
const { reduceInGameNightPrivateResult } = await import("../../src/domains/game/ingame/utils/reduceInGameNightPrivateResult.js")

test.afterEach(() => kit.reset())

// 결과 창에 들어갈 글 (창 훅과 같은 계산: 스토어 결과 + 명단), 없으면 null
const labelOf = (t) => reduceInGameNightPrivateResult(t.store().nightPrivateResult, t.store().state.players)?.label ?? null

// 밤 끝 차례대로 받기: 마지막 차례 끝 → 판정 끝 → 내 결과 (밤 결과 전)
function endNightWith(t, lastRole, fields) {
  t.turnStarts(lastRole)
  t.turnEnds(lastRole)
  t.actionsResolved()
  t.privateResult(fields)
}

const ALL_ROLES = [["JOKER", "광대"], ["CITIZEN", "귀족"], ["DOCTOR", "의사"], ["GUARD", "경비원"], ["WITCH_HUNTER", "마녀사냥꾼"]]

// 경비원 화면: 8명, 1 나(지영), 0 "민수" 조사
ALL_ROLES.forEach(([role, name], i) => {
  test(`A05-F-04${4 + i} 8명 경비원 화면 조사 결과: "민수" 직업 ${role} → 글에 "민수"와 "${name}"`, () => {
    const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
    endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role })
    const label = labelOf(t)
    assert.ok(label, "결과 글 없음")
    assert.match(label, /민수/)
    assert.match(label, new RegExp(`${name}입니다`))
  })
})

// 마녀사냥꾼 화면: 10명 둘째 밤, 1 나(지영), 0 "민수"는 죽은 사람
ALL_ROLES.forEach(([role, name], i) => {
  const no = String(49 + i).padStart(3, "0")
  test(`A05-F-${no} 10명 둘째 밤 마녀사냥꾼 화면 확인 결과: 죽은 "민수" 직업 ${role} → 글에 "민수"와 "${name}"`, () => {
    const t = kit.openNight({ n: 10, me: 1, role: "WITCH_HUNTER", dead: [0], dayIndex: 2 })
    endNightWith(t, "WITCH_HUNTER", { actionType: "CONFIRM", targetId: kit.uuidOf(0), role })
    const label = labelOf(t)
    assert.ok(label, "결과 글 없음")
    assert.match(label, /민수/)
    assert.match(label, new RegExp(`${name}입니다`))
  })
})

test("A05-F-054 6명 광대 화면 암살 실패 결과 → \"이번 밤의 암살이 실패했습니다.\"", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "JOKER" })
  endNightWith(t, "DOCTOR", { actionType: "ASSASSINATE", success: false })
  assert.equal(labelOf(t), "이번 밤의 암살이 실패했습니다.")
})

// 내 직업 결과가 아니면 안 보임 (쓴 사람에게만)
for (const [no, label, myRole, fields] of [
  ["A05-F-055", "시민 화면이 조사 결과", "CITIZEN", { actionType: "INVESTIGATE", targetId: "u1", role: "JOKER" }],
  ["A05-F-056", "의사 화면이 조사 결과", "DOCTOR", { actionType: "INVESTIGATE", targetId: "u1", role: "JOKER" }],
  ["A05-F-057", "광대 화면이 조사 결과", "JOKER", { actionType: "INVESTIGATE", targetId: "u1", role: "CITIZEN" }],
  ["A05-F-058", "경비원 화면이 확인 결과", "GUARD", { actionType: "CONFIRM", targetId: "u1", role: "CITIZEN" }],
]) {
  test(`${no} 8명 ${label}를 받음 → 결과 없음`, () => {
    const t = kit.openNight({ n: 8, me: 1, role: myRole, dead: [0], dayIndex: 2 })
    endNightWith(t, "GUARD", fields)
    assert.equal(t.store().nightPrivateResult, null)
    assert.equal(labelOf(t), null)
  })
}

test("A05-F-059 8명 죽은 경비원 화면(내 생존 거짓)이 조사 결과를 받음 → 결과 없음", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD", dead: [1] })
  endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "JOKER" })
  assert.equal(t.store().nightPrivateResult, null)
  assert.equal(labelOf(t), null)
})

test("A05-F-060 [지금 동작] 8명 둘째 밤에 날짜 1 조사 결과가 옴 → 결과 없음", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD", dayIndex: 2 })
  t.turnStarts("GUARD")
  t.turnEnds("GUARD")
  t.actionsResolved()
  t.privateResult({ actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "JOKER" }, { day: 1 })
  assert.equal(labelOf(t), null)
})

test("A05-F-096 8명 경비원: 판정 끝 → 개인 결과 → 밤 결과 차례로 받으면 결과 글이 남아 있음", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
  endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "JOKER" })
  t.nightApplied({ victim: 4 })
  assert.equal(t.store().state.phase, "DAY", "밤 결과가 안 들어감 (준비 잘못)")
  const label = labelOf(t)
  assert.ok(label, "밤 결과 뒤 결과 글이 사라짐")
  assert.match(label, /민수/)
})

test("A05-F-108 결과 글 낱말: 조사 글엔 \"조사\", 확인 글엔 \"확인\"", () => {
  const guard = kit.openNight({ n: 8, me: 1, role: "GUARD" })
  endNightWith(guard, "GUARD", { actionType: "INVESTIGATE", targetId: kit.uuidOf(0), role: "DOCTOR" })
  const investigate = labelOf(guard)
  const hunter = kit.openNight({ n: 10, me: 1, role: "WITCH_HUNTER", dead: [0], dayIndex: 2 })
  endNightWith(hunter, "WITCH_HUNTER", { actionType: "CONFIRM", targetId: kit.uuidOf(0), role: "DOCTOR" })
  const confirm = labelOf(hunter)
  assert.match(investigate ?? "", /조사/)
  assert.match(confirm ?? "", /확인/)
})

test("A05-F-109 [지금 동작] 조사 대상이 명단에 없는 uuid → 결과 글 안 만듦", () => {
  const t = kit.openNight({ n: 8, me: 1, role: "GUARD" })
  endNightWith(t, "GUARD", { actionType: "INVESTIGATE", targetId: "not-in-roster", role: "JOKER" })
  assert.equal(labelOf(t), null)
})
