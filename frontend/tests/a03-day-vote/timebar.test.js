// 시간 줄 "[5초 뒤 마감]" 글과 남은 초(가짜 시계) 화면 부품 시험 — 다 내면 5초 뒤 판정 알림을 넣고 시간 바를 봄
// 목록 A03-낮투표.md 번호 A03-F-132~141 (⑩은 정한 글 없어 지금 동작을 임시 정답으로 씀)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  T0, buttonByName, click, dayResolved, fakeSocket, fire, loginOnly, renderPage, resetAll, seat, settle, snapshot, tick, uuidOf,
} from "./dayVoteHarness.mjs"

test.afterEach(() => resetAll())

const SETTLE_LABEL = "[5초 뒤 마감]"
const timebar = () => document.querySelector('[aria-label$="시간 흐름"]')
const clock = () => timebar()?.querySelector('[role="timer"]')?.textContent ?? null
const expandButton = () => timebar()?.querySelector("[data-ingame-timebar-expand]")

// 가짜 시계(T0)로 6명 판 1일 화면, 투표 마감은 40초 뒤
async function timebarPage({ dayPhase = "DAY_VOTE" } = {}) {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 })
  const socket = fakeSocket()
  seat({ n: 6, phase: "DAY", dayPhase, deadline: T0 + 40_000 })
  await renderPage(socket)
  return socket
}
// 다 내서 지금+5초로 당김
async function pulled() {
  const socket = await timebarPage()
  await fire(socket, "phase_settle_started", settle({ deadline: T0 + 5_000 }))
  return socket
}

// A03-F-132~135 남은 5·4·1·0초
;[[5, 0], [4, 1_000], [1, 4_000], [0, 5_000]].forEach(([left, passed], i) => {
  test(`A03-F-${132 + i} 당김 상태 남은 ${left}초 → '[5초 뒤 마감]'과 00:0${left}`, async () => {
    await pulled()
    if (passed > 0) await tick(passed)
    assert.match(timebar().textContent, /\[5초 뒤 마감\]/)
    assert.equal(clock(), `00:0${left}`)
  })
})

test("A03-F-136 ⑤ 당김 없음 → '[5초 뒤 마감]' 글 없음", async () => {
  await timebarPage()
  assert.equal(document.body.textContent.includes(SETTLE_LABEL), false)
})

test("A03-F-137 ⑥ 당기면 접힌 시간 바가 저절로 펼침", async () => {
  const socket = await timebarPage()
  assert.equal(expandButton().getAttribute("aria-expanded"), "false")
  await fire(socket, "phase_settle_started", settle({ deadline: T0 + 5_000 }))
  assert.equal(expandButton().getAttribute("aria-expanded"), "true")
})

test("A03-F-138 ⑦ 토론 중 → '[5초 뒤 마감]' 없음", async () => {
  const socket = await timebarPage({ dayPhase: "DAY_DISCUSSION" })
  await fire(socket, "phase_settle_started", settle({ deadline: T0 + 5_000 }))
  assert.equal(document.body.textContent.includes(SETTLE_LABEL), false)
})

test("A03-F-139 ⑧ 당긴 뒤 재판으로 넘어감 → '[5초 뒤 마감]' 없어짐", async () => {
  const socket = await pulled()
  assert.ok(timebar().textContent.includes(SETTLE_LABEL))
  await tick(5_000)
  await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TRIBUNAL", alive: 6, abstain: 0, target: uuidOf(2), tribunalDeadline: T0 + 65_000 }))
  assert.equal(document.body.textContent.includes(SETTLE_LABEL), false)
})

test("A03-F-140 ⑨ 새로고침 스냅샷의 짧은 마감 → 남은 초 00:03", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 })
  loginOnly()
  const socket = fakeSocket({ acks: { get_session_snapshot: snapshot({ extra: { dayPhaseDeadline: T0 + 3_000 } }) } })
  await renderPage(socket)
  await click(buttonByName("시간흐름바 확대"))
  assert.equal(clock(), "00:03")
})

test("A03-F-141 ⑩ 마감이 지나도 음수 안 보임 [지금 동작]", async () => {
  await pulled()
  await tick(8_000)
  assert.equal(clock(), "00:00")
  assert.equal(timebar().textContent.includes("-0"), false)
})
