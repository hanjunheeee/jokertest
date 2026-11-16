// 밤 화면 시험(화면 상태): 차례 시작·끝 알림이 지금 차례를 바꾸는지, 내 차례에만 고르기가 켜지는지, 새로고침 뒤 이어서·남은 시간
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-021~039·091~094·097·107·110, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/turn-state.test.js
import test, { mock } from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")
const { createElement } = await import("react")
const { selectInGameNightTurnRole } = await import("../../src/domains/game/ingame/utils/nightTurn.js")
const { getInGameNightTurnAnnouncement } = await import("../../src/domains/game/ingame/constants/nightTurn/ingameNightTurnAnnouncement.js")

test.afterEach(() => {
  kit.reset()
  mock.timers.reset()
})

const ROLES = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]
// 마녀사냥꾼은 둘째 밤부터 차례가 있어 그 직업 시험만 둘째 밤
const dayFor = (role) => (role === "WITCH_HUNTER" ? 2 : 1)
// 지금 차례 직업 (화면이 쓰는 고르개)
const turnRole = (t) => selectInGameNightTurnRole(t.store().state)
// 대상 고르기 켜짐 = 행동 칸 값이 내 차례이고 잠기지 않음
const picking = (view) => view.probe.ctx.isNightTurnActor === true && view.probe.ctx.nightActionsLocked === false

// 10명 판: 0 나, 직업 구성은 광대·의사·경비원·마녀사냥꾼·시민이 다 있는 판
for (const [no, role, message] of [
  ["A05-F-021", "JOKER", "광대의 시간입니다"],
  ["A05-F-022", "DOCTOR", "의사의 시간입니다"],
  ["A05-F-023", "GUARD", "경비원의 시간입니다"],
  ["A05-F-024", "WITCH_HUNTER", "마녀사냥꾼의 시간입니다"],
]) {
  test(`${no} 10명 시민 화면: ${role} 차례 시작 알림 → 지금 차례 ${role}, 안내 글 "${message}"`, () => {
    const t = kit.openNight({ n: 10, me: 0, role: "CITIZEN", dayIndex: dayFor(role) })
    t.turnStarts(role)
    assert.equal(turnRole(t), role)
    assert.equal(getInGameNightTurnAnnouncement(turnRole(t), t.store().state.dayIndex)?.message, message)
  })
}

test("A05-F-025 [지금 동작] 다른 판 차례 시작 알림은 버림", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  t.turnStarts("JOKER", { game: "other-game" })
  assert.equal(turnRole(t), null)
})

test("A05-F-026 [지금 동작] 둘째 밤에 날짜 1 차례 시작 알림이 오면 버림", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN", dayIndex: 2 })
  t.turnStarts("JOKER", { day: 1 })
  assert.equal(turnRole(t), null)
})

test("A05-F-027 시민 차례 알림(role CITIZEN)은 버림", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  t.turnStarts("CITIZEN")
  assert.equal(turnRole(t), null)
  assert.equal(t.store().state.nightTurnRole, null)
})

test("A05-F-028 광대 차례 끝 알림 → 지금 차례 없음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  t.turnStarts("JOKER")
  t.turnEnds("JOKER")
  assert.equal(turnRole(t), null)
})

// 내 직업 4 × (내 차례 / 남 차례): 남 차례는 내 직업 다음 직업 (마녀사냥꾼은 광대 차례)
const OTHER_TURN = { JOKER: "DOCTOR", DOCTOR: "GUARD", GUARD: "JOKER", WITCH_HUNTER: "JOKER" }
let caseNo = 29
for (const role of ROLES) {
  for (const mine of [true, false]) {
    const no = `A05-F-0${caseNo}`
    caseNo += 1
    const turn = mine ? role : OTHER_TURN[role]
    test(`${no} 10명 ${role} 화면, ${mine ? "내" : "남"} 차례(${turn}) → 대상 고르기 ${mine ? "켜짐" : "꺼짐"}`, () => {
      const t = kit.openNight({ n: 10, me: 0, role, dayIndex: dayFor(role) })
      const view = kit.mountTable()
      t.turnStarts(turn)
      assert.equal(picking(view), mine)
    })
  }
}

test("A05-F-037 6명 첫날 처형된 의사 화면: 의사 차례여도 고르기 꺼짐", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "DOCTOR", dead: [0] })
  const view = kit.mountTable()
  t.turnStarts("DOCTOR")
  assert.equal(picking(view), false)
})

test("A05-F-038 10명 시민 화면: 광대·의사·경비원·마녀사냥꾼 어느 차례에도 고르기 꺼짐", () => {
  const t = kit.openNight({ n: 10, me: 0, role: "CITIZEN", dayIndex: 2 })
  const view = kit.mountTable()
  const seen = []
  for (const role of ROLES) {
    t.turnStarts(role)
    seen.push([role, picking(view)])
    t.turnEnds(role)
  }
  assert.deepEqual(seen, ROLES.map((role) => [role, false]))
})

test("A05-F-039 10명 첫 밤 마녀사냥꾼 화면(처형된 시민 있음): 경비원 차례 끝 → 밤 결과까지 마녀 행동이 한 번도 안 켜짐", () => {
  const t = kit.openNight({ n: 10, me: 0, role: "WITCH_HUNTER", dead: [5], dayIndex: 1 })
  const view = kit.mountTable()
  const seen = [picking(view)]
  for (const role of ["JOKER", "DOCTOR", "GUARD"]) {
    t.turnStarts(role)
    seen.push(picking(view))
    t.turnEnds(role)
    seen.push(picking(view))
  }
  t.actionsResolved()
  seen.push(picking(view))
  t.nightApplied({ victim: 6 })
  seen.push(picking(view))
  assert.deepEqual(seen, seen.map(() => false))
  assert.equal(t.store().state.phase, "DAY")
})

// 새로고침: 빈 화면에 스냅샷(지금 차례 = 내 직업, 마감 = 지금+45초)을 넣음 → 고르기 다시 켜짐, 남은 시간 마감 기준
const NOW = 1_763_280_000_000
for (const [no, role] of [["A05-F-091", "JOKER"], ["A05-F-092", "DOCTOR"], ["A05-F-093", "GUARD"], ["A05-F-094", "WITCH_HUNTER"]]) {
  test(`${no} 10명 ${role} 화면 새로고침 뒤 내 차례 이어서: 고르기 켜짐, 남은 시간 00:45`, () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW })
    kit.openFromSnapshot({ n: 10, me: 0, role, dayIndex: dayFor(role), nightTurnRole: role, nightTurnDeadline: NOW + 45_000 })
    const view = kit.mountTable({ extra: [createElement(kit.TurnTimer, { key: "timer" })] })
    assert.equal(picking(view), true)
    assert.equal(kit.screen.getByRole("timer").textContent, "00:45")
  })
}

test("A05-F-097 6명 광대 화면: 판정 끝 알림(night_actions_resolved)을 받은 뒤엔 고르기 꺼짐", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "JOKER" })
  const view = kit.mountTable()
  t.turnStarts("JOKER")
  assert.equal(picking(view), true, "광대 차례가 안 켜짐 (준비 잘못)")
  t.actionsResolved()
  assert.equal(picking(view), false)
})

test("A05-F-107 6명 시민 화면: 다 죽은 직업(의사) 차례 시작 → 지금 차례 의사로 보임", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN", dead: [2] })
  t.turnStarts("DOCTOR")
  assert.equal(turnRole(t), "DOCTOR")
})

test("A05-F-110 6명 광대 차례 마감 = 지금+60초 → 타이머 남은 시간 01:00", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW })
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  kit.mountTable({ extra: [createElement(kit.TurnTimer, { key: "timer" })] })
  t.turnStarts("JOKER", { deadline: NOW + 60_000 })
  assert.equal(kit.screen.getByRole("timer").textContent, "01:00")
})
