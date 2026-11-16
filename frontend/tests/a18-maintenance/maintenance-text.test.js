// 화면 상태 시험: 점검 안내 글 만드는 함수 — 다시 크게 띄울 단계(10분·1분 전), 남은 시간 글, 한국 시각 글, 전적 끝 이유 글
// 목록 A18-F-001~009·020~021 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --experimental-test-module-mocks --test tests/a18-maintenance/maintenance-text.test.js
import test from "node:test"
import assert from "node:assert/strict"

const { stageOf, formatRemaining, formatClock, describeWinReason } = await import("../../src/domains/maintenance/utils/maintenanceText.js")

const MIN = 60 * 1000

const STAGES = [
  ["A18-F-001", "15분", 15 * MIN, 0],
  ["A18-F-002", "10분 딱", 10 * MIN, 1],
  ["A18-F-003", "9분", 9 * MIN, 1],
  ["A18-F-004", "1분 딱", 1 * MIN, 2],
  ["A18-F-005", "30초", 30 * 1000, 2],
]
for (const [no, label, ms, stage] of STAGES) {
  test(`${no} 시작까지 ${label} → 단계 ${stage}`, () => {
    assert.equal(stageOf(ms), stage)
  })
}

const REMAINING = [
  ["A18-F-006", 3_723_000, "1시간 02분 03초"],
  ["A18-F-007", 125_000, "2분 05초"],
  ["A18-F-008", 9_000, "9초"],
]
for (const [no, ms, text] of REMAINING) {
  test(`${no} 남은 ${ms}ms → "${text}"`, () => {
    assert.equal(formatRemaining(ms), text)
  })
}

test("A18-F-009 2026-11-10T06:00:00Z, 기기 시간대 미국 → \"11월 10일 오후 3:00\"", (t) => {
  const before = process.env.TZ
  process.env.TZ = "America/New_York"
  t.after(() => { if (before === undefined) delete process.env.TZ; else process.env.TZ = before })
  // 기기 시간대가 정말 미국으로 바뀌었는지 먼저 봄 (그래야 한국 시각 고정이 뜻이 있음)
  assert.notEqual(new Date(Date.parse("2026-11-10T06:00:00Z")).getHours(), 15)
  assert.equal(formatClock(Date.parse("2026-11-10T06:00:00Z")), "11월 10일 오후 3:00")
})

test("A18-F-020 전적 끝 이유 MAINTENANCE → \"점검으로 끝남\"", () => {
  assert.equal(describeWinReason("MAINTENANCE"), "점검으로 끝남")
})

test("A18-F-021 전적 끝 이유 JOKER_WIN → 글 없음", () => {
  assert.equal(describeWinReason("JOKER_WIN"), null)
})
