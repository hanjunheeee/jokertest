// AD-125 신고 화면 시험: 증거 없음 · 이미 처리됨(누가·언제) · 채널 구분, 목록 처리 전 먼저
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, within } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: ReportsPage } = await import("../../../src/admin/domains/reports/pages/ReportsPage.jsx")

test.afterEach(() => cleanup())

const REPORT = {
  id: 5,
  reporter: { uuid: "r-1", nickname: "신고자" },
  target: { uuid: "t-1", nickname: "나쁜가면" },
  gameId: "g-1",
  reasonCode: "ABUSE",
  memo: "욕함",
  status: "OPEN",
  createdAt: "2026-11-10T03:00:00.000Z",
  handledAt: null,
  handledBy: null,
}
const HISTORY = { bans: [], reportCount: 2 }

const openAt = async (path) => {
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null, React.createElement(Route, { path: "/reports/*", element: React.createElement(ReportsPage) }))))
  })
}

test("AD-125 목록: 처리 전부터 부르고 대상·사유 보임", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/reports?status=OPEN", 200, { ok: true, items: [REPORT], nextBefore: null })
  await openAt("/reports")
  assert.ok(screen.getByRole("cell", { name: "나쁜가면" }))
  assert.ok(screen.getByRole("cell", { name: "욕설" }))
  assert.equal(screen.getByRole("button", { name: "처리 전" }).getAttribute("aria-pressed"), "true")
})

test("AD-125 증거 없음 표시", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/reports/5", 200, { ok: true, report: REPORT, evidence: null, targetHistory: HISTORY })
  await openAt("/reports/5")
  assert.ok(screen.getByText(/증거 없음/))
  assert.ok(screen.getByText(/받은 신고 2건/))
})

test("AD-125 채널 구분: 채널 버튼으로 골라 보기", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  const evidence = {
    savedAt: "2026-11-10T03:05:00.000Z",
    messages: [
      { at: "2026-11-10T03:00:01.000Z", channel: "DAY", senderUuid: "t-1", nickname: "나쁜가면", text: "낮말" },
      { at: "2026-11-10T03:00:02.000Z", channel: "DEAD", senderUuid: "x", nickname: "유령", text: "죽은말" },
    ],
  }
  server.answer("GET /admin-api/reports/5", 200, { ok: true, report: REPORT, evidence, targetHistory: HISTORY })
  await openAt("/reports/5")
  const log = () => screen.getByRole("list", { name: "채팅 증거" })
  assert.equal(within(log()).getAllByRole("listitem").length, 2)
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "죽은 사람" })) })
  assert.equal(within(log()).getAllByRole("listitem").length, 1)
  assert.match(log().textContent, /죽은말/)
})

test("AD-125 이미 처리됨: 기각 눌렀는데 409면 누가·언제 안내 + 다시 불러옴", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  let handled = false
  server.answerWith("GET /admin-api/reports/5", () => ({
    status: 200,
    body: { ok: true, report: handled ? { ...REPORT, status: "RESOLVED", handledBy: "cto", handledAt: "2026-11-10T04:00:00.000Z" } : REPORT, evidence: null, targetHistory: HISTORY },
  }))
  server.answerWith("POST /admin-api/reports/5/dismiss", () => {
    handled = true
    return { status: 409, body: { ok: false, code: "REPORT_ALREADY_HANDLED", message: "x", handledBy: "cto", handledAt: "2026-11-10T04:00:00.000Z" } }
  })
  await openAt("/reports/5")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "기각" })) })
  const dialog = screen.getByRole("dialog")
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "기각" })) })

  assert.ok(screen.getByText("cto가 2026-11-10 13:00에 이미 처리했어요."))
  assert.equal(screen.queryByRole("dialog"), null)
  assert.equal(screen.queryByRole("button", { name: "정지" }), null)
})

test("정지: 사유 비면 버튼 꺼짐, 채우면 정지 요청 모양", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/reports/5", 200, { ok: true, report: REPORT, evidence: null, targetHistory: HISTORY })
  server.answer("POST /admin-api/reports/5/resolve", 200, { ok: true, report: { ...REPORT, status: "RESOLVED" }, ban: {}, disconnect: { disconnected: 1 } })
  await openAt("/reports/5")
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "정지" })) })
  const dialog = screen.getByRole("dialog")
  assert.equal(within(dialog).getByRole("button", { name: "정지" }).disabled, true)
  fireEvent.change(within(dialog).getByLabelText("정지 사유"), { target: { value: "욕설" } })
  fireEvent.change(within(dialog).getByLabelText("정지 일수"), { target: { value: "3" } })
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "정지" })) })

  const post = server.calls.find((call) => call.method === "POST")
  assert.deepEqual(JSON.parse(post.body), { ban: { kind: "PERIOD", days: 3, reason: "욕설" } })
  assert.ok(screen.getByText("정지하고 신고를 처리했어요."))
})
