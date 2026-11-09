// AD-114 운영 현황 화면 시험: 숫자 카드, 게임 서버 숫자 못 받으면 그 칸만 "지금 숫자 못 받음", 30초 새로고침은 백그라운드 머리글
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, act } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: DashboardPage, REFRESH_MS } = await import("../../../src/admin/domains/dashboard/pages/DashboardPage.jsx")

test.afterEach(() => cleanup())

const KEY = "GET /admin-api/dashboard"
const FULL = {
  ok: true,
  totalMembers: 12345,
  todayGames: { finished: 7, inProgress: 3, total: 10 },
  inProgressGames: 3,
  onlineCount: 42,
  openReports: 2,
  openInquiries: 0,
  maintenance: { enabled: false, active: false, startsAt: null },
}
const NO_LIVE = {
  ...FULL,
  todayGames: { finished: 7, inProgress: null, total: null },
  inProgressGames: null,
  onlineCount: null,
  liveError: "LIVE_UNAVAILABLE",
}

const open = async () => {
  await act(async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(DashboardPage)))
  })
}
// 카드 제목 → 그 카드 글자 전부
const cardText = (title) => screen.getByRole("heading", { name: title }).parentElement.textContent

test("AD-114 숫자 카드: 가입자·오늘 총 판(끝난·진행 중)·진행 중·접속·새 신고·새 문의·점검", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(KEY, 200, FULL)
  await open()

  assert.ok(screen.getByRole("heading", { name: "운영 현황" }))
  assert.match(cardText("전체 가입자"), /12,345명/)
  assert.match(cardText("오늘 총 판 수"), /10판/)
  assert.match(cardText("오늘 총 판 수"), /끝난 판 7 · 진행 중 3/)
  assert.match(cardText("지금 진행 중 판"), /3판/)
  assert.match(cardText("지금 접속"), /42명/)
  assert.match(cardText("새 신고"), /2건/)
  assert.match(cardText("새 문의"), /0건/)
  assert.match(cardText("점검"), /꺼짐/)
  assert.equal(screen.queryByText("지금 숫자 못 받음"), null)
  // 새 신고는 신고 목록으로 가는 길
  assert.equal(screen.getByRole("heading", { name: "새 신고" }).closest("a").getAttribute("href"), "/reports")
})

test("AD-114 게임 서버 숫자 못 받음 → 그 칸만 '지금 숫자 못 받음', 0이나 다른 글귀 없음, 나머지 숫자 그대로", async () => {
  const server = createFakeServer()
  server.answer(KEY, 200, NO_LIVE)
  await open()

  assert.match(cardText("지금 진행 중 판"), /지금 숫자 못 받음/)
  assert.match(cardText("지금 접속"), /지금 숫자 못 받음/)
  assert.match(cardText("오늘 총 판 수"), /지금 숫자 못 받음/)
  assert.doesNotMatch(cardText("지금 진행 중 판"), /0|준비 중/)
  assert.match(cardText("전체 가입자"), /12,345명/)
  assert.match(cardText("새 신고"), /2건/)
  assert.equal(screen.queryByRole("alert"), null)
})

test("AD-114 30초마다 다시 읽음: 처음은 보통 요청, 새로고침은 X-Admin-Background: 1", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] })
  const server = createFakeServer()
  server.answer(KEY, 200, FULL)
  await open()
  assert.equal(server.calls.length, 1)
  assert.equal(server.calls[0].headers["X-Admin-Background"], undefined)

  server.answer(KEY, 200, { ...FULL, openReports: 5 })
  await act(async () => { t.mock.timers.tick(REFRESH_MS) })
  assert.equal(server.calls.length, 2)
  assert.equal(server.calls[1].headers["X-Admin-Background"], "1")
  assert.match(cardText("새 신고"), /5건/)
})

test("AD-114 새로고침 실패 → 마지막 숫자 그대로 + 한 줄 안내", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] })
  const server = createFakeServer()
  server.answer(KEY, 200, FULL)
  await open()
  server.answer(KEY, 503, { ok: false, code: "ADMIN_BUSY", message: "x" })
  await act(async () => { t.mock.timers.tick(REFRESH_MS) })
  assert.match(screen.getByRole("alert").textContent, /새로 읽지 못했어요/)
  assert.match(cardText("전체 가입자"), /12,345명/)
})

test("AD-114 처음부터 실패 → 오류 안내 + 다시 불러오기", async () => {
  const server = createFakeServer()
  server.answer(KEY, 503, { ok: false, code: "ADMIN_QUERY_TIMEOUT", message: "x" })
  await open()
  assert.match(screen.getByRole("alert").textContent, /조회가 오래 걸려 멈췄어요/)
  assert.ok(screen.getByRole("button", { name: "다시 불러오기" }))
})

test("AD-114 Node 일부만 못 받음 → 받은 숫자 + 어느 서버인지 한 줄", async () => {
  const server = createFakeServer()
  server.answer(KEY, 200, { ...FULL, live: { partial: true, nodes: [{ node: "n1", ok: true }, { node: "n2", ok: false, code: "RPC_TIMEOUT" }] } })
  await open()
  assert.ok(screen.getByText(/n2 서버 숫자를 못 받아/))
  assert.match(cardText("지금 접속"), /42명/)
})
