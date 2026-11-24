// "낮이 되었습니다" 창과 시간 줄 날짜 화면 부품 시험 — 역할 공개 뒤 첫 낮·2일 낮 알림을 넣어 봄
// 목록 A03-낮투표.md 번호 A03-F-236~240
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  T0, click, closeDawnReport, dayPhaseChanged, dayResolved, fakeSocket, fire, firstDay, nextDay, renderPage, resetAll, seat, tick,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const dayEntrance = () => document.querySelector('[data-ingame-phase-entrance="DAY"]')
const timebar = () => document.querySelector('[aria-label$="시간 흐름"]')
// 창 안 확인 단추
const confirmIn = (box) => [...(box?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "확인") ?? null

// 6명 판 역할 공개 중 화면 → 첫 낮 알림 (토론 마감 60초)
async function firstDayPage({ beforeDay } = {}) {
  const socket = fakeSocket()
  seat({ n: 6, phase: "ROLE_REVEAL", dayIndex: 0 })
  await renderPage(socket)
  if (beforeDay) await beforeDay()
  await fire(socket, "game_phase_changed", firstDay({ deadline: Date.now() + 60_000 }))
  return socket
}

test("A03-F-236 ① 첫 낮 창 글 '낮이 되었습니다'", async () => {
  await firstDayPage()
  assert.ok(dayEntrance(), "낮 시작 창 있음")
  assert.match(dayEntrance().textContent, /낮이 되었습니다/)
})

test("A03-F-237 ② 확인 누르면 닫힘", async () => {
  await firstDayPage()
  await click(confirmIn(dayEntrance()))
  assert.equal(dayEntrance() === null, true)
})

test("A03-F-238 ③ 2일 낮에 다시 뜸", async () => {
  const socket = await firstDayPage()
  await click(confirmIn(dayEntrance()))
  await fire(socket, "day_phase_changed", dayPhaseChanged({ deadline: Date.now() + 30_000 }))
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
  const night = document.querySelector('[data-ingame-phase-entrance="NIGHT"]')
  if (night) await click(confirmIn(night))
  assert.equal(dayEntrance() === null, true)
  await fire(socket, "night_result_applied", nextDay({ n: 6, deadline: Date.now() + 60_000 }))
  await closeDawnReport()
  assert.ok(dayEntrance(), "2일 낮 시작 창 있음")
  assert.match(dayEntrance().textContent, /낮이 되었습니다/)
  assert.match(timebar().textContent, /제 2일/)
})

test("A03-F-239 ④ 창 떠 있어도 시간 줄 남은 시간이 줄어듦", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 })
  // 시간 바엔 늘 명패+타이머가 있음 (펼침 단추 없어짐)
  await firstDayPage()
  assert.ok(dayEntrance())
  const clock = () => timebar().querySelector('[role="timer"]')?.textContent
  assert.equal(clock(), "01:00")
  await tick(3_000)
  assert.ok(dayEntrance(), "창은 그대로 떠 있음")
  assert.equal(clock(), "00:57")
})

test("A03-F-240 ⑤ 첫 낮 시간 줄 날짜 '제 1일'", async () => {
  await firstDayPage()
  assert.match(timebar().textContent, /제 1일/)
  assert.equal(timebar().getAttribute("aria-label"), "제 1일 시간 흐름")
})
