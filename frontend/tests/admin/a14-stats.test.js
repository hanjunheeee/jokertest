// 관리자 통계 화면 시험: 날짜별 막대(빈 날은 0 막대), 92일 넘는 기간이면 조회 꺼짐 또는 기간 글
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-109~110, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-stats.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, render, screen, cleanup, type, press, settle, createFakeServer } from "./a14-kit.mjs"

const { default: StatsPage } = await import("../../src/admin/domains/stats/pages/StatsPage.jsx")

test.afterEach(() => cleanup())

// 처음 기간이 오늘 날짜로 정해져서 시계를 고정함 (2026-11-16 12:00 한국 시각 → 2026-11-03 ~ 2026-11-16)
const NOW = Date.parse("2026-11-16T03:00:00.000Z")
const FIRST = `GET /admin-api/stats?${new URLSearchParams({ from: "2026-11-03", to: "2026-11-16" })}`
const dayOf = (date, signups) => ({ date, signups, peakOnline: 0, games: 0, revenueKrw: 0, refundsKrw: 0 })

async function openPage(t, days) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW })
  const server = createFakeServer()
  server.answer(FIRST, 200, { ok: true, days })
  render(h(StatsPage))
  await settle()
  return server
}

test("A14-F-109 통계 막대: 날짜 3개 값 2·0·5 → 막대 3개, 빈 날 0", async (t) => {
  await openPage(t, [dayOf("2026-11-14", 2), dayOf("2026-11-15", 0), dayOf("2026-11-16", 5)])
  const chart = screen.getByRole("img", { name: "가입 수 날짜별 막대" })
  // 막대마다 [날짜, 값, 높이] → [['2026-11-14','2',…], …]
  const bars = [...chart.querySelectorAll("rect")].map((rect) => [rect.getAttribute("data-date"), rect.getAttribute("data-value"), Number(rect.getAttribute("height"))])
  assert.equal(bars.length, 3)
  assert.deepEqual(bars.map(([date, value]) => [date, value]), [["2026-11-14", "2"], ["2026-11-15", "0"], ["2026-11-16", "5"]])
  // 빈 날은 높이 0, 큰 값이 더 높음
  assert.equal(bars[1][2], 0)
  assert.ok(bars[2][2] > bars[0][2] && bars[0][2] > 0, "막대 높이가 값 차례와 다름")
})

test("A14-F-110 통계 막대: 92일 넘는 기간(2026-08-01 ~ 2026-11-16, 108일) → 조회 꺼짐 또는 기간 글", async (t) => {
  const server = await openPage(t, [dayOf("2026-11-16", 1)])
  // 서버는 92일 넘으면 400 INVALID_RANGE (백 A14 모양)
  server.answer(`GET /admin-api/stats?${new URLSearchParams({ from: "2026-08-01", to: "2026-11-16" })}`, 400, {
    ok: false, code: "INVALID_RANGE", message: "기간을 다시 골라 주세요. (하루~92일, 시작이 끝보다 앞)",
  })
  await type(screen.getByLabelText("시작 날짜"), "2026-08-01")
  const button = screen.getByRole("button", { name: "보기" })
  const blocked = button.disabled
  if (!blocked) {
    await press(button)
    await settle()
  }
  const told = /92일/.test(screen.queryByRole("alert")?.textContent ?? "")
  assert.ok(blocked || told, "기간이 길다는 막음·글이 없음")
})
