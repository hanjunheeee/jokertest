// 모바일 비번 안내 글(영문·숫자 포함)·재설정 "다시 보내기" 1분 기다림 창·밀려난 링크 안내·가입 중복 확인 429 글 시험
// 목록 A11a 모바일 A11-M-007·008, A11b 모바일 A11-M-509~512 (돌리기: frontend-mobile 폴더에서 node --test tests/a11e-password-mix-resend.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { waitUntil } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, serve } from "./a00-game.mjs"

const { default: SignupFields } = await import("@m/domains/auth/components/signup/SignupFields.jsx")
const { default: ResetRequestSentDialog } = await import("@m/domains/auth/components/recovery/ResetRequestSentDialog.jsx")
const { default: NewPasswordForm } = await import("@m/domains/auth/components/recovery/NewPasswordForm.jsx")
const { default: PasswordSection } = await import("@m/domains/user/components/account/PasswordSection.jsx")
const { default: PasswordResetPage } = await import("@m/domains/auth/pages/PasswordResetPage.jsx")
const { RESET_TEXT } = await import("@/domains/auth/constants/recoveryMessages.js")

const TOKEN = "TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"

let view = null
afterEach(() => { resetGame(view); view = null })

const field = (name) => document.querySelector(`input[name="${name}"]`)
const buttonNamed = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text) ?? null

test("A11-M-007 모바일 가입 비번 칸 안내 '비밀번호를 입력하세요 (8~64자, 영문·숫자 포함)'", () => {
  const formData = { email: "", password: "", passwordConfirm: "", nickname: "", birthDate: "" }
  view = render(React.createElement(SignupFields, { formData, onChange: () => {} }))
  assert.equal(field("password").getAttribute("placeholder"), "비밀번호를 입력하세요 (8~64자, 영문·숫자 포함)")
})

test("A11-M-509 접수 창 남은 42초 → '다시 보내기' 꺼짐 + '42초 뒤 다시 보낼 수 있습니다.'", () => {
  view = render(React.createElement(ResetRequestSentDialog, { open: true, onConfirm: () => {}, onResend: () => {}, resendWaitSec: 42 }))
  assert.equal(buttonNamed("다시 보내기")?.disabled, true)
  assert.ok(document.body.textContent.includes("42초 뒤 다시 보낼 수 있습니다."), "남은 초 글이 없음")
})

test("A11-M-510 접수 창 남은 0초 → '다시 보내기' 켜짐, 남은 초 글 없음", () => {
  let resent = 0
  view = render(React.createElement(ResetRequestSentDialog, { open: true, onConfirm: () => {}, onResend: () => { resent += 1 }, resendWaitSec: 0 }))
  const button = buttonNamed("다시 보내기")
  assert.equal(button?.disabled, false)
  assert.ok(!/초 뒤 다시 보낼 수 있습니다/.test(document.body.textContent), "남은 초 글이 남음")
  button.click()
  assert.equal(resent, 1)
})

test("A11-M-511 모바일 밀려난 링크 → 최근 메일 링크 안내 글 + '다시 요청하기'", async () => {
  serve({ "GET /auth/password-reset/verify": { status: 200, body: { ok: false, code: "SUPERSEDED" } } })
  view = await renderRoute(fakeSocket(), React.createElement(PasswordResetPage), { path: `/password-reset?token=${TOKEN}` })
  await waitUntil(() => document.body.textContent.includes(RESET_TEXT.linkSuperseded), { label: "밀려난 링크 안내" })
  assert.ok(buttonNamed("다시 요청하기"), "다시 요청하기 단추가 없음")
})

test("A11-M-512 모바일 재설정·비번 바꾸기 새 비번 칸 안내에 '영문·숫자 포함'", () => {
  view = render(React.createElement(NewPasswordForm, { status: "ready", password: "", setPassword: () => {}, passwordConfirm: "", setPasswordConfirm: () => {}, formError: null }))
  assert.equal(field("password").getAttribute("placeholder"), "8~64자 비밀번호 (영문·숫자 포함)")
  view.unmount()
  view = render(React.createElement(PasswordSection, {
    account: { hasLocalPassword: true },
    pwForm: { currentPassword: "", newPassword: "", newPasswordConfirm: "" },
    handlePwChange: () => {}, pwMsg: null, pwLoading: false, onSubmit: () => {},
  }))
  assert.equal(field("newPassword").getAttribute("placeholder"), "새 비밀번호 (8~64자, 영문·숫자 포함)")
})

test("A11-M-008 모바일 가입 중복 확인 429 → 결과 줄에 서버 글 (실패 글 아님)", async () => {
  const text = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
  serve({ "GET /auth/check-email": { status: 429, body: { ok: false, code: "RATE_LIMITED", message: text } } })
  const formData = { email: "m-check@example.com", password: "", passwordConfirm: "", nickname: "", birthDate: "" }
  view = render(React.createElement(SignupFields, { formData, onChange: () => {} }))
  buttonNamed("이메일 중복확인")?.click() ?? document.querySelector('[aria-label="이메일 중복확인"]').click()
  await waitUntil(() => document.body.textContent.includes(text), { label: "429 서버 글" })
  assert.ok(!document.body.textContent.includes("중복 확인에 실패했습니다."), "실패 글이 보임")
})
