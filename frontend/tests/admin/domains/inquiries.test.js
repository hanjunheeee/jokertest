// AD-284 관리자 문의 화면 시험: 답 빈 칸이면 못 보냄, 두 번 눌러도 요청 하나, 보낸 뒤 알림 결과·새 번호, 목록 상태 거르기
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, waitFor } = await import("@testing-library/react")
const { MemoryRouter, Routes, Route } = await import("react-router-dom")
const { default: InquiriesPage } = await import("../../../src/admin/domains/inquiries/pages/InquiriesPage.jsx")

test.afterEach(() => cleanup())

const UUID = "11111111-1111-4111-8111-111111111111"
const DETAIL = {
  ok: true,
  inquiry: { id: 5, category: "BUG", title: "방이 안 열려요", body: "방 만들기 누르면 멈춤", status: "OPEN", createdAt: "2026-11-10T03:00:00.000Z", answeredAt: null },
  user: { uuid: UUID, nickname: "가면1" },
  replies: [],
}
const REPLY_OK = (notified = true) => ({
  ok: true,
  reply: { id: 9, admin: { loginId: "ceo" }, body: "고쳤어요", createdAt: "2026-11-10T04:00:00.000Z" },
  inquiry: { id: 5, status: "ANSWERED", answeredAt: "2026-11-10T04:00:00.000Z" },
  notified,
})

// 앱처럼 /inquiries/* 아래 붙여 그림
const draw = (path) => render(React.createElement(MemoryRouter, { initialEntries: [`/inquiries${path}`] },
  React.createElement(Routes, null,
    React.createElement(Route, { path: "/inquiries/*", element: React.createElement(InquiriesPage) }))))
const posts = (server) => server.calls.filter((call) => call.method === "POST")
const sendButton = () => screen.getByRole("button", { name: "답 보내기" })

test("AD-284 답 칸이 비거나 빈칸뿐이면 보내기 꺼짐", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/inquiries/5", 200, DETAIL)
  draw("/5")
  await screen.findByRole("heading", { name: "방이 안 열려요" })
  assert.match(document.body.textContent, /방 만들기 누르면 멈춤/)
  assert.match(document.body.textContent, /가면1/)
  assert.equal(sendButton().disabled, true)
  fireEvent.change(screen.getByLabelText("답"), { target: { value: "   " } })
  assert.equal(sendButton().disabled, true)
  fireEvent.change(screen.getByLabelText("답"), { target: { value: "고쳤어요" } })
  assert.equal(sendButton().disabled, false)
})

test("AD-284 두 번 눌러도 요청 하나, 보낸 뒤 칸 비우고 알림 보냄 표시", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/inquiries/5", 200, DETAIL)
  server.answer("POST /admin-api/inquiries/5/replies", 201, REPLY_OK(true))
  draw("/5")
  await screen.findByRole("heading", { name: "방이 안 열려요" })
  fireEvent.change(screen.getByLabelText("답"), { target: { value: "  고쳤어요  " } })
  await act(async () => {
    fireEvent.click(sendButton())
    fireEvent.click(sendButton())
  })
  await screen.findByText("답을 달았어요. 플레이어에게 알림을 보냈어요.")
  assert.equal(posts(server).length, 1)
  const sent = JSON.parse(posts(server)[0].body)
  assert.deepEqual(Object.keys(sent).sort(), ["body", "requestId"])
  assert.equal(sent.body, "고쳤어요")
  assert.match(sent.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(screen.getByLabelText("답").value, "")
})

test("AD-284 실패하면 같은 번호로 다시, 성공 뒤엔 새 번호, 알림 못 보냄 안내", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/inquiries/5", 200, DETAIL)
  let fail = true
  server.answerWith("POST /admin-api/inquiries/5/replies", () => (fail
    ? { status: 503, body: { ok: false, code: "ADMIN_BUSY", message: "밀림" } }
    : { status: 201, body: REPLY_OK(false) }))
  draw("/5")
  await screen.findByRole("heading", { name: "방이 안 열려요" })
  fireEvent.change(screen.getByLabelText("답"), { target: { value: "첫 답" } })
  await act(async () => { fireEvent.click(sendButton()) })
  await screen.findByText(/다른 조회가 밀려 있어요/)
  fail = false
  await act(async () => { fireEvent.click(sendButton()) })
  await screen.findByText(/알림은 못 보냈지만/)
  fireEvent.change(screen.getByLabelText("답"), { target: { value: "둘째 답" } })
  await act(async () => { fireEvent.click(sendButton()) })
  await waitFor(() => assert.equal(posts(server).length, 3))
  const ids = posts(server).map((call) => JSON.parse(call.body).requestId)
  assert.equal(ids[0], ids[1])
  assert.notEqual(ids[1], ids[2])
})

test("AD-284 없는 문의면 안내 + 목록으로", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/inquiries/7", 404, { ok: false, code: "INQUIRY_NOT_FOUND", message: "문의를 찾을 수 없어요. 목록에서 다시 골라 주세요." })
  draw("/7")
  await screen.findByText("문의를 찾을 수 없어요. 목록에서 다시 골라 주세요.")
  assert.ok(screen.getByRole("link", { name: "목록으로" }))
})

test("AD-283 화면: 목록은 답 기다림부터, 상태 바꾸면 다시 부름", async () => {
  const server = createFakeServer()
  const item = { id: 5, user: { uuid: UUID, nickname: "가면1" }, category: "ACCOUNT", title: "닉네임", status: "OPEN", createdAt: "2026-11-10T03:00:00.000Z", answeredAt: null, replyCount: 0 }
  server.answer("GET /admin-api/inquiries?status=OPEN", 200, { ok: true, items: [item], nextBefore: null })
  server.answer("GET /admin-api/inquiries?status=ANSWERED", 200, { ok: true, items: [], nextBefore: null })
  draw("")
  const link = await screen.findByRole("link", { name: "닉네임" })
  assert.equal(link.getAttribute("href"), "/inquiries/5")
  assert.match(document.body.textContent, /답 기다림/)
  assert.match(document.body.textContent, /계정/)
  fireEvent.change(screen.getByLabelText("상태"), { target: { value: "ANSWERED" } })
  await screen.findByText("답한 문의가 없어요.")
})
