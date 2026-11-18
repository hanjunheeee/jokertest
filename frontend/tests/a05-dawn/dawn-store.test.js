// 밤 결과를 받은 화면 상태 시험: 서버 night_result_applied가 오면 보는 사람이 누구든 같은 낮 시작 연출 값, 명단 생사, 두 번·옛 값·다른 판 값 무시, 다 보면 지움, 새로고침엔 안 생김
// 목록 시험목록/A05b-밤-알림-낮연출.md A05-F-521~554, 돌리기(frontend): node --experimental-test-module-mocks --test tests/a05-dawn/dawn-store.test.js
import test from "node:test"
import assert from "node:assert/strict"
import * as kit from "./dawnKit.mjs"

test.afterEach(kit.resetAll)

// 7명 판 자리: 0 광대, 1 의사, 2 당할 A(시민), 3 산 시민, 4 죽은 관전자(시민), 5·6 시민
const ROLES7 = { 0: "JOKER", 1: "DOCTOR" }
const A = 2

// 1일 밤 7명 판, 보는 사람 자리 me (스토어 값만 봄)
const night7 = (me) => kit.openGame({ n: 7, me, roles: ROLES7, dead: [4], events: "store" })

// 연출 값을 글자로: "KILLED:가을" / "QUIET" / "없음"
const dawnText = (g) => {
  const report = g.dawn()
  if (report === null) return "없음"
  if (report.kind === "QUIET") return `QUIET${report.victims.length > 0 ? ":이름있음" : ""}`
  return `${report.kind}:${report.victims.map((v) => v.nickname).join(",")}`
}

// 밤 결과 세 가지 (서버가 보내는 값) — 의사가 살렸든 광대가 안 죽였든 같은 "아무 일 없음" 연출 (사용자 결정 2026-11-18)
const CASES = {
  죽음: { send: { victim: A }, expect: () => `KILLED:${kit.NAMES[A]}` },
  살림: { send: { victim: null, saved: true }, expect: () => "QUIET" },
  "광대 안 죽임": { send: { victim: null, saved: false }, expect: () => "QUIET" },
}
const VIEWERS = [["산 시민", 3], ["광대", 0], ["당한 A", A], ["죽은 관전자", 4], ["의사", 1]]

let no = 521
for (const [caseName, c] of Object.entries(CASES)) {
  for (const [viewerName, me] of VIEWERS) {
    test(`A05-F-${no} [버그 5] 7명 판 보는 사람 ${viewerName} · 밤 결과 ${caseName} → 낮 시작 연출 ${c.expect()}`, async () => {
      const g = await night7(me)
      await g.nightResult(c.send)
      assert.equal(g.state().phase, "DAY", "낮으로 안 넘어감 (준비 잘못)")
      assert.equal(dawnText(g), c.expect())
    })
    no += 1
  }
}

test("A05-F-536 죽음 → 명단에서 A 죽음, 밤 살해 표시 붙음", async () => {
  const g = await night7(3)
  await g.nightResult({ victim: A })
  assert.equal(g.player(A)?.alive, false)
  assert.equal(g.player(A)?.nightKilled, true)
})

test("A05-F-537 살림 → 명단 생사 그대로 (아무도 안 죽음)", async () => {
  const g = await night7(3)
  await g.nightResult({ victim: null, saved: true })
  const deadNow = g.state().players.filter((p) => p.alive === false).map((p) => p.uuid)
  assert.deepEqual(deadNow, [g.uuid(4)])
})

test("A05-F-538 [임시 9] 판 끝 값(phase ENDED) + 희생자 A → 단계 ENDED, 연출 KILLED(A)", async () => {
  const g = await kit.openGame({ n: 5, me: 3, roles: { 0: "JOKER", 1: "JOKER" }, events: "store" })
  await g.nightResult({ victim: A, ended: "JOKER" })
  assert.equal(g.state().phase, "ENDED")
  assert.equal(dawnText(g), `KILLED:${kit.NAMES[A]}`)
})

test("A05-F-539 같은 밤 결과가 두 번 오면 두 번째는 무시, 연출 그대로", async () => {
  const g = await night7(3)
  const payload = g.nightResultPayload({ victim: A })
  await g.say("night_result_applied", payload)
  const first = g.dawn()
  assert.equal(dawnText(g), `KILLED:${kit.NAMES[A]}`)
  await g.say("night_result_applied", payload)
  assert.ok(g.dawn() === first, "연출 값이 바뀜")
  assert.equal(g.state().dayIndex, 2)
})

test("A05-F-540 3일 낮인데 2일 밤 결과(다음 날 3)가 늦게 옴 → 상태 그대로", async () => {
  const g = await kit.openGame({ n: 7, me: 3, roles: ROLES7, dead: [4], phase: "DAY", dayIndex: 3, events: "store" })
  const before = g.state()
  await g.say("night_result_applied", g.nightResultPayload({ victim: A, dayIndex: 3 }))
  assert.ok(g.state() === before, "판 상태가 바뀜")
  assert.equal(g.dawn(), null)
})

test("A05-F-541 다른 판 id의 밤 결과 → 상태 그대로, 연출 없음", async () => {
  const g = await night7(3)
  const before = g.state()
  await g.say("night_result_applied", g.nightResultPayload({ victim: A, gameId: "a05-dawn-other" }))
  assert.ok(g.state() === before, "판 상태가 바뀜")
  assert.equal(g.dawn(), null)
})

test("A05-F-542 연출을 다 봄(맞는 구별 표시로 끝냄) → 연출 없음", async () => {
  const g = await night7(3)
  await g.nightResult({ victim: A })
  const key = g.dawn()?.key
  kit.RTL.act(() => { g.store().finishDawnReport(key) })
  assert.equal(g.dawn(), null)
})

test("A05-F-543 다른 구별 표시로 끝냄 → 연출 남음", async () => {
  const g = await night7(3)
  await g.nightResult({ victim: A })
  kit.RTL.act(() => { g.store().finishDawnReport("다른-연출") })
  assert.equal(dawnText(g), `KILLED:${kit.NAMES[A]}`)
})

test("A05-F-544 연출 KILLED가 남은 채 새로고침(빈 탭 + 서버 스냅샷) → 연출 없음", async () => {
  const g = await night7(3)
  await g.nightResult({ victim: A })
  assert.equal(dawnText(g), `KILLED:${kit.NAMES[A]}`, "준비 잘못: 연출이 안 생김")
  await g.reload({ phase: "DAY", dayIndex: 2 }, { view: "none" })
  assert.equal(g.state()?.dayIndex, 2, "스냅샷이 안 들어감 (준비 잘못)")
  assert.equal(g.dawn(), null)
})

test("A05-F-545 빈 상태 + 낮 스냅샷(A 죽음)만 받음 → 연출 없음, A 죽음", async () => {
  const g = await kit.openGame({ n: 7, me: 3, roles: ROLES7, dead: [4, A], phase: "DAY", dayIndex: 2, events: "store" })
  assert.equal(g.dawn(), null)
  assert.equal(g.player(A)?.alive, false)
})

// 두 밤 연달아: 1밤 연출 닫고 → 낮을 넘겨 2밤 → 2밤 결과 연출이 2밤 경우대로 (5명 넘게: 7명, 2밤은 다른 사람 B가 당함)
const B = 5
const NIGHT_CASES = {
  죽음: (victim) => ({ send: { victim }, expect: `KILLED:${kit.NAMES[victim]}` }),
  살림: () => ({ send: { victim: null, saved: true }, expect: "QUIET" }),
  "광대 안 죽임": () => ({ send: { victim: null, saved: false }, expect: "QUIET" }),
}
let pairNo = 546
for (const first of Object.keys(NIGHT_CASES)) {
  for (const second of Object.keys(NIGHT_CASES)) {
    const one = NIGHT_CASES[first](A)
    const two = NIGHT_CASES[second](B)
    test(`A05-F-${pairNo} 두 밤 연달아 (1밤 ${first}, 2밤 ${second}) → 2밤 연출 ${two.expect}`, async () => {
      const g = await night7(3)
      await g.nightResult(one.send)
      assert.equal(dawnText(g), one.expect, "1밤 연출이 틀림 (준비 잘못)")
      const key = g.dawn()?.key
      if (key) kit.RTL.act(() => { g.store().finishDawnReport(key) })
      await g.dayToNight()
      assert.equal(g.state().phase, "NIGHT", "밤으로 안 넘어감 (준비 잘못)")
      await g.nightResult(two.send)
      assert.equal(g.state().dayIndex, 3)
      assert.equal(dawnText(g), two.expect)
    })
    pairNo += 1
  }
}

// ---------- A05-F-706~709 그 밤 사이 탈락이 보였으면 "아무 일 없음" 연출 안 만듦 (사용자 결정 2026-11-18) ----------
// 밤 사이 seat 자리가 끊겨 탈락 (서버 player_eliminated 모양)
async function dropAtNight(g, seat) {
  g.seats[seat].alive = false
  await g.say("player_eliminated", {
    gameId: g.gameId, phase: g.phase, dayIndex: g.dayIndex, victimUuid: g.uuid(seat),
    players: g.seats.map((s) => ({ uuid: s.uuid, alive: s.alive })),
  })
}

test("A05-F-706 밤 사이 5번 탈락 → 밤 결과 희생자 없음 → 연출 없음, 5번 죽음", async () => {
  const g = await night7(3)
  await dropAtNight(g, 5)
  assert.equal(g.player(5)?.alive, false, "탈락이 안 들어감 (준비 잘못)")
  await g.nightResult({ victim: null })
  assert.equal(g.state().phase, "DAY", "낮으로 안 넘어감 (준비 잘못)")
  assert.equal(dawnText(g), "없음")
})

test("A05-F-707 밤 사이 5번 탈락 + 광대가 A를 죽임 → 살해 연출 그대로 (A만)", async () => {
  const g = await night7(3)
  await dropAtNight(g, 5)
  await g.nightResult({ victim: A })
  assert.equal(dawnText(g), `KILLED:${kit.NAMES[A]}`)
})

test("A05-F-708 낮 중 5번 탈락 → 그 밤 아무도 안 죽으면 아무 일 없음 연출 (낮에 빠진 건 그 밤 일이 아님)", async () => {
  const g = await kit.openGame({ n: 7, me: 3, roles: ROLES7, dead: [4], phase: "DAY", dayIndex: 1, events: "store" })
  await dropAtNight(g, 5)
  assert.equal(g.player(5)?.alive, false, "탈락이 안 들어감 (준비 잘못)")
  await g.dayToNight()
  assert.equal(g.state().phase, "NIGHT", "밤으로 안 넘어감 (준비 잘못)")
  await g.nightResult({ victim: null })
  assert.equal(dawnText(g), "QUIET")
})

test("A05-F-709 끊겼다 다시 붙은 스냅샷(같은 밤)에서 5번이 죽어 있음 → 밤 결과 희생자 없음 → 연출 없음", async () => {
  const g = await night7(3)
  g.seats[5].alive = false
  kit.RTL.act(() => { g.store().applySessionSnapshot(g.snapshot({ phase: "NIGHT", dayIndex: 1 })) })
  assert.equal(g.player(5)?.alive, false, "스냅샷이 안 들어감 (준비 잘못)")
  await g.nightResult({ victim: null })
  assert.equal(dawnText(g), "없음")
})
