// 고객센터 링크 시험 — 환경값 VITE_SUPPORT_URL이 있을 때 아이디 찾기·비번 재설정 요청 화면 (2026-11-16 결정 여섯째 1)
// 목록 A11b 화면 A11-F-821~822 (값 없을 때는 a11e-support-link-off.test.js — 환경값은 파일마다 한 번만 읽혀서 따로 둠)
import test, { mock } from "node:test"
import assert from "node:assert/strict"

const SUPPORT = "https://example.com/support"

// 빌드 환경값 흉내: 진짜 환경은 안 바꾸고 환경값 모듈만 바꿔 끼움 (화면을 불러오기 전에)
mock.module(new URL("../../src/shared/env.js", import.meta.url).href, {
  namedExports: { API_BASE_URL: "", SUPPORT_URL: SUPPORT },
})

await import("../helpers/domSetup.mjs")
const React = await import("react")
const { screen, fireEvent, cleanup } = await import("@testing-library/react")
const { installFetch, flushUi, renderRoutes } = await import("./a11Kit.mjs")
const { default: FindIdPage } = await import("../../src/domains/auth/pages/FindIdPage.jsx")
const { PasswordResetRequestPage } = await import("../../src/domains/auth/pages/PasswordResetPage.jsx")

test.afterEach(() => cleanup())

// 고객센터 링크가 하나, 그 주소·새 창으로 열림
function assertSupportLink(where) {
  const links = screen.getAllByRole("link", { name: "고객센터" })
  assert.equal(links.length, 1, `${where}: 고객센터 링크 수`)
  assert.equal(links[0].getAttribute("href"), SUPPORT, where)
  assert.equal(links[0].getAttribute("target"), "_blank", where)
  assert.equal(links[0].getAttribute("rel"), "noopener noreferrer", where)
  assert.ok(links[0].classList.contains("auth-text-link"), `${where} class: ${links[0].className}`)
}

test("A11-F-821 아이디 찾기 화면: 첫 화면·찾은 뒤 둘 다 '고객센터' 링크 (그 주소·새 창)", async () => {
  installFetch({ "POST /auth/find-id": { status: 200, body: { ok: true, maskedEmail: "ga***@example.com" } } })
  renderRoutes([{ path: "/find-id", element: React.createElement(FindIdPage) }], { entries: ["/find-id"] })
  assertSupportLink("첫 화면")
  fireEvent.change(screen.getByPlaceholderText("닉네임을 입력하세요"), { target: { value: "가면손님" } })
  fireEvent.change(document.querySelector("input[name='birthDate']"), { target: { value: "1999-04-17" } })
  fireEvent.click(screen.getByRole("button", { name: "아이디 찾기" }))
  await flushUi()
  assert.match(document.body.textContent, /ga\*\*\*@example\.com/)
  assertSupportLink("찾은 뒤")
})

test("A11-F-822 비번 재설정 요청 화면: 첫 화면·보낸 뒤 둘 다 '고객센터' 링크 (그 주소·새 창)", async () => {
  installFetch({ "POST /auth/password-reset/request": { status: 200, body: { ok: true } } })
  renderRoutes([{ path: "/password-reset/request", element: React.createElement(PasswordResetRequestPage) }], { entries: ["/password-reset/request"] })
  assertSupportLink("첫 화면")
  fireEvent.change(screen.getByRole("textbox", { name: "가입할 때 등록한 이메일을 입력하세요" }), { target: { value: "reset-user@example.com" } })
  fireEvent.click(screen.getByRole("button", { name: "재설정 링크 보내기" }))
  await flushUi()
  assert.ok(screen.getByRole("button", { name: "다시 보내기" }))
  assertSupportLink("보낸 뒤")
})
