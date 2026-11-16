// 밤 화면 시험(화면 상태): 밤 결과 알림을 받으면 명단 생사·단계·날짜·낮 마감·판 끝이 바뀌고, 죽은 사람은 다음 밤 행동이 꺼지는지
// 목록 시험목록/A05a-밤-차례-능력.md A05-F-061~066·098~106, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-night/night-applied.test.js
import test from "node:test"
import assert from "node:assert/strict"
// 가짜 브라우저 화면 + JSX 길 풀기 (시험 대상보다 먼저)
import "../helpers/domSetup.mjs"

const kit = await import("./nightKit.mjs")
const { selectInGameSelfAlive } = await import("../../src/domains/game/ingame/utils/selfAlive.js")

test.afterEach(() => kit.reset())

const aliveCount = (t) => t.store().state.players.filter((p) => p.alive).length
const playerOf = (t, index) => t.store().state.players.find((p) => p.uuid === kit.uuidOf(index))
const picking = (view) => view.probe.ctx.isNightTurnActor === true && view.probe.ctx.nightActionsLocked === false
// 그린 판의 카드 상태 글 (닉네임 → alive / dead / disconnected)
const cardStatuses = (container) => Object.fromEntries(
  [...container.querySelectorAll("[data-ingame-player-nickname]")]
    .map((card) => [card.getAttribute("data-ingame-player-nickname"), card.getAttribute("data-ingame-player-status")]),
)

test("A05-F-061 6명 암살 반영: 희생자 A 죽음, 산 사람 5, 단계 낮, 날짜 1 → 2", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  t.nightApplied({ victim: 3 })
  assert.equal(playerOf(t, 3).alive, false)
  assert.equal(aliveCount(t), 5)
  assert.equal(t.store().state.phase, "DAY")
  assert.equal(t.store().state.dayIndex, 2)
})

test("A05-F-062 6명 의사가 살림 반영(victimUuid null): 아무도 안 죽음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  t.nightApplied({ victim: null, doctorSaved: true })
  assert.equal(aliveCount(t), 6)
  assert.equal(t.store().state.phase, "DAY")
})

test("A05-F-063 6명 희생자 직업 안 보임: 반영 뒤 A 카드 직업 칸이 비어 있음", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  const view = kit.mountTable()
  t.nightApplied({ victim: 3 })
  assert.equal(playerOf(t, 3).role, undefined)
  const sessionA = view.probe.session.players.find((p) => p.id === kit.uuidOf(3))
  assert.equal(sessionA.role, undefined)
  assert.equal(sessionA.team, undefined)
})

test("A05-F-064 6명 희생자가 나(의사): 내 생존 거짓, 다음 밤 의사 차례에도 행동 꺼짐", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "DOCTOR" })
  const view = kit.mountTable()
  t.nightApplied({ victim: 0 })
  assert.equal(selectInGameSelfAlive(t.store().state), false)
  t.dayToNight()
  assert.equal(t.store().state.phase, "NIGHT", "둘째 밤으로 못 감 (준비 잘못)")
  t.turnStarts("DOCTOR")
  assert.equal(picking(view), false)
})

test("A05-F-065 판 끝 칸이 있는 밤 결과(winResult.winner JOKER) → 상태 판 끝, 승자 광대", () => {
  const t = kit.openNight({ n: 5, me: 0, role: "CITIZEN", dead: [2, 3] })
  t.nightApplied({ victim: 4, winner: "JOKER" })
  assert.equal(t.store().state.phase, "ENDED")
  assert.equal(t.store().state.winResult?.winner, "JOKER")
})

test("A05-F-066 판 안 끝남: 밤 결과에 실린 새 낮 마감 시각 = 상태 낮 마감", () => {
  const t = kit.openNight({ n: 6, me: 0, role: "CITIZEN" })
  const deadline = Date.now() + 120_000
  t.nightApplied({ victim: 3, dayPhaseDeadline: deadline })
  assert.equal(t.store().state.dayPhaseDeadline, deadline)
})

for (const [no, n] of [["A05-F-098", 5], ["A05-F-099", 6], ["A05-F-100", 7], ["A05-F-101", 8], ["A05-F-102", 10]]) {
  test(`${no} ${n}명 희생자 1명 밤 결과 → 산 사람 수 ${n - 1}`, () => {
    const t = kit.openNight({ n, me: 0, role: "CITIZEN" })
    t.nightApplied({ victim: n - 1 })
    assert.equal(aliveCount(t), n - 1)
  })
}

for (const [no, label, victim] of [["A05-F-103", "첫째", 0], ["A05-F-104", "마지막", 5]]) {
  test(`${no} 6명 희생자가 명단 ${label} 카드 → 그 카드만 사망`, () => {
    const t = kit.openNight({ n: 6, me: 2, role: "CITIZEN" })
    const view = kit.mountTable()
    t.nightApplied({ victim })
    const statuses = cardStatuses(view.container)
    const dead = Object.entries(statuses).filter(([, status]) => status === "dead").map(([nick]) => nick)
    assert.deepEqual(dead, [kit.NICKS[victim]])
  })
}

test("A05-F-105 판 끝 상태에서 늦게 온 광대 차례 시작 → 행동 꺼짐", () => {
  const t = kit.openNight({ n: 5, me: 0, role: "JOKER", dead: [2, 3] })
  const view = kit.mountTable()
  t.nightApplied({ victim: 4, winner: "JOKER" })
  assert.equal(t.store().state.phase, "ENDED", "판이 안 끝남 (준비 잘못)")
  t.turnStarts("JOKER")
  assert.equal(picking(view), false)
  assert.equal(kit.skipButton(view.container) === null, true, "건너뛰기 단추가 남음")
})

test("A05-F-106 8명 첫 밤에 죽은 경비원(나) → 둘째 밤 경비원 차례에도 꺼짐", () => {
  const t = kit.openNight({ n: 8, me: 0, role: "GUARD" })
  const view = kit.mountTable()
  t.nightApplied({ victim: 0 })
  t.dayToNight()
  assert.equal(t.store().state.dayIndex, 2, "둘째 밤으로 못 감 (준비 잘못)")
  t.turnStarts("GUARD")
  assert.equal(picking(view), false)
})
