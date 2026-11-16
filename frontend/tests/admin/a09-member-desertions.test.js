// 관리자 회원 상세 "탈주 기록" 칸 시험(화면 부품, 가짜 관리자 서버): 이유 글·상태 글·한국 시각·빈 글·받은 차례·표 이름·자정 넘는 막힘 끝·판 id·읽기 실패·칸 자리
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-F-253~267, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a09-member-desertions.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { createFakeServer } from "./helpers/adminDom.mjs"

const React = await import("react")
const { render, cleanup, act } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: MemberDetailPage } = await import("../../src/admin/domains/members/pages/MemberDetailPage.jsx")

const h = React.createElement
const UUID = "a09a0000-0000-4000-8000-000000000001"
const DETAIL = `GET /admin-api/members/${UUID}`

test.afterEach(() => cleanup())

// 서버 상세 답 (backend admin/services/members/detail.js 모양), desertions만 바꿈
const detailOf = (desertions) => ({
  ok: true,
  member: {
    uuid: UUID, nickname: "탈주시험", emailMasked: "a***@example.com", status: "ACTIVE", role: "USER",
    online: false, onlineNode: null, withdrawn: false,
    createdAt: "2026-11-01T00:00:00.000Z", lastLoginAt: "2026-11-15T00:00:00.000Z",
  },
  bans: [],
  reportsReceived: [],
  logins: [],
  desertions,
})

// 탈주 한 줄 (서버 desertionViewOf 모양)
let rowSeq = 0
const desertion = (over = {}) => {
  rowSeq += 1
  return {
    id: rowSeq,
    gameId: `a09-admin-game-${rowSeq}`,
    reason: "LEFT_ALIVE",
    desertedAt: "2026-11-15T03:00:00.000Z",
    blockedUntil: "2026-11-15T03:05:00.000Z",
    active: false,
    ...over,
  }
}

// 가짜 서버 답이 화면에 닿게 흘려 보냄
async function settle(times = 10) {
  await act(async () => {
    for (let i = 0; i < times; i += 1) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

// 회원 상세 화면 열기 (지갑 칸은 빈 지갑으로 답)
async function openDetail({ desertions = [], status = 200, body = null } = {}) {
  const server = createFakeServer()
  server.answer(DETAIL, status, body ?? detailOf(desertions))
  server.answer(`GET /admin-api/members/${UUID}/wallet`, 200, { ok: true, gold: 0, diamond: 0, ledger: [] })
  render(h(MemoryRouter, { initialEntries: [`/members/${UUID}`] },
    h(Routes, null, h(Route, { path: "/members/:uuid", element: h(MemberDetailPage) }))))
  await settle()
  return server
}

// "탈주 기록" 표 (없으면 null)
const desertionTable = () => [...document.querySelectorAll("caption")].find((c) => c.textContent === "탈주 기록")?.closest("table") ?? null
// 표 줄마다 칸 글 → [["2026-11-15 12:00", "산 채로 나감", …], …]
const rowTexts = () => [...(desertionTable()?.querySelectorAll("tbody tr") ?? [])].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent))
// 칸 차례: 탈주 시각·이유·참여 막힘 끝·상태·판
const COL = { at: 0, reason: 1, until: 2, state: 3, game: 4 }

// 이유 글 (값 3)
const REASONS = [
  ["A09-F-253", "LEFT_ALIVE", "산 채로 나감"],
  ["A09-F-254", "DISCONNECT_TIMEOUT", "끊긴 뒤 1분 안에 못 돌아옴"],
  ["A09-F-255", "SOMETHING_NEW", "SOMETHING_NEW"],
]
for (const [id, reason, text] of REASONS) {
  test(`${id} 탈주 이유 ${reason} → "${text}"${reason === "SOMETHING_NEW" ? " (모르는 값은 그대로) [지금 동작]" : ""}`, async () => {
    await openDetail({ desertions: [desertion({ reason })] })
    assert.equal(rowTexts()[0]?.[COL.reason], text)
  })
}

// 상태 글 (값 2)
for (const [id, active, text] of [["A09-F-256", true, "막힘 중"], ["A09-F-257", false, "끝남"]]) {
  test(`${id} active ${active} → 상태 "${text}"`, async () => {
    await openDetail({ desertions: [desertion({ active })] })
    assert.equal(rowTexts()[0]?.[COL.state], text)
  })
}

// 한국 시간 (값 2): 세계 표준시 14:59:59 → 한국 그날 23:59, 15:00:00 → 다음 날 00:00 (화면은 분까지만 보임)
const KST_CASES = [
  ["A09-F-258", "2026-11-15T14:59:59.000Z", "2026-11-15 23:59"],
  ["A09-F-259", "2026-11-15T15:00:00.000Z", "2026-11-16 00:00"],
]
for (const [id, desertedAt, shown] of KST_CASES) {
  test(`${id} 탈주 시각 ${desertedAt} → 한국 시각 "${shown}"`, async () => {
    await openDetail({ desertions: [desertion({ desertedAt, blockedUntil: "2026-11-16T16:00:00.000Z" })] })
    assert.equal(rowTexts()[0]?.[COL.at], shown)
  })
}

test("A09-F-260 desertions [] → \"탈주 기록이 없어요.\"", async () => {
  await openDetail({ desertions: [] })
  assert.ok(document.body.textContent.includes("탈주 기록이 없어요."))
  assert.ok(desertionTable() === null, "빈 목록인데 표가 그려짐")
})

test("A09-F-261 탈주 3줄 → 화면 줄 차례 = 받은 차례(최근 먼저)", async () => {
  const rows = [
    desertion({ desertedAt: "2026-11-15T05:00:00.000Z" }),
    desertion({ desertedAt: "2026-11-15T04:00:00.000Z" }),
    desertion({ desertedAt: "2026-11-15T03:00:00.000Z" }),
  ]
  await openDetail({ desertions: rows })
  assert.deepEqual(rowTexts().map((cells) => cells[COL.game]), rows.map((r) => r.gameId))
})

test("A09-F-262 표 제목 \"탈주 기록\", 칸 이름 탈주 시각·이유·참여 막힘 끝·상태·판", async () => {
  await openDetail({ desertions: [desertion()] })
  const table = desertionTable()
  assert.ok(table !== null, "caption \"탈주 기록\" 표 없음")
  const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent)
  assert.deepEqual(headers, ["탈주 시각", "이유", "참여 막힘 끝", "상태", "판"])
  for (const th of table.querySelectorAll("thead th")) assert.equal(th.getAttribute("scope"), "col")
})

test("A09-F-263 한국 23:50 탈주·막힘 끝 다음 날 23:50 → 두 날짜가 따로 보임", async () => {
  await openDetail({ desertions: [desertion({ desertedAt: "2026-11-15T14:50:00.000Z", blockedUntil: "2026-11-16T14:50:00.000Z", active: true })] })
  const [cells] = rowTexts()
  assert.equal(cells[COL.at], "2026-11-15 23:50")
  assert.equal(cells[COL.until], "2026-11-16 23:50")
})

test("A09-F-264 긴 판 id → 한 칸에 그대로", async () => {
  const gameId = "game-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0-a09-very-long"
  await openDetail({ desertions: [desertion({ gameId })] })
  const [cells] = rowTexts()
  assert.equal(cells[COL.game], gameId)
  assert.equal(cells.length, 5)
})

test("A09-F-265 상세 요청 500 → 오류 글, 탈주 칸 안 그림 [지금 동작]", async () => {
  await openDetail({ status: 500, body: { ok: false, code: "INTERNAL_ERROR", message: "서버 오류" } })
  assert.ok(desertionTable() === null)
  assert.equal(document.body.textContent.includes("탈주 기록"), false)
  assert.ok(document.querySelector(".text-danger") !== null, "오류 글 없음")
  assert.ok([...document.querySelectorAll("button")].some((b) => b.textContent.includes("다시")), "다시 단추 없음")
})

test("A09-F-266 상세 화면에 \"탈주 기록\" 칸이 정지·신고·로그인 칸과 함께 있음", async () => {
  await openDetail({ desertions: [desertion()] })
  const headings = [...document.querySelectorAll("h2")].map((el) => el.textContent)
  for (const name of ["정지 기록", "받은 신고", "탈주 기록", "최근 로그인"]) assert.ok(headings.includes(name), `${name} 칸 없음: ${headings.join(",")}`)
})

test("A09-F-267 막힘 중 줄과 끝난 줄 섞임 → 줄마다 상태 글 맞음", async () => {
  await openDetail({ desertions: [desertion({ active: true }), desertion({ active: false })] })
  assert.deepEqual(rowTexts().map((cells) => cells[COL.state]), ["막힘 중", "끝남"])
})
