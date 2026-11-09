// AD-066 회원 찾기·상세 화면 시험: 없음 · 탈퇴함 · 접속 중 표시, 이메일 보기, 휴대폰 카드
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act } = await import("@testing-library/react")
const { MemoryRouter, Route, Routes } = await import("react-router-dom")
const { default: MembersPage } = await import("../../../src/admin/domains/members/pages/MembersPage.jsx")
const { default: MemberDetailPage } = await import("../../../src/admin/domains/members/pages/MemberDetailPage.jsx")

test.afterEach(() => cleanup())

const UUID = "11111111-2222-4333-8444-555555555555"
const searchKey = (q) => `GET /admin-api/members?${new URLSearchParams({ q })}`

const ITEM = { uuid: UUID, nickname: "가면왕", emailMasked: "a***e@g***.com", status: "ACTIVE", online: true, banned: false, withdrawn: false, createdAt: "2026-11-01T03:00:00.000Z" }
const DETAIL = {
  ok: true,
  member: { uuid: UUID, nickname: "가면왕", emailMasked: "a***e@g***.com", status: "ACTIVE", role: "USER", online: true, onlineNode: "n1", withdrawn: false, createdAt: "2026-11-01T03:00:00.000Z", lastLoginAt: null },
  bans: [{ id: 3, reason: "욕설", isPermanent: false, startAt: "2026-11-01T03:00:00.000Z", endAt: "2026-11-02T03:00:00.000Z", bannedBy: "a1", bannedByLoginId: "ceo", liftedAt: "2026-11-01T05:00:00.000Z", liftedBy: "a1", liftedByLoginId: "ceo", liftReason: "오해였음", active: false }],
  reportsReceived: [],
  logins: [{ at: "2026-11-01T03:00:00.000Z", ipMasked: "123.45.*.*", success: true }],
}

const openAt = async (path) => {
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(Routes, null,
        React.createElement(Route, { path: "/members/:uuid", element: React.createElement(MemberDetailPage) }),
        React.createElement(Route, { path: "/members/*", element: React.createElement(MembersPage) }))))
  })
}

test("AD-066 찾은 회원 없음 → '없음' 안내 (표 없음)", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(searchKey("없는닉"), 200, { ok: true, items: [], nextBefore: null })
  await openAt("/members?q=없는닉")
  assert.ok(screen.getByText(/^없음 —/))
  assert.equal(screen.queryByRole("table"), null)
})

test("AD-066 목록: 접속 중·정지 중·탈퇴함 딱지, 닉네임은 상세 링크", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  const gone = { ...ITEM, uuid: "99999999-2222-4333-8444-555555555555", nickname: "탈퇴abc", online: false, withdrawn: true }
  const banned = { ...ITEM, uuid: "88888888-2222-4333-8444-555555555555", nickname: "가면둘", online: false, banned: true }
  server.answer(searchKey("가면"), 200, { ok: true, items: [ITEM, banned, gone], nextBefore: null })
  await openAt("/members?q=가면")
  const rows = screen.getAllByRole("row")
  assert.match(rows[1].textContent, /가면왕.*접속 중/)
  assert.match(rows[2].textContent, /가면둘.*정지 중/)
  assert.match(rows[3].textContent, /탈퇴함/)
  assert.equal(screen.getByRole("link", { name: "가면왕" }).getAttribute("href"), `/members/${UUID}`)
})

test("AD-066 찾기 칸: 빈 칸이면 찾기 버튼 꺼짐, 넣으면 주소 q로", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(searchKey("가면"), 200, { ok: true, items: [ITEM], nextBefore: null })
  await openAt("/members")
  assert.equal(screen.getByRole("button", { name: "찾기" }).disabled, true)
  fireEvent.change(screen.getByLabelText("찾을 회원"), { target: { value: " 가면 " } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "찾기" })) })
  assert.ok(screen.getByRole("link", { name: "가면왕" }))
  assert.equal(server.calls.at(-1).url, `/admin-api/members?${new URLSearchParams({ q: "가면" })}`)
})

test("AD-066 휴대폰 폭이면 카드 목록", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer(searchKey("가면"), 200, { ok: true, items: [ITEM], nextBefore: null })
  await openAt("/members?q=가면")
  assert.equal(screen.queryByRole("table"), null)
  assert.match(screen.getByRole("list", { name: "찾은 회원 목록" }).textContent, /가면왕.*접속 중/)
})

test("AD-066 상세: 접속 중·접속 서버·정지 기록 해제 사유·IP 가림, 이메일 보기 누르면 전체", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer(`GET /admin-api/members/${UUID}`, 200, DETAIL)
  server.answer(`POST /admin-api/members/${UUID}/reveal-email`, 200, { ok: true, email: "alice@gmail.com" })
  await openAt(`/members/${UUID}`)
  assert.ok(screen.getByRole("heading", { level: 1, name: "가면왕" }))
  assert.ok(screen.getAllByText("접속 중").length >= 1)
  assert.ok(screen.getByText("n1"))
  assert.match(screen.getByRole("table", { name: "정지 기록" }).textContent, /오해였음/)
  assert.ok(screen.getByText("123.45.*.*"))
  assert.equal(screen.queryByText("alice@gmail.com"), null)
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "이메일 보기" })) })
  assert.ok(screen.getByText("alice@gmail.com"))
})

test("AD-066 상세: 탈퇴 회원은 '탈퇴함'·제재 버튼 없음, 없는 회원은 '없음'", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  const goneUuid = "99999999-2222-4333-8444-555555555555"
  server.answer(`GET /admin-api/members/${goneUuid}`, 200, { ...DETAIL, member: { ...DETAIL.member, uuid: goneUuid, online: false, withdrawn: true, status: "WITHDRAWN" }, bans: [] })
  await openAt(`/members/${goneUuid}`)
  assert.ok(screen.getAllByText("탈퇴함").length >= 1)
  assert.ok(screen.getByText("탈퇴한 회원이라 제재할 수 없어요."))
  assert.equal(screen.queryByRole("button", { name: "기간 정지" }), null)
  cleanup()

  server.answer(`GET /admin-api/members/${UUID}`, 404, { ok: false, code: "MEMBER_NOT_FOUND", message: "그런 회원이 없어요." })
  await openAt(`/members/${UUID}`)
  assert.ok(screen.getByText(/^없음 —/))
})
