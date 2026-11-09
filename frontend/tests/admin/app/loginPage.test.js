// AD-040·042 관리자 로그인 화면 시험: 세 칸·빈 칸이면 버튼 꺼짐·OTP 숫자 6자리만·잠김 안내
import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { createFakeServer, ME_OK } from "../helpers/adminDom.mjs"

const { render, cleanup, screen, fireEvent, act, waitFor } = await import("@testing-library/react")
const { default: LoginPage } = await import("../../../src/admin/domains/auth/pages/LoginPage.jsx")
const { loginRequest } = await import("../../../src/admin/domains/auth/api/auth.api.js")

test.afterEach(() => cleanup())

const draw = (onLogin = loginRequest, notice) => render(React.createElement(LoginPage, { onLogin, notice }))
const fields = () => ({
  loginId: screen.getByLabelText("아이디"),
  password: screen.getByLabelText("비밀번호"),
  otp: screen.getByLabelText("OTP 번호 6자리"),
  button: screen.getByRole("button", { name: "로그인" }),
})
const fill = ({ loginId = "ceo", password = "long-password-1", otp = "123456" } = {}) => {
  const f = fields()
  fireEvent.change(f.loginId, { target: { value: loginId } })
  fireEvent.change(f.password, { target: { value: password } })
  fireEvent.change(f.otp, { target: { value: otp } })
  return f
}

test("AD-040 세 칸(아이디·비밀번호·OTP), 맞는 입력 종류·자동 채우기", () => {
  draw()
  const f = fields()
  assert.equal(f.loginId.getAttribute("autocomplete"), "username")
  assert.equal(f.password.getAttribute("type"), "password")
  assert.equal(f.password.getAttribute("autocomplete"), "current-password")
  assert.equal(f.otp.getAttribute("inputmode"), "numeric")
  assert.equal(f.otp.getAttribute("autocomplete"), "one-time-code")
})

test("AD-040 빈 칸 있으면 버튼 꺼짐, 다 차면 켜짐", () => {
  draw()
  assert.equal(fields().button.disabled, true)
  fill({ password: "" })
  assert.equal(fields().button.disabled, true)
  fill()
  assert.equal(fields().button.disabled, false)
})

test("AD-040 OTP는 숫자만 6자리까지, 6자리 아니면 버튼 꺼짐", () => {
  draw()
  const f = fill({ otp: "12a3" })
  assert.equal(f.otp.value, "123")
  assert.equal(f.button.disabled, true)
  fireEvent.change(f.otp, { target: { value: "1234567" } })
  assert.equal(f.otp.value, "123456")
  assert.equal(f.button.disabled, false)
})

test("AD-040 로그인 누르면 세 값을 한 번에 보냄 (쓰기 확인 머리글 없이)", async () => {
  const server = createFakeServer()
  server.answer("POST /admin-api/auth/login", 200, ME_OK)
  const done = []
  draw(async (input) => { done.push(await loginRequest(input)) })
  const f = fill()
  await act(async () => { fireEvent.click(f.button) })
  await waitFor(() => assert.equal(done.length, 1))
  assert.equal(server.calls[0].body, JSON.stringify({ loginId: "ceo", password: "long-password-1", otp: "123456" }))
  assert.equal(done[0].csrfToken, "csrf-abc")
})

test("AD-042 429 잠김이면 'n분 뒤 다시', OTP 칸은 비움", async () => {
  const server = createFakeServer()
  server.answer("POST /admin-api/auth/login", 429, { ok: false, code: "ADMIN_LOGIN_LOCKED", message: "잠김", retryAfterSec: 601 })
  draw()
  const f = fill()
  await act(async () => { fireEvent.click(f.button) })
  const alert = await screen.findByRole("alert")
  assert.match(alert.textContent, /11분 뒤 다시/)
  assert.equal(f.otp.value, "")
})

test("AD-042 틀리면 어느 칸인지 안 알려 주는 같은 문구", async () => {
  const server = createFakeServer()
  server.answer("POST /admin-api/auth/login", 401, { ok: false, code: "ADMIN_LOGIN_FAILED", message: "x" })
  draw()
  const f = fill()
  await act(async () => { fireEvent.click(f.button) })
  const alert = await screen.findByRole("alert")
  assert.match(alert.textContent, /아이디, 비밀번호, OTP 번호 중/)
})

test("자동 로그아웃으로 왔으면 안내 한 줄", () => {
  draw(loginRequest, "ADMIN_SESSION_EXPIRED")
  assert.match(screen.getByRole("status").textContent, /로그아웃됐어요/)
})
