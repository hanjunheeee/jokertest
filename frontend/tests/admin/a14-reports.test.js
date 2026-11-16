// 관리자 신고 상세 화면 시험: 증거 없음 글, 다른 관리자가 먼저 처리했으면 "이미 처리됨"(누가·언제), 증거 채널마다 구분 표시
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-088~090, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-reports.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, screen, within, cleanup, openAt, press, settle, dialog, bodyText, createFakeServer } from "./a14-kit.mjs"

const { default: ReportsPage } = await import("../../src/admin/domains/reports/pages/ReportsPage.jsx")

test.afterEach(() => cleanup())

const TARGET = { uuid: "a14f0000-0000-4000-8000-0000000000aa", nickname: "가면대상" }
// 신고 상세 답 (서버 /reports/:id 모양)
const detailOf = (evidence) => ({
  ok: true,
  report: {
    id: 5, reporter: { uuid: "a14f0000-0000-4000-8000-0000000000bb", nickname: "가면신고" }, target: TARGET, gameId: "a14-game-1",
    reasonCode: "ABUSE", memo: null, status: "OPEN", createdAt: "2026-11-16T03:00:00.000Z", handledAt: null, handledBy: null,
  },
  evidence,
  targetHistory: { bans: [], reportCount: 1 },
})

async function openReport(evidence) {
  const server = createFakeServer()
  server.answer("GET /admin-api/reports/5", 200, detailOf(evidence))
  await openAt("/reports/5", h(ReportsPage), "/reports/*")
  return server
}

test("A14-F-088 신고 상세: 증거 null → \"증거 없음\"", async () => {
  await openReport(null)
  assert.match(bodyText(), /증거 없음/)
  assert.equal(document.querySelectorAll('[aria-label="채팅 증거"] li').length, 0)
})

test("A14-F-089 신고 상세: 409 REPORT_ALREADY_HANDLED → \"이미 처리됨\" + 누가·언제", async () => {
  const server = await openReport(null)
  server.answer("POST /admin-api/reports/5/dismiss", 409, {
    ok: false, code: "REPORT_ALREADY_HANDLED", message: "다른 관리자가 이미 처리한 신고예요.",
    handledBy: "ops2", handledAt: "2026-11-16T03:30:00.000Z",
  })
  await press(screen.getByRole("button", { name: "기각" }))
  await press(within(dialog()).getByRole("button", { name: "기각" }))
  await settle()
  const note = screen.getAllByRole("status").map((el) => el.textContent).find((text) => text.includes("이미 처리")) ?? ""
  assert.ok(note !== "", "이미 처리됨 글이 없음")
  assert.ok(note.includes("ops2"), `누가 없음: ${note}`)
  // 언제: 한국 시각 12:30
  assert.ok(note.includes("2026-11-16 12:30"), `언제 없음: ${note}`)
})

test("A14-F-090 신고 상세: 증거 채널(낮·밤 같은 직업·죽은 사람)마다 구분 표시", async () => {
  const message = (i, channel) => ({ at: `2026-11-16T03:00:0${i}.000Z`, channel, senderUuid: `s${i}`, nickname: `닉${i}`, text: `말${i}` })
  await openReport({ savedAt: "2026-11-16T03:01:00.000Z", messages: [message(1, "DAY"), message(2, "JOKER"), message(3, "DEAD")] })
  const lines = [...document.querySelectorAll('[aria-label="채팅 증거"] li')].map((li) => li.textContent)
  assert.equal(lines.length, 3)
  // 줄마다 붙은 채널 표시 → 셋 다 다름
  const tags = lines.map((line) => /\[([^\]]+)\]/.exec(line)?.[1] ?? "")
  assert.equal(new Set(tags).size, 3, `채널 표시가 안 갈림: ${tags.join(", ")}`)
  assert.ok(tags.every((tag) => tag !== "" && tag !== "알 수 없음"), `채널 표시 없음: ${tags.join(", ")}`)
  // 채널 고르기 단추: 전부 + 채널 3개
  const group = screen.getByRole("group", { name: "채널 고르기" })
  assert.equal(within(group).getAllByRole("button").length, 4)
})
