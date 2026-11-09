// AD-041·043·047 관리자 화면 틀 시험: 401이면 로그인으로·뒤에 원래 주소로, 권한 없음 화면, 메뉴 표·휴대폰 서랍
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, setScreenWidth, ME_OK } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { AdminScreens } = await import("../../../src/admin/app/AdminApp.jsx")
const { adminRoutes } = await import("../../../src/admin/app/adminRoutes.js")

test.afterEach(() => cleanup())

const openAt = async (path) => {
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(AdminScreens)))
  })
}
const currentMenu = () => document.querySelector('nav a[aria-current="page"]')?.textContent

const fillLogin = () => {
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "ceo" } })
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "long-password-1" } })
  fireEvent.change(screen.getByLabelText("OTP 번호 6자리"), { target: { value: "123456" } })
}

test("AD-041 로그인 안 됨(401) → 로그인 화면, 로그인 뒤 원래 주소(회원)로", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 401, { ok: false, code: "ADMIN_LOGIN_REQUIRED", message: "x" })
  server.answer("POST /admin-api/auth/login", 200, ME_OK)
  await openAt("/members?q=가면")

  assert.ok(screen.getByRole("heading", { name: "관리자 로그인" }))
  fillLogin()
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "로그인" })) })

  assert.equal(currentMenu(), "회원")
})

test("AD-041 쓰는 중 세션 끝남(401) → 로그인 화면 + 안내", async () => {
  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 200, ME_OK)
  server.answer("POST /admin-api/auth/logout", 401, { ok: false, code: "ADMIN_SESSION_EXPIRED", message: "x" })
  await openAt("/dashboard")
  assert.equal(currentMenu(), "운영 현황")

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "로그아웃" })) })

  assert.ok(screen.getByRole("heading", { name: "관리자 로그인" }))
  assert.match(screen.getByRole("status").textContent, /로그아웃됐어요/)
})

test("AD-043 403 ADMIN_ACCESS_REQUIRED → 접근 권한 없음 (로그인 칸 없음)", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 403, { ok: false, code: "ADMIN_ACCESS_REQUIRED", message: "x" })
  await openAt("/login")
  assert.ok(screen.getByRole("heading", { name: "접근 권한 없음" }))
  assert.equal(screen.queryByLabelText("아이디"), null)
  assert.equal(screen.queryByLabelText("비밀번호"), null)
})

test("AD-043 권한 확인 서버 못 닿음(503) → 다시 확인 버튼", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 503, { ok: false, code: "ADMIN_ACCESS_UNAVAILABLE", message: "x" })
  await openAt("/")
  assert.ok(screen.getByRole("button", { name: "다시 확인" }))
  assert.equal(screen.queryByLabelText("아이디"), null)
})

test("AD-047 메뉴 표에 모든 영역 (정한 순서)", async () => {
  assert.deepEqual(adminRoutes.map((row) => row.label), [
    "운영 현황", "회원", "공지", "처리 이력", "신고", "문의", "점검", "금지어",
    "결제", "상품", "쿠폰", "통계", "지난 판", "약관", "열린 방",
  ])
  for (const row of adminRoutes) assert.equal(typeof row.page, "function", row.label)

  setScreenWidth(1280)
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 200, ME_OK)
  await openAt("/")
  const links = [...document.querySelectorAll("nav a")].map((a) => a.textContent)
  assert.deepEqual(links, adminRoutes.map((row) => row.label))
  assert.equal(currentMenu(), "운영 현황")
})

test("AD-047 휴대폰: 메뉴 버튼으로 서랍 열고, 닫기·Esc·메뉴 누르면 닫힘", async () => {
  setScreenWidth(375)
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 200, ME_OK)
  await openAt("/dashboard")

  const toggle = screen.getByRole("button", { name: "메뉴 열기" })
  assert.equal(toggle.getAttribute("aria-expanded"), "false")
  assert.equal(screen.queryByRole("navigation"), null)

  fireEvent.click(toggle)
  assert.equal(toggle.getAttribute("aria-expanded"), "true")
  assert.ok(screen.getByRole("navigation"))
  fireEvent.click(screen.getByRole("button", { name: "메뉴 닫기" }))
  assert.equal(screen.queryByRole("navigation"), null)

  fireEvent.click(toggle)
  fireEvent.keyDown(document, { key: "Escape" })
  assert.equal(screen.queryByRole("navigation"), null)

  fireEvent.click(toggle)
  await act(async () => { fireEvent.click(screen.getByRole("link", { name: "공지" })) })
  assert.equal(screen.queryByRole("navigation"), null)
  fireEvent.click(toggle)
  assert.equal(currentMenu(), "공지")
})
