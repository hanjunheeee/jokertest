// 관리자 문의 답 시험: 답 빈 칸이면 보내기 꺼짐, 두 번 눌러도 요청 하나
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-100~101, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-inquiries.test.js
import test from "node:test"
import assert from "node:assert/strict"
import { h, screen, cleanup, act, fireEvent, openAt, type, press, settle, buttonNamed, callsOf, createFakeServer } from "./a14-kit.mjs"

const { default: InquiriesPage } = await import("../../src/admin/domains/inquiries/pages/InquiriesPage.jsx")

test.afterEach(() => cleanup())

const REPLY = "/admin-api/inquiries/7/replies"

// 문의 7번 화면 열기 (답 아직 없음)
async function openInquiry() {
  const server = createFakeServer()
  server.answer("GET /admin-api/inquiries/7", 200, {
    ok: true,
    inquiry: { id: 7, category: "BUG", title: "판이 안 끝나요", body: "밤에 멈췄어요.", status: "OPEN", createdAt: "2026-11-16T03:00:00.000Z", answeredAt: null },
    user: { uuid: "a14f0000-0000-4000-8000-0000000000cc", nickname: "가면문의" },
    replies: [],
  })
  server.answer(`POST ${REPLY}`, 200, {
    ok: true, reply: { id: 1, body: "확인했어요.", createdAt: "2026-11-16T03:10:00.000Z" },
    inquiry: { id: 7, status: "ANSWERED", answeredAt: "2026-11-16T03:10:00.000Z" }, notified: true,
  })
  await openAt("/inquiries/7", h(InquiriesPage), "/inquiries/*")
  return server
}
const sendButton = () => buttonNamed("답 보내기")

test("A14-F-100 문의 답: 답 빈 칸 → \"답 보내기\" 꺼짐", async () => {
  const server = await openInquiry()
  assert.equal(sendButton().disabled, true)
  await type(screen.getByLabelText("답"), "   ")
  assert.equal(sendButton().disabled, true)
  await press(sendButton())
  assert.equal(callsOf(server, "POST", REPLY).length, 0)
  await type(screen.getByLabelText("답"), "확인했어요.")
  assert.equal(sendButton().disabled, false)
})

test("A14-F-101 문의 답: 두 번 눌러도 요청 하나", async () => {
  const server = await openInquiry()
  await type(screen.getByLabelText("답"), "확인했어요.")
  const button = sendButton()
  // 다시 그리기 전에 두 번 누름
  await act(async () => {
    fireEvent.click(button)
    fireEvent.click(button)
  })
  await settle()
  const sent = callsOf(server, "POST", REPLY)
  assert.equal(sent.length, 1)
  assert.equal(JSON.parse(sent[0].body).body, "확인했어요.")
})
