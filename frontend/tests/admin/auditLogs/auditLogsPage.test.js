// AD-105 관리자 처리 이력 화면 시험: 칸·누가·회원 바꾸면 거름 바뀜, 전후 값 펼쳐 보기, 공지·제재 줄 요약, 더 보기
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, waitFor, within } = await import("@testing-library/react")
const { default: AuditLogsPage } = await import("../../../src/admin/domains/auditLogs/pages/AuditLogsPage.jsx")

test.afterEach(() => {
  cleanup()
  setScreenWidth(1280)
})

const ADMIN = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", loginId: "ceo" }
const MEMBER = "11111111-1111-4111-8111-111111111111"
const ANNOUNCE_ROW = {
  id: 5, admin: ADMIN, action: "ANNOUNCE", targetType: "announcement", targetId: "r1", target: null, before: null,
  after: { title: "점검 안내", body: "b", target: "users", selectedCount: 2, recipientCount: 2, created: 1, duplicated: 0, failed: 1 },
  reason: null, ip: "203.0.113.1", accessEmail: "ceo@example.com", createdAt: "2026-11-10T03:00:00.000Z",
}
const BAN_ROW = {
  id: 4, admin: ADMIN, action: "BAN", targetType: "user", targetId: MEMBER, target: { nickname: "가면1" },
  before: { banned: false }, after: { ban: { id: 66, reason: "욕설 반복", isPermanent: false }, kind: "PERIOD", days: 7 }, reason: "욕설 반복", ip: null, accessEmail: null,
  createdAt: "2026-11-10T02:00:00.000Z",
}
const UNBAN_ROW = { ...BAN_ROW, id: 3, action: "UNBAN", after: null, reason: "오해 풀림" }

const getUrls = (server) => server.calls.filter((call) => call.method === "GET").map((call) => call.url)
const listUrl = (query) => `/admin-api/audit-logs?${query}`

const start = (extra = (server) => server) => {
  const server = createFakeServer()
  server.answer("GET /admin-api/admins", 200, { ok: true, items: [ADMIN, { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", loginId: "cto" }] })
  server.answer(`GET ${listUrl("kind=all")}`, 200, { ok: true, items: [ANNOUNCE_ROW, BAN_ROW], nextBefore: 4 })
  extra(server)
  render(React.createElement(AuditLogsPage))
  return server
}

test("AD-105 처음엔 전체, 공지 줄은 제목·결과 수, 제재 줄은 종류·대상·사유", async () => {
  start()
  const table = await screen.findByRole("table", { name: "처리 이력" })
  const text = table.textContent
  assert.match(text, /점검 안내 · 받는 사람 2 · 새로 보냄 1 · 중복 0 · 실패 1/)
  assert.match(text, /고른 사람 2명/)
  assert.match(text, /정지 \(기간 정지 7일\)/)
  assert.match(text, /가면1/)
  assert.match(text, /욕설 반복/)
  assert.match(text, /2026-11-10 12:00/)
})

test("AD-105 칸 바꾸면 kind로 다시 부름, 누가 고르면 adminId", async () => {
  const server = start((s) => {
    s.answer(`GET ${listUrl("kind=sanction")}`, 200, { ok: true, items: [BAN_ROW, UNBAN_ROW], nextBefore: null })
    s.answer(`GET ${listUrl(`kind=sanction&adminId=${ADMIN.id}`)}`, 200, { ok: true, items: [UNBAN_ROW], nextBefore: null })
  })
  await screen.findByRole("table")
  const tab = screen.getByRole("button", { name: "제재·해제 이력" })
  await act(async () => { fireEvent.click(tab) })
  assert.equal(tab.getAttribute("aria-pressed"), "true")
  await waitFor(() => assert.match(screen.getByRole("table").textContent, /정지 해제/))
  assert.ok(getUrls(server).includes(listUrl("kind=sanction")))

  await waitFor(() => assert.ok(screen.getByRole("option", { name: "cto" })))
  await act(async () => { fireEvent.change(screen.getByLabelText("누가"), { target: { value: ADMIN.id } }) })
  await waitFor(() => assert.ok(getUrls(server).includes(listUrl(`kind=sanction&adminId=${ADMIN.id}`))))
  await waitFor(() => assert.equal(screen.getByRole("table").querySelectorAll("tbody tr").length, 1))
})

test("AD-105 기간은 한국 날짜 0시 → UTC로 보냄 (끝 날짜는 다음 날 0시 전까지)", async () => {
  const from = "2026-11-09T15:00:00.000Z"
  const to = "2026-11-10T15:00:00.000Z"
  const server = start((s) => {
    s.answer(`GET ${listUrl(`kind=all&from=${encodeURIComponent(from)}`)}`, 200, { ok: true, items: [], nextBefore: null })
    s.answer(`GET ${listUrl(`kind=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)}`, 200, { ok: true, items: [], nextBefore: null })
  })
  await screen.findByRole("table")
  await act(async () => { fireEvent.change(screen.getByLabelText("시작 날짜"), { target: { value: "2026-11-10" } }) })
  await act(async () => { fireEvent.change(screen.getByLabelText("끝 날짜"), { target: { value: "2026-11-10" } }) })
  await waitFor(() => assert.ok(getUrls(server).includes(listUrl(`kind=all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))))
  assert.match((await screen.findByText(/맞는 기록이 없어요/)).textContent, /기간을 바꿔/)
})

test("AD-105 회원으로 찾기 → 그 회원 memberUuid로 거름, 풀면 다시 전체", async () => {
  const server = start((s) => {
    s.answer("GET /admin-api/members?q=%EA%B0%80%EB%A9%B4&limit=20", 200, { ok: true, items: [{ uuid: MEMBER, nickname: "가면1" }], nextBefore: null })
    s.answer(`GET ${listUrl(`kind=all&memberUuid=${MEMBER}`)}`, 200, { ok: true, items: [BAN_ROW], nextBefore: null })
  })
  await screen.findByRole("table")
  fireEvent.change(screen.getByLabelText("회원으로 찾기"), { target: { value: "가면" } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "회원 찾기" })) })
  await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "이 회원 이력" })) })
  await waitFor(() => assert.ok(getUrls(server).includes(listUrl(`kind=all&memberUuid=${MEMBER}`))))
  await waitFor(() => assert.equal(screen.getByRole("table").querySelectorAll("tbody tr").length, 1))
  const before = getUrls(server).filter((url) => url === listUrl("kind=all")).length
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "회원 거르기 풀기" })) })
  await waitFor(() => assert.equal(getUrls(server).filter((url) => url === listUrl("kind=all")).length, before + 1))
})

test("AD-105 전후 값 펼쳐 보기, 더 보기는 nextBefore로 이어 붙임", async () => {
  const server = start((s) => {
    s.answer(`GET ${listUrl("kind=all&before=4")}`, 200, { ok: true, items: [UNBAN_ROW], nextBefore: null })
  })
  const table = await screen.findByRole("table")
  const banRow = within(table).getAllByRole("row").find((row) => row.textContent.includes("욕설 반복"))
  const details = banRow.querySelector("details")
  assert.equal(details.open, false)
  fireEvent.click(within(banRow).getByText("전후 값 보기"))
  details.open = true
  assert.match(details.textContent, /"banned": false/)
  assert.match(details.textContent, /"days": 7/)

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "더 보기" })) })
  await waitFor(() => assert.equal(screen.getByRole("table").querySelectorAll("tbody tr").length, 3))
  assert.ok(getUrls(server).includes(listUrl("kind=all&before=4")))
  assert.equal(screen.queryByRole("button", { name: "더 보기" }), null)
})

test("AD-105 휴대폰 폭이면 카드로, 오류면 다시 불러오기", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer("GET /admin-api/admins", 200, { ok: true, items: [] })
  let fail = true
  server.answerWith(`GET ${listUrl("kind=all")}`, () => (fail
    ? { status: 503, body: { ok: false, code: "ADMIN_QUERY_TIMEOUT", message: "x" } }
    : { status: 200, body: { ok: true, items: [BAN_ROW], nextBefore: null } }))
  render(React.createElement(AuditLogsPage))
  const alert = await screen.findByRole("alert")
  assert.match(alert.textContent, /오래 걸려 멈췄어요/)
  fail = false
  await act(async () => { fireEvent.click(within(alert).getByRole("button", { name: "다시 불러오기" })) })
  const cards = await screen.findByRole("list", { name: "처리 이력" })
  assert.match(cards.textContent, /정지 \(기간 정지 7일\)/)
  assert.match(cards.textContent, /처리: ceo/)
  assert.equal(screen.queryByRole("table"), null)
})
