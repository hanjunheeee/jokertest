// 관리자 운영 현황 화면 시험: 게임 서버 숫자 못 받으면 그 칸만 "지금 숫자 못 받음", 30초마다 백그라운드 머리글로 다시 부름
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-107~108, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-dashboard.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, cleanup, act, openAt, settle, callsOf, createFakeServer } from "./a14-kit.mjs"

const { default: DashboardPage } = await import("../../src/admin/domains/dashboard/pages/DashboardPage.jsx")

test.afterEach(() => cleanup())

const PATH = "/admin-api/dashboard"
const summaryOf = (over = {}) => ({
  ok: true, totalMembers: 1234, todayGames: { finished: 7, inProgress: 3, total: 10 }, inProgressGames: 3, onlineCount: 25,
  openReports: 2, openInquiries: 1, maintenance: { enabled: false, active: false, startsAt: null }, ...over,
})

// 카드 제목 → 큰 숫자 글 (예: { '전체 가입자': '1,234명', … })
const cards = () => Object.fromEntries([...document.querySelectorAll("li h2")].map((title) => [title.textContent, title.nextElementSibling.textContent]))

test("A14-F-107 운영 현황 못 받음: liveError:'LIVE_UNAVAILABLE' → 그 칸만 \"지금 숫자 못 받음\", 가입자 수 등 나머지 숫자 그대로", async () => {
  const server = createFakeServer()
  server.answer(`GET ${PATH}`, 200, summaryOf({
    todayGames: { finished: 7, inProgress: null, total: null }, inProgressGames: null, onlineCount: null, liveError: "LIVE_UNAVAILABLE",
  }))
  await openAt("/dashboard", h(DashboardPage))
  const shown = cards()
  assert.equal(shown["지금 진행 중 판"], "지금 숫자 못 받음")
  assert.equal(shown["지금 접속"], "지금 숫자 못 받음")
  assert.equal(shown["전체 가입자"], "1,234명")
  assert.equal(shown["새 신고"], "2건")
  assert.equal(shown["새 문의"], "1건")
})

test("A14-F-108 운영 현황 30초 새로고침: 30초 뒤 다시 부름 → 백그라운드 머리글", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] })
  const server = createFakeServer()
  server.answer(`GET ${PATH}`, 200, summaryOf())
  try {
    await openAt("/dashboard", h(DashboardPage))
    assert.equal(callsOf(server, "GET", PATH).length, 1)
    // 29.999초엔 아직
    await act(async () => { t.mock.timers.tick(29_999) })
    await settle()
    assert.equal(callsOf(server, "GET", PATH).length, 1)
    await act(async () => { t.mock.timers.tick(1) })
    await settle()
    const calls = callsOf(server, "GET", PATH)
    assert.equal(calls.length, 2)
    // 처음 부름은 보통, 30초 부름은 백그라운드
    assert.equal(calls[0].headers["X-Admin-Background"], undefined)
    assert.equal(calls[1].headers["X-Admin-Background"], "1")
  } finally {
    cleanup()
    t.mock.timers.reset()
  }
})
