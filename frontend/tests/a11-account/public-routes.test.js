// 로그인 화면에서 찾기 화면 가는 길 + 로그아웃 상태로 찾기·재설정 주소를 열어도 안 튕김 (진짜 앱 경로 표로 그림)
// 목록 A11b 화면 부품 A11-F-722~726
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup, act } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { installFetch, flushUi, resetStores } = await import("./a11Kit.mjs")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")
const { router } = await import("../../src/app/routes/index.jsx")

const TOKEN = "TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"

// 로그아웃 + 세션 확인 끝난 상태 (보호 화면이면 /login으로 보내는 상태)
test.beforeEach(() => {
  resetStores()
  useAuthStore.setState({ sessionBootstrap: "done", loggedOutIntentionally: true })
  installFetch({
    "GET /auth/password-reset/verify": { status: 200, body: { ok: true, status: "VALID" } },
  })
})
test.afterEach(() => cleanup())

// 진짜 경로 표를 그리고 주소로 감
async function openAt(path) {
  render(React.createElement(RouterProvider, { router }))
  await act(async () => { await router.navigate(path) })
  await flushUi()
  return () => router.state.location.pathname
}

test("A11-F-722 로그인 화면 '아이디 찾기' → /find-id", async () => {
  const path = await openAt("/login")
  fireEvent.click(screen.getByRole("link", { name: "아이디 찾기" }))
  await flushUi()
  assert.equal(path(), "/find-id")
})

test("A11-F-723 로그인 화면 '비밀번호 찾기' → /password-reset/request", async () => {
  const path = await openAt("/login")
  fireEvent.click(screen.getByRole("link", { name: "비밀번호 찾기" }))
  await flushUi()
  assert.equal(path(), "/password-reset/request")
})

test("A11-F-724 로그아웃 상태로 /find-id → 그 화면 그대로", async () => {
  // 준비: 같은 상태에서 보호 화면은 /login으로 감 (문지기가 켜져 있음)
  const guard = await openAt("/mypage")
  assert.equal(guard(), "/login", "준비: 보호 화면은 튕김")
  cleanup()
  const path = await openAt("/find-id")
  assert.equal(path(), "/find-id")
  assert.ok(screen.getByRole("button", { name: "아이디 찾기" }))
})

test("A11-F-725 로그아웃 상태로 /password-reset/request → 그 화면 그대로", async () => {
  const path = await openAt("/password-reset/request")
  assert.equal(path(), "/password-reset/request")
  assert.ok(screen.getByRole("button", { name: "재설정 링크 보내기" }))
})

test("A11-F-726 로그아웃 상태로 /password-reset?token=<43자> → 그 화면 그대로", async () => {
  assert.equal(TOKEN.length, 43)
  const path = await openAt(`/password-reset?token=${TOKEN}`)
  assert.equal(path(), "/password-reset")
  assert.ok(screen.getByLabelText("8~64자 비밀번호"))
})
