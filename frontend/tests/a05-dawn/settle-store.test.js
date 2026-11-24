// 5초 마감 알림을 받은 화면 상태 시험: phase_settle_started(NIGHT)가 지금 판·날짜·차례에 맞을 때만 밤 마감을 당기고 "[5초 뒤 마감]", 다음 차례·차례 끝·낮이면 꺼짐, 새로고침 남은 시간, 5초 중에도 고르기 열림
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-555~571, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/settle-store.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

const SETTLE_TEXT = "[5초 뒤 마감]"
const T0 = 1_800_000_000_000

// 6명 둘째 밤, 나는 0번 광대, 광대 차례 열림 (마감 30초 뒤), 스토어 값만 봄
async function jokerTurn() {
  kit.useFakeClock(T0)
  const g = await kit.openGame({ n: 6, me: 0, roles: { 0: "JOKER", 1: "DOCTOR" }, dayIndex: 2, events: "store" })
  await g.turnStarts("JOKER", { deadline: T0 + 30_000 })
  assert.equal(g.state().nightTurnDeadline, T0 + 30_000, "차례가 안 열림 (준비 잘못)")
  return g
}
const statusOf = (g) => kit.selectInGameTimebarStatusLabel(g.state())
const settledOf = (g) => kit.selectInGamePhaseSettled(g.state())

// 판 id·날짜·직업 맞음/틀림 8가지 → 셋 다 맞을 때만 반영
const COMBOS = []
for (const gameOk of [true, false]) {
  for (const dayOk of [true, false]) {
    for (const roleOk of [true, false]) COMBOS.push({ gameOk, dayOk, roleOk })
  }
}
COMBOS.forEach(({ gameOk, dayOk, roleOk }, i) => {
  const all = gameOk && dayOk && roleOk
  const label = `판 id ${gameOk ? "맞음" : "틀림"} · 날짜 ${dayOk ? "맞음" : "틀림"} · 직업 ${roleOk ? "맞음" : "틀림"}`
  test(`A05-F-${555 + i} 밤 5초 알림 ${label} → ${all ? "밤 마감 = 새 값, 상태 글 \"[5초 뒤 마감]\"" : "그대로"}`, async () => {
    const g = await jokerTurn()
    await g.settle({
      gameId: gameOk ? g.gameId : "a05-dawn-other",
      dayIndex: dayOk ? 2 : 1,
      role: roleOk ? "JOKER" : "DOCTOR",
      deadline: T0 + 5_000,
    })
    if (all) {
      assert.equal(g.state().nightTurnDeadline, T0 + 5_000)
      assert.equal(statusOf(g), SETTLE_TEXT)
    } else {
      assert.equal(g.state().nightTurnDeadline, T0 + 30_000)
      assert.notEqual(statusOf(g), SETTLE_TEXT)
    }
  })
})

test("A05-F-563 [지금 동작] 마감 값이 숫자가 아님(\"x\") → 그대로", async () => {
  const g = await jokerTurn()
  await g.settle({ role: "JOKER", deadline: "x" })
  assert.equal(g.state().nightTurnDeadline, T0 + 30_000)
  assert.equal(settledOf(g), false)
})

test("A05-F-564 낮(투표)인데 NIGHT 5초 알림 → 그대로", async () => {
  kit.useFakeClock(T0)
  const g = await kit.openGame({ n: 6, me: 0, roles: { 0: "JOKER" }, phase: "DAY", dayIndex: 2, dayPhase: "DAY_VOTE", events: "store" })
  const before = g.state()
  await g.settle({ role: "JOKER", phase: "NIGHT", deadline: T0 + 5_000 })
  assert.ok(g.state() === before, "판 상태가 바뀜")
  assert.equal(settledOf(g), false)
})

test("A05-F-565 5초 표시 중 night_turn_started(DOCTOR) → 표시 없음, 의사 차례 새 마감", async () => {
  const g = await jokerTurn()
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  assert.equal(settledOf(g), true, "5초 표시가 안 켜짐 (준비 잘못)")
  await g.turnEnds("JOKER")
  await g.turnStarts("DOCTOR", { deadline: T0 + 40_000 })
  assert.equal(settledOf(g), false)
  assert.notEqual(statusOf(g), SETTLE_TEXT)
  assert.equal(g.state().nightTurnDeadline, T0 + 40_000)
})

test("A05-F-566 5초 표시 중 night_turn_ended(JOKER) → 표시 없음", async () => {
  const g = await jokerTurn()
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  await g.turnEnds("JOKER")
  assert.equal(settledOf(g), false)
  assert.notEqual(statusOf(g), SETTLE_TEXT)
})

test("A05-F-567 5초 표시 중 밤 결과(낮) → 표시 없음", async () => {
  const g = await jokerTurn()
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  await g.nightResult({ victim: 3 })
  assert.equal(g.state().phase, "DAY", "낮으로 안 넘어감 (준비 잘못)")
  assert.equal(settledOf(g), false)
  assert.notEqual(statusOf(g), SETTLE_TEXT)
})

test("A05-F-568 같은 5초 알림 두 번 → 마감·상태 글 같음", async () => {
  const g = await jokerTurn()
  const payload = g.settlePayload({ role: "JOKER", deadline: T0 + 5_000 })
  await g.say("phase_settle_started", payload)
  const deadline1 = g.state().nightTurnDeadline
  const label1 = statusOf(g)
  await g.say("phase_settle_started", payload)
  assert.equal(g.state().nightTurnDeadline, deadline1)
  assert.equal(statusOf(g), label1)
  assert.equal(label1, SETTLE_TEXT)
})

test("A05-F-569 광대 차례 끝·의사 차례 중에 늦게 온 role JOKER 알림 → 그대로", async () => {
  const g = await jokerTurn()
  await g.turnEnds("JOKER")
  await g.turnStarts("DOCTOR", { deadline: T0 + 40_000 })
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  assert.equal(g.state().nightTurnDeadline, T0 + 40_000)
  assert.equal(settledOf(g), false)
})

test("A05-F-570 새로고침 스냅샷 nightTurnDeadline = 지금+4초 → 남은 시간 00:04", async () => {
  kit.useFakeClock(T0)
  const g = await kit.openGame({
    n: 6, me: 0, roles: { 0: "JOKER" }, dayIndex: 2, nightTurnRole: "JOKER", nightTurnDeadline: T0 + 4_000,
  })
  await g.timebar()
  // 시간 바엔 늘 명패+타이머가 있음 (펼침 단추 없어짐)
  assert.match(kit.bodyText(), /00:04/)
})

test("A05-F-571 5초 표시 중 조작 상태 → 밤 대상 고르기 열림(잠기지 않음)", async () => {
  // 조작 묶음을 그리면 화면이 알림 받기를 붙임 (스토어 전용 손잡이는 안 씀)
  kit.useFakeClock(T0)
  const g = await kit.openGame({ n: 6, me: 0, roles: { 0: "JOKER", 1: "DOCTOR" }, dayIndex: 2 })
  const sink = await g.panel()
  await g.turnStarts("JOKER", { deadline: T0 + 30_000 })
  await g.settle({ role: "JOKER", deadline: T0 + 5_000 })
  assert.equal(settledOf(g), true, "5초 표시가 안 켜짐 (준비 잘못)")
  assert.equal(sink.ctx?.nightActionsLocked, false)
})
