// AD-094 관리자 공지 화면 시험: 보내기 두 번 눌러도 요청 하나, 결과(받는 사람·실패·중복) 표시, 고른 사람 보내기
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, waitFor, within } = await import("@testing-library/react")
const { default: AnnouncementsPage } = await import("../../../src/admin/domains/announcements/pages/AnnouncementsPage.jsx")

test.afterEach(() => cleanup())

const UUID_A = "11111111-1111-4111-8111-111111111111"
const RESULT = { recipientCount: 3, created: 1, duplicated: 1, failed: 1 }

const draw = () => render(React.createElement(AnnouncementsPage))
const fillText = (title = "점검 안내", body = "오늘 밤 점검해요") => {
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: title } })
  fireEvent.change(screen.getByLabelText("본문"), { target: { value: body } })
}
const formButton = () => screen.getAllByRole("button", { name: "보내기" }).find((button) => !button.closest("[role=dialog]"))
const posts = (server) => server.calls.filter((call) => call.method === "POST")

test("AD-094 제목·본문 비면 보내기 꺼짐, 고른 사람인데 아무도 없으면 꺼짐", () => {
  draw()
  assert.equal(formButton().disabled, true)
  fillText()
  assert.equal(formButton().disabled, false)
  fireEvent.click(screen.getByLabelText("고른 사람"))
  assert.equal(formButton().disabled, true)
})

test("AD-094 확인 창에서 보내기 두 번 눌러도 요청 하나, 결과 수 표시", async () => {
  const server = createFakeServer()
  server.answer("POST /admin-api/announcements", 200, { ok: true, result: RESULT, auditId: 9 })
  draw()
  fillText()
  fireEvent.click(formButton())
  const dialog = screen.getByRole("dialog")
  assert.match(dialog.textContent, /접속 중 전체/)
  const confirm = within(dialog).getByRole("button", { name: "보내기" })
  await act(async () => {
    fireEvent.click(confirm)
    fireEvent.click(confirm)
  })
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null))
  assert.equal(posts(server).length, 1)
  const sent = JSON.parse(posts(server)[0].body)
  assert.deepEqual(Object.keys(sent).sort(), ["body", "requestId", "target", "title"])
  assert.equal(sent.target, "online")
  assert.match(sent.requestId, /^[0-9a-f-]{36}$/)

  const result = screen.getByRole("status", { name: "발송 결과" })
  const numbers = within(result).getAllByRole("definition").map((node) => node.textContent)
  assert.deepEqual(numbers, ["3", "1", "1", "1"])
  assert.match(result.textContent, /받는 사람/)
  assert.match(result.textContent, /이미 받음\(중복\)/)
  assert.match(result.textContent, /실패/)
  // 보낸 뒤 폼 비움
  assert.equal(screen.getByLabelText("제목").value, "")
})

test("AD-094 실패하면 같은 요청 번호로 다시, 성공 뒤엔 새 번호", async () => {
  const server = createFakeServer()
  let fail = true
  server.answerWith("POST /admin-api/announcements", () => (fail
    ? { status: 503, body: { ok: false, code: "ADMIN_BUSY", message: "밀림" } }
    : { status: 200, body: { ok: true, result: RESULT, auditId: 1 } }))
  draw()
  fillText()
  fireEvent.click(formButton())
  const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "보내기" })
  await act(async () => { fireEvent.click(confirm) })
  await screen.findByRole("alert")
  fail = false
  await act(async () => { fireEvent.click(confirm) })
  await waitFor(() => assert.equal(screen.queryByRole("dialog"), null))
  fillText("두 번째", "다른 공지")
  fireEvent.click(formButton())
  await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "보내기" })) })
  await waitFor(() => assert.equal(posts(server).length, 3))
  const ids = posts(server).map((call) => JSON.parse(call.body).requestId)
  assert.equal(ids[0], ids[1])
  assert.notEqual(ids[1], ids[2])
})

test("AD-094 고른 사람: 찾아 넣고 보내면 userUuids, UUID 그대로 넣기도 됨", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/members?q=%EA%B0%80%EB%A9%B4&limit=20", 200, { ok: true, items: [{ uuid: UUID_A, nickname: "가면1" }], nextBefore: null })
  server.answer("POST /admin-api/announcements", 200, { ok: true, result: { recipientCount: 2, created: 1, duplicated: 0, failed: 1 }, auditId: 2 })
  draw()
  fillText()
  fireEvent.click(screen.getByLabelText("고른 사람"))
  fireEvent.change(screen.getByLabelText("받을 사람 찾기"), { target: { value: "가면" } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "찾기" })) })
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "넣기" })) })
  const ghost = "22222222-2222-4222-8222-222222222222"
  fireEvent.change(screen.getByLabelText("받을 사람 찾기"), { target: { value: ghost } })
  fireEvent.click(screen.getByRole("button", { name: "이 UUID 그대로 넣기" }))
  assert.match(screen.getByText(/고른 사람 2명/).textContent, /2명/)

  fireEvent.click(formButton())
  assert.match(screen.getByRole("dialog").textContent, /고른 사람 2명/)
  await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "보내기" })) })
  await waitFor(() => assert.equal(posts(server).length, 1))
  const sent = JSON.parse(posts(server)[0].body)
  assert.equal(sent.target, "users")
  assert.deepEqual(sent.userUuids, [UUID_A, ghost])
  assert.match((await screen.findByText(/없는 회원이거나/)).textContent, /고른 사람을 다시 확인/)
})
