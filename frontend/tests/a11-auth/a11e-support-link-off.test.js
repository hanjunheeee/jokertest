// 고객센터 링크 시험 — 환경값 VITE_SUPPORT_URL이 없을 때 로그인 화면 (2026-11-16 결정 여섯째 1)
// 목록 A11a 화면 A11-F-297 (값 있을 때는 a11e-support-link.test.js)
import test from "node:test"
import assert from "node:assert/strict"
import { h, rtl, resetAll, renderRoutes } from "./a11Kit.mjs"

const { default: LoginPage } = await import("../../src/domains/auth/pages/LoginPage.jsx")

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

test("A11-F-297 값이 없으면 로그인 화면에 '고객센터' 글·주소 없는 링크가 없음 (찾기 링크 줄은 그대로)", () => {
  renderRoutes([{ path: "/login", element: h(LoginPage) }], { at: "/login" })
  assert.equal(rtl.screen.queryByText("고객센터") === null, true, "고객센터 글이 보임") // 실패 때 화면 요소를 통째로 찍지 않게 참·거짓으로 견줌
  assert.equal(document.querySelectorAll("a:not([href])").length, 0)
  assert.equal(rtl.screen.getByRole("link", { name: "비밀번호 찾기" }).getAttribute("href"), "/password-reset/request")
})
