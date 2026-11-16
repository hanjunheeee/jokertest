// 고객센터 링크 시험 — 환경값 VITE_SUPPORT_URL이 없을 때 아이디 찾기·비번 재설정 요청 화면 (2026-11-16 결정 여섯째 1)
// 목록 A11b 화면 A11-F-823~824 (값 있을 때는 a11e-support-link.test.js)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, cleanup } = await import("@testing-library/react")
const { installFetch, renderRoutes } = await import("./a11Kit.mjs")
const { default: FindIdPage } = await import("../../src/domains/auth/pages/FindIdPage.jsx")
const { PasswordResetRequestPage } = await import("../../src/domains/auth/pages/PasswordResetPage.jsx")

test.afterEach(() => cleanup())

// '고객센터' 글도, 주소 없는 링크도 없음
function assertNoSupportLink(where) {
  assert.equal(screen.queryByText("고객센터") === null, true, `${where}: 고객센터 글이 보임`) // 실패 때 화면 요소를 통째로 찍지 않게 참·거짓으로 견줌
  assert.equal(document.querySelectorAll("a:not([href])").length, 0, where)
}

test("A11-F-823 값이 없으면 아이디 찾기 화면에 '고객센터'가 없음", () => {
  installFetch()
  renderRoutes([{ path: "/find-id", element: React.createElement(FindIdPage) }], { entries: ["/find-id"] })
  assert.ok(screen.getByRole("button", { name: "아이디 찾기" }))
  assertNoSupportLink("아이디 찾기")
})

test("A11-F-824 값이 없으면 비번 재설정 요청 화면에 '고객센터'가 없음", () => {
  installFetch()
  renderRoutes([{ path: "/password-reset/request", element: React.createElement(PasswordResetRequestPage) }], { entries: ["/password-reset/request"] })
  assert.ok(screen.getByRole("button", { name: "재설정 링크 보내기" }))
  assertNoSupportLink("비번 재설정 요청")
})
