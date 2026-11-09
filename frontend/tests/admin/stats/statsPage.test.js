// AD-223 통계 화면 시험: 막대 값·빈 날 0·휴대폰 가로 넘침 없음 + 기간 바꾸면 다시 부름
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, act, fireEvent } = await import("@testing-library/react")
const { default: BarChart } = await import("../../../src/admin/domains/stats/components/BarChart.jsx")
const { default: StatsPage } = await import("../../../src/admin/domains/stats/pages/StatsPage.jsx")
const { defaultRange, kstDateOf } = await import("../../../src/admin/domains/stats/utils/kstDate.js")

test.afterEach(() => cleanup())

const DAYS = [
  { date: "2026-11-01", signups: 0, peakOnline: 4, games: 2, revenueKrw: 0, refundsKrw: 0 },
  { date: "2026-11-02", signups: 5, peakOnline: 8, games: 0, revenueKrw: 11000, refundsKrw: 2000 },
  { date: "2026-11-03", signups: 10, peakOnline: 2, games: 1, revenueKrw: 3300, refundsKrw: 0 },
]

const statsKey = ({ from, to }) => `GET /admin-api/stats?from=${from}&to=${to}`

test("AD-223 막대 높이: 전부 0이면 막대 0 (0으로 나누기 없음)", () => {
  render(React.createElement(BarChart, { title: "판", days: DAYS, valueKey: "refundsKrw" }))
  render(React.createElement(BarChart, { title: "빈 칸", days: DAYS.map((day) => ({ ...day, refundsKrw: 0 })), valueKey: "refundsKrw" }))
  const bars = [...screen.getByRole("img", { name: "빈 칸 날짜별 막대" }).querySelectorAll("rect")]
  assert.deepEqual(bars.map((bar) => bar.getAttribute("height")), ["0", "0", "0"])
})

test("AD-223 막대마다 날짜·값, 빈 날 0, 폭은 부모 폭(100%)", () => {
  render(React.createElement(BarChart, { title: "가입 수", days: DAYS, valueKey: "signups", unit: "명" }))
  const svg = screen.getByRole("img", { name: "가입 수 날짜별 막대" })
  assert.equal(svg.getAttribute("width"), "100%")
  assert.equal(svg.getAttribute("viewBox"), "0 0 30 120")
  const bars = [...svg.querySelectorAll("rect")]
  assert.deepEqual(bars.map((bar) => [bar.getAttribute("data-date"), bar.getAttribute("data-value"), bar.getAttribute("height")]), [
    ["2026-11-01", "0", "0"],
    ["2026-11-02", "5", "60"],
    ["2026-11-03", "10", "120"],
  ])
  assert.equal(bars[1].querySelector("title").textContent, "2026-11-02 5명")
  assert.match(screen.getByText(/합 15명/).textContent, /최고 10명/)
})

test("AD-223 화면: 기본 14일로 부르고 막대 넷 + 날짜별 숫자, 휴대폰은 카드(가로 넘침 없음)", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer(statsKey(defaultRange()), 200, { ok: true, days: DAYS })
  await act(async () => { render(React.createElement(StatsPage)) })

  assert.equal(server.calls.length, 1)
  const charts = screen.getAllByRole("img")
  assert.equal(charts.length, 4)
  for (const svg of charts) assert.equal(svg.getAttribute("width"), "100%")
  assert.equal(screen.queryByRole("table"), null)
  const cards = screen.getAllByRole("listitem")
  assert.equal(cards.length, 3)
  assert.match(cards[1].textContent, /매출11,000원/)
  assert.match(cards[1].textContent, /환불2,000원/)
})

test("AD-223 기간 바꿔 보기 → 그 기간으로 다시 부름, 92일 넘음은 서버 문구", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(statsKey(defaultRange()), 200, { ok: true, days: DAYS })
  server.answer(statsKey({ from: "2026-01-01", to: "2026-12-31" }), 400, {
    ok: false, code: "INVALID_RANGE", message: "기간을 다시 골라 주세요. (하루~92일, 시작이 끝보다 앞)", field: "to",
  })
  await act(async () => { render(React.createElement(StatsPage)) })
  fireEvent.change(screen.getByLabelText("시작 날짜"), { target: { value: "2026-01-01" } })
  fireEvent.change(screen.getByLabelText("끝 날짜"), { target: { value: "2026-12-31" } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "보기" })) })
  assert.equal(server.calls.length, 2)
  assert.match(screen.getByRole("alert").textContent, /하루~92일/)
})

test("AD-223 한국 날짜: UTC 15시 = 한국 다음날 0시, 기본 기간 14일", () => {
  assert.equal(kstDateOf(new Date("2026-11-09T14:59:00Z")), "2026-11-09")
  assert.equal(kstDateOf(new Date("2026-11-09T15:00:00Z")), "2026-11-10")
  assert.deepEqual(defaultRange(new Date("2026-11-10T03:00:00Z")), { from: "2026-10-28", to: "2026-11-10" })
})
