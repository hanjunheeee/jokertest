// 재판 마감 당김·시간 바 상태 시험: 다 내면 마감이 5초 뒤로 당겨지고 "[5초 뒤 마감]", 시간 바 마감은 지금 단계 마감
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-F-056~065, A04-F-105~110
import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { openTable, resetTable, RTL, React, useFakeClock, InGameActionProvider, InGamePlayerSessionProvider, InGameChatSessionProvider } from "./tribunalTable.mjs"

const { selectInGameTimebarStatusLabel } = await import("../../src/domains/game/ingame/utils/selectInGameTimebarStatusMessage.js")
const { selectInGameTimebarPhaseDeadline } = await import("../../src/domains/game/ingame/utils/timebar/phaseDeadline.js")
const { computeInGameNightTurnRemainingSec } = await import("../../src/domains/game/ingame/utils/selectInGameNightTurnDeadline.js")
const { formatInGameTimebarClock } = await import("../../src/domains/game/ingame/utils/timebar/format.js")
const { default: InGamePhaseActionRow } = await import("../../src/domains/game/ingame/components/timebar/InGamePhaseActionRow.jsx")

test.afterEach(resetTable)

const SETTLE_TEXT = "[5초 뒤 마감]"

// 시간 바가 보는 마감·남은 시간 글 (인게임 화면이 쓰는 고르개·셈 그대로)
const barDeadline = (t) => selectInGameTimebarPhaseDeadline(t.state())
const barClock = (t) => formatInGameTimebarClock(computeInGameNightTurnRemainingSec(barDeadline(t), Date.now()))
const barLabel = (t) => selectInGameTimebarStatusLabel(t.state())

// 재판 중인 판 (나는 1번 자리 시민)
async function tribunalTable(n, options = {}) {
  const t = await openTable({ n, view: options.view ?? "none" })
  await t.openTribunal(3, { seconds: options.seconds ?? 60 })
  return t
}

test("A04-F-056 6명 판: phase_settle_started TRIBUNAL·같은 날 → tribunalDeadline = 받은 deadline", async () => {
  const t = await tribunalTable(6)
  const payload = await t.settle()
  assert.equal(t.state().tribunalDeadline, payload.deadline)
})

test("A04-F-057 6명 판: 마감 당김 반영 뒤 시간 바 상태 글 \"[5초 뒤 마감]\"", async () => {
  const t = await tribunalTable(6)
  assert.notEqual(barLabel(t), SETTLE_TEXT)
  await t.settle()
  assert.equal(barLabel(t), SETTLE_TEXT)
})

test("A04-F-058 7명 판: 재판 중 phase NIGHT 당김 알림은 재판 마감을 안 바꿈", async () => {
  const t = await tribunalTable(7)
  const before = t.state().tribunalDeadline
  await t.say("phase_settle_started", { ...t.settlePayload({ phase: "NIGHT" }), role: "JOKER" })
  assert.equal(t.state().tribunalDeadline, before)
  assert.notEqual(barLabel(t), SETTLE_TEXT)
})

test("A04-F-059 [지금 동작] 8명 판: 2일 재판 중 dayIndex 1 당김 알림은 무시", async () => {
  const t = await openTable({ n: 8 })
  await t.openTribunal(3)
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  const before = t.state()
  await t.say("phase_settle_started", t.settlePayload({ dayIndex: 1 }))
  assert.equal(t.state(), before)
})

test("A04-F-060 [지금 동작] 5명 판: 다른 gameId 당김 알림은 무시", async () => {
  const t = await tribunalTable(5)
  const before = t.state()
  await t.say("phase_settle_started", t.settlePayload({ gameId: "a04-other-game" }))
  assert.equal(t.state(), before)
})

test("A04-F-061 6명 판: 당긴 tribunalDeadline이 실린 스냅샷으로 새로고침 → 남은 시간 5초 이하", async () => {
  useFakeClock()
  const t = await tribunalTable(6, { seconds: 120 })
  await t.settle()
  await t.reload()
  assert.equal(t.state().phase, "TRIBUNAL")
  const remaining = computeInGameNightTurnRemainingSec(barDeadline(t), Date.now())
  assert.ok(remaining <= 5, `남은 시간 ${remaining}초`)
})

test("A04-F-062 7명 판: 당김 뒤 재판이 끝나 밤이 되면 \"[5초 뒤 마감]\" 사라짐", async () => {
  const t = await tribunalTable(7)
  await t.settle()
  assert.equal(barLabel(t), SETTLE_TEXT)
  await t.resolve("NOT_GUILTY")
  assert.equal(t.state().phase, "NIGHT")
  assert.notEqual(barLabel(t), SETTLE_TEXT)
})

test("A04-F-063 8명 판: 1일 당김 → 2일 재판 진입 → 시간 바 글에 \"[5초 뒤 마감]\" 없음", async () => {
  const t = await tribunalTable(8)
  await t.settle()
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  await t.openTribunal(4)
  assert.equal(t.state().dayIndex, 2)
  assert.notEqual(barLabel(t), SETTLE_TEXT)
  assert.equal(barLabel(t), "[재판-진행 중]")
})

test("A04-F-064 6명 판: 모바일 위 단계 줄 — 2일 재판 당김 → \"제 2일 · 5초 뒤 마감 0:04\" 꼴", () => {
  // 모바일 화면은 길 풀기가 달라 따로 띄운 node에서 그림 (mobileChild.mjs)
  const child = fileURLToPath(new URL("./mobileChild.mjs", import.meta.url))
  const out = execFileSync(process.execPath, [child, "phase-line"], { encoding: "utf8", timeout: 60_000 })
  const line = JSON.parse(out.trim().split("\n").at(-1))
  assert.match(line.text, /제 2일\s*·\s*5초 뒤 마감\s*0:04/)
})

test("A04-F-065 10명 판: 마감 = 지금+5초 → 남은 시간 0:05", async () => {
  useFakeClock()
  const t = await tribunalTable(10)
  await t.settle()
  assert.ok(barClock(t).includes("0:05"), `시간 바 글 ${barClock(t)}`)
})

test("A04-F-105 6명 판: 재판 중 시간 바 마감 시각 = tribunalDeadline", async () => {
  const t = await tribunalTable(6)
  assert.ok(t.state().tribunalDeadline > 0)
  assert.equal(barDeadline(t), t.state().tribunalDeadline)
})

test("A04-F-106 5명 판: 재판 15초 진입 직후 → 0:15", async () => {
  useFakeClock()
  const t = await tribunalTable(5, { seconds: 15 })
  assert.ok(barClock(t).includes("0:15"), `시간 바 글 ${barClock(t)}`)
})

test("A04-F-107 10명 판: 재판 120초 진입 직후 → 2:00", async () => {
  useFakeClock()
  const t = await tribunalTable(10, { seconds: 120 })
  assert.ok(barClock(t).includes("2:00"), `시간 바 글 ${barClock(t)}`)
})

test("A04-F-108 7명 판: 재판 결과 → 밤 차례 알림이면 시간 바 마감 = 밤 차례 마감", async () => {
  const t = await tribunalTable(7)
  await t.resolve("NOT_GUILTY")
  const turn = await t.nightTurn("JOKER")
  assert.equal(barDeadline(t), turn.deadline)
})

test("A04-F-109 8명 판: 2일 재판 진입 → 시간 바 마감 = 2일 tribunalDeadline", async () => {
  const t = await tribunalTable(8, { seconds: 60 })
  await t.resolve("NOT_GUILTY")
  await t.nextDay()
  const entry = await t.openTribunal(4, { seconds: 90 })
  assert.equal(barDeadline(t), entry.tribunalDeadline)
})

test("A04-F-110 6명 판: 재판 단계 시간 바 행동 줄에 \"재판 판정\"·\"낮 집계\"·\"밤 종료\" 없음", async () => {
  const h = React.createElement
  const t = await openTable({
    n: 6,
    view: () => h(InGamePlayerSessionProvider, null, h(InGameChatSessionProvider, null, h(InGameActionProvider, null, h(InGamePhaseActionRow)))),
  })
  await t.openTribunal(3)
  for (const name of ["재판 판정", "낮 집계", "밤 종료"]) {
    assert.equal(RTL.screen.queryByRole("button", { name }), null, `${name} 단추가 있음`)
  }
  // 재판 단계 행동 줄엔 단추가 하나도 없음
  assert.deepEqual(RTL.screen.queryAllByRole("button").map((b) => b.textContent), [])
})
