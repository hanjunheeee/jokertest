// 모바일 고객센터 링크 시험 — 환경값 VITE_SUPPORT_URL이 있을 때 로그인·아이디 찾기·비번 재설정 요청 화면 (2026-11-16 결정 여섯째 1)
// 목록 A11a 모바일 A11-M-009, A11b 모바일 A11-M-513~514 (값 없을 때는 a11e-support-link-off.test.js — 환경값은 파일마다 한 번만 읽혀서 따로 둠)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"

const SUPPORT = "https://example.com/support"

// 빌드 환경값 흉내: 고객센터 주소를 넣음 (src·a00-kit보다 먼저 정해야 해서 아래는 전부 await import)
globalThis.__TEST_IMPORT_META_ENV = { DEV: false, PROD: true, MODE: "test", BASE_URL: "/", VITE_API_BASE_URL: "http://api.test", VITE_SUPPORT_URL: SUPPORT }

await import("./a00-kit.mjs")
const { fakeSocket, renderRoute, resetGame, serve } = await import("./a00-game.mjs")
const { default: LoginPage } = await import("@m/domains/auth/pages/LoginPage.jsx")
const { default: FindIdPage } = await import("@m/domains/auth/pages/FindIdPage.jsx")
const { default: PasswordResetRequestPage } = await import("@m/domains/auth/pages/PasswordResetRequestPage.jsx")
const { LINK_CLASS } = await import("@m/domains/auth/components/login/ui/styles.js")

let view = null
afterEach(() => { resetGame(view); view = null })

// '고객센터' 글 링크가 하나, 그 주소·새 창·로그인 글자 링크와 같은 모양
function assertSupportLink(where) {
  const links = [...document.querySelectorAll("a")].filter((a) => a.textContent.trim() === "고객센터")
  assert.equal(links.length, 1, `${where}: 고객센터 링크 수`)
  assert.equal(links[0].getAttribute("href"), SUPPORT, where)
  assert.equal(links[0].getAttribute("target"), "_blank", where)
  assert.equal(links[0].getAttribute("rel"), "noopener noreferrer", where)
  assert.equal(links[0].className, LINK_CLASS, `${where} class`)
}

test("A11-M-009 모바일 로그인 화면에 '고객센터' 링크 (그 주소·새 창·글자 링크 모양)", async () => {
  serve({ "GET /auth/terms": { status: 200, body: { success: true, data: { terms: [] } } } })
  view = await renderRoute(fakeSocket(), React.createElement(LoginPage), { path: "/login" })
  assertSupportLink("로그인")
})

test("A11-M-513 모바일 아이디 찾기 화면에 '고객센터' 링크", async () => {
  view = await renderRoute(fakeSocket(), React.createElement(FindIdPage), { path: "/find-id" })
  assertSupportLink("아이디 찾기")
})

test("A11-M-514 모바일 비번 재설정 요청 화면에 '고객센터' 링크", async () => {
  view = await renderRoute(fakeSocket(), React.createElement(PasswordResetRequestPage), { path: "/password-reset/request" })
  assertSupportLink("비번 재설정 요청")
})
