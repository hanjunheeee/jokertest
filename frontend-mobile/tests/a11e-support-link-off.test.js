// 모바일 고객센터 링크 시험 — 환경값 VITE_SUPPORT_URL이 없을 때 로그인·아이디 찾기·비번 재설정 요청 화면 (2026-11-16 결정 여섯째 1)
// 목록 A11a 모바일 A11-M-010, A11b 모바일 A11-M-515~516 (값 있을 때는 a11e-support-link.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, serve } from "./a00-game.mjs"

const { default: LoginPage } = await import("@m/domains/auth/pages/LoginPage.jsx")
const { default: FindIdPage } = await import("@m/domains/auth/pages/FindIdPage.jsx")
const { default: PasswordResetRequestPage } = await import("@m/domains/auth/pages/PasswordResetRequestPage.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

// '고객센터' 글도, 주소 없는 링크도 없음
function assertNoSupportLink(where) {
  assert.equal(document.body.textContent.includes("고객센터"), false, `${where}: 고객센터 글이 보임`)
  assert.equal(document.querySelectorAll("a:not([href])").length, 0, `${where}: 주소 없는 링크`)
}

test("A11-M-010 값이 없으면 모바일 로그인 화면에 '고객센터'가 없음 (찾기 링크는 그대로)", async () => {
  serve({ "GET /auth/terms": { status: 200, body: { success: true, data: { terms: [] } } } })
  view = await renderRoute(fakeSocket(), React.createElement(LoginPage), { path: "/login" })
  assert.ok([...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/password-reset/request"), "비밀번호 찾기 링크가 없음")
  assertNoSupportLink("로그인")
})

for (const [no, name, Page, path] of [["515", "아이디 찾기", FindIdPage, "/find-id"], ["516", "비번 재설정 요청", PasswordResetRequestPage, "/password-reset/request"]]) {
  test(`A11-M-${no} 값이 없으면 모바일 ${name} 화면에 '고객센터'가 없음`, async () => {
    view = await renderRoute(fakeSocket(), React.createElement(Page), { path })
    assertNoSupportLink(name)
  })
}
