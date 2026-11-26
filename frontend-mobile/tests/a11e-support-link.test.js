// 모바일 고객센터 링크·양피지 대비·쿠폰 입력 16px 시험 — VITE_SUPPORT_URL이 있을 때 3개 화면 표시 및 모달 대비 검증
// 목록 A11a 모바일 A11-M-011~013, A11b 모바일 A11-M-517~518 (돌리기: frontend-mobile 폴더에서 node --test --test-concurrency=1 tests/a11e-support-link.test.js)
import { stubModule } from "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

const SUPPORT = "https://example.com/support"
stubModule("/shared/env.js", `export const API_BASE_URL = ""; export const SUPPORT_URL = ${JSON.stringify(SUPPORT)};`)

const { buttonNamed, click, flush, typeInto } = await import("./a00-kit.mjs")
const { fakeSocket, renderRoute, resetGame, serve } = await import("./a00-game.mjs")

const { default: LoginPage } = await import("@m/domains/auth/pages/LoginPage.jsx")
const { default: FindIdPage } = await import("@m/domains/auth/pages/FindIdPage.jsx")
const { default: PasswordResetRequestPage } = await import("@m/domains/auth/pages/PasswordResetRequestPage.jsx")
const { default: SupportLink } = await import("@m/domains/auth/components/SupportLink.jsx")
const { default: SocialErrorBanner } = await import("@m/domains/auth/components/login/SocialErrorBanner.jsx")
const { DIALOG_ERROR_CLASS, DIALOG_META_CLASS, DIALOG_SUCCESS_CLASS, DIALOG_TEXT_CLASS } = await import("@m/shared/ui/modal/textDialogStyle.js")
const { INPUT_SLOT_LOOKS } = await import("@m/shared/ui/input/inputSlotLooks.js")

let view = null
afterEach(() => { resetGame(view); view = null })

function assertSupportLink(where) {
  const links = [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "고객센터")
  assert.equal(links.length, 1, `${where}: 고객센터 링크 수`)
  assert.equal(links[0].getAttribute("href"), SUPPORT, where)
  assert.equal(links[0].getAttribute("target"), "_blank", where)
  assert.equal(links[0].getAttribute("rel"), "noopener noreferrer", where)
  assert.ok(links[0].classList.contains("auth-text-link"), `${where} class: ${links[0].className}`)
}

test("A11-M-011 VITE_SUPPORT_URL이 https 주소면 모바일 로그인 화면에 '고객센터' 새 창 링크 표시", async () => {
  serve({ "GET /auth/terms": { status: 200, body: { success: true, data: { terms: [] } } } })
  view = await renderRoute(fakeSocket(), React.createElement(LoginPage), { path: "/login" })
  assertSupportLink("로그인")
})

test("A11-M-517 모바일 아이디 찾기 화면: 첫 화면·찾은 뒤 둘 다 '고객센터' 링크 표시", async () => {
  serve({ "POST /auth/find-id": { status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } } })
  view = await renderRoute(fakeSocket(), React.createElement(FindIdPage), { path: "/find-id" })
  assertSupportLink("아이디 찾기 첫 화면")
  typeInto(document.querySelector('input[name="nickname"]'), "가면손님")
  typeInto(document.querySelector('input[name="birthDate"]'), "1999-04-17")
  click(buttonNamed("아이디 찾기"))
  await flush(5)
  assert.match(document.body.textContent, /ga\*\*\*@example\.com/)
  assertSupportLink("아이디 찾기 결과")
})

test("A11-M-518 모바일 비번 재설정 요청 화면: 첫 화면·보낸 뒤 둘 다 '고객센터' 링크 표시", async () => {
  serve({ "POST /auth/password-reset/request": { status: 200, body: { ok: true } } })
  view = await renderRoute(fakeSocket(), React.createElement(PasswordResetRequestPage), { path: "/password-reset/request" })
  assertSupportLink("재설정 요청 첫 화면")
  typeInto(document.querySelector('input[name="email"]'), "reset-user@example.com")
  click(buttonNamed("재설정 링크 보내기"))
  await flush(5)
  assert.ok(buttonNamed("다시 보내기"), "접수 모달 다시 보내기 단추가 없음")
  assertSupportLink("재설정 요청 보낸 뒤")
})

test("A11-M-012 SupportLink mailto는 새 창 속성 없고 javascript: 주소는 그리지 않음", () => {
  view = render(React.createElement(SupportLink, { rawUrl: "mailto:help@example.com" }))
  const mailLink = document.querySelector("a")
  assert.equal(mailLink.getAttribute("href"), "mailto:help@example.com")
  assert.equal(mailLink.hasAttribute("target"), false)
  view.unmount()
  view = render(React.createElement(SupportLink, { rawUrl: "javascript:alert(1)" }))
  assert.equal(document.querySelectorAll("a").length, 0)
})

test("A11-M-013 공용 양피지 모달·소셜 오류 배너 고대비 색 및 account·coupon 입력칸 1rem(16px) 확인", () => {
  assert.match(DIALOG_TEXT_CLASS, /text-\[#2b1d0e\]/)
  assert.match(DIALOG_META_CLASS, /text-\[#2b1d0e\]/)
  assert.match(DIALOG_ERROR_CLASS, /text-\[#52100a\]/)
  assert.match(DIALOG_SUCCESS_CLASS, /text-\[#0f2e16\]/)
  assert.ok(INPUT_SLOT_LOOKS.account.text.includes("[--app-text-size:1rem]"))
  assert.ok(!/(^|\s)app-text-scaled(\s|$)/.test(INPUT_SLOT_LOOKS.account.text))
  assert.ok(INPUT_SLOT_LOOKS.coupon.text.includes("[--app-text-size:1rem]"))
  assert.ok(!/(^|\s)app-text-scaled(\s|$)/.test(INPUT_SLOT_LOOKS.coupon.text))

  view = render(React.createElement(SocialErrorBanner, { message: "소셜 로그인을 취소했습니다." }))
  const alert = document.querySelector('[role="alert"]')
  assert.match(alert.className, /bg-\[#fce8e6\]\/95/)
  assert.match(alert.className, /text-\[#3b0808\]/)
})
