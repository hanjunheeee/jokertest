// 재판 중 위쪽 시간 바 시험(jsdom): 다 내 마감이 당겨지면 "[5초 뒤 마감]"과 줄어드는 남은 시간, 재판 시작 시간, 판정 단추 없음, 재판 단계 글
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-238~243, A04-F-269
import test from "node:test"
import assert from "node:assert/strict"
import { openTable, resetTable, RTL, useFakeClock, tick } from "./tribunalTable.mjs"

test.afterEach(resetTable)

const { screen, within } = RTL

// 위쪽 시간 바 (제 N일 시간 흐름)
const timebar = (t) => screen.getByLabelText(`제 ${t.dayIndex}일 시간 흐름`)
const timerText = (t) => within(timebar(t)).getByRole("timer").textContent

// 재판 중인 인게임 화면 (가짜 시계)
async function tribunalPage(n, { seconds = 60 } = {}) {
  useFakeClock()
  const t = await openTable({ n, view: "page" })
  await t.openTribunal(3, { seconds })
  return t
}

// 접힌 시간 바 펼치기 (남은 시간은 펼친 바에 보임)
async function expand(t) {
  await t.click(within(timebar(t)).getByRole("button", { name: "시간흐름바 확대" }))
}

test("A04-F-238 6명 판: 재판 중 마감 당김 알림 → 시간 바 글 \"[5초 뒤 마감]\"", async () => {
  const t = await tribunalPage(6)
  assert.equal(within(timebar(t)).queryByText("[5초 뒤 마감]"), null)
  await t.settle()
  assert.ok(within(timebar(t)).queryByText("[5초 뒤 마감]"), "시간 바에 [5초 뒤 마감] 없음")
})

test("A04-F-239 6명 판: 당긴 남은 시간 0:05 → 가짜 시계 1초 → 0:04", async () => {
  const t = await tribunalPage(6)
  await t.settle()
  assert.ok(timerText(t).includes("0:05"), `처음 ${timerText(t)}`)
  await tick(1_000)
  assert.ok(timerText(t).includes("0:04"), `1초 뒤 ${timerText(t)}`)
})

;[
  ["A04-F-240", 15, "0:15"],
  ["A04-F-241", 60, "1:00"],
  ["A04-F-242", 120, "2:00"],
].forEach(([id, seconds, clock]) => {
  test(`${id} 7명 판: 재판 ${seconds}초 시작 → 시간 바 ${clock}`, async () => {
    const t = await tribunalPage(7, { seconds })
    await expand(t)
    assert.ok(timerText(t).includes(clock), `시간 바 ${timerText(t)}`)
  })
})

test("A04-F-243 8명 판: 재판 중 시간 바 행동 줄에 \"재판 판정\"·\"낮 집계\"·\"밤 종료\" 단추 없음", async () => {
  const t = await tribunalPage(8)
  await expand(t)
  for (const name of ["재판 판정", "낮 집계", "밤 종료"]) {
    assert.equal(screen.queryByRole("button", { name }), null, `${name} 단추가 있음`)
  }
  assert.equal(within(timebar(t)).queryByLabelText("단계 행동"), null)
})

test("A04-F-269 7명 판: 재판 중 시간 바 → \"재판\"·\"진행 중\" 글", async () => {
  const t = await tribunalPage(7)
  await expand(t)
  const text = timebar(t).textContent
  assert.match(text, /재판/)
  assert.match(text, /진행 중/)
})
