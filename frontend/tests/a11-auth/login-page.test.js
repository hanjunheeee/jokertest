// 로그인 화면 부품 시험 — 칸 구성·자동 완성 이름·비번 보기·로그인 유지·소셜 단추 주소·실패 줄·보내는 중·가입 바꾸기
// 목록 A11a 화면 부품 A11-F-201~215, A11-F-275 (jsdom에 진짜 로그인 화면을 그림, 서버는 가짜 답)
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, rtl, EMAIL, PW, TERMS, alerts, serve, sent, deferred, resetAll, settle, renderRoutes, fakeLocation,
} from "./a11Kit.mjs"

const { default: LoginPage } = await import("../../src/domains/auth/pages/LoginPage.jsx")
const { default: FindIdPage } = await import("../../src/domains/auth/pages/FindIdPage.jsx")

const { screen, fireEvent } = rtl

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

function renderLogin(at = "/login") {
  return renderRoutes([
    { path: "/login", element: h(LoginPage) },
    { path: "/find-id", element: h(FindIdPage) },
    { path: "/lobby", element: h("p", null, "로비 화면") },
  ], { at })
}
const emailInput = () => screen.getByLabelText("이메일을 입력하세요")
const passwordInput = () => screen.getByLabelText("비밀번호를 입력하세요")
const loginButton = () => screen.getByRole("button", { name: "로그인" })
async function click(el) { await rtl.act(async () => { fireEvent.click(el) }) }
function type(el, value) { rtl.act(() => { fireEvent.change(el, { target: { value } }) }) }

test("A11-F-201 로그인 칸 구성: 이메일·비번 칸, 로그인 상태 유지, 로그인 단추, Google·Discord 단추, 비번 찾기 길", () => {
  renderLogin()
  assert.ok(emailInput())
  assert.ok(passwordInput())
  assert.ok(screen.getByRole("checkbox", { name: "로그인 상태 유지" }))
  assert.ok(loginButton())
  assert.ok(screen.getByRole("button", { name: "Google 로그인" }))
  assert.ok(screen.getByRole("button", { name: "Discord 로그인" }))
  assert.equal(screen.getByRole("link", { name: "비밀번호 찾기" }).getAttribute("href"), "/password-reset/request")
})

test("A11-F-202 로그인 이메일 칸 autoComplete = email", () => {
  renderLogin()
  assert.equal(emailInput().getAttribute("autocomplete"), "email")
})

test("A11-F-203 로그인 비번 칸 autoComplete = current-password", () => {
  renderLogin()
  assert.equal(passwordInput().getAttribute("autocomplete"), "current-password")
})

test("A11-F-204 비번 보기 단추 누름 → 칸 type text + 단추 이름 \"비밀번호 숨기기\"", async () => {
  renderLogin()
  await click(screen.getByRole("button", { name: "비밀번호 보기" }))
  assert.equal(passwordInput().getAttribute("type"), "text")
  assert.ok(screen.getByRole("button", { name: "비밀번호 숨기기" }))
})

test("A11-F-205 다시 누름 → 칸 type password + 단추 이름 \"비밀번호 보기\"", async () => {
  renderLogin()
  await click(screen.getByRole("button", { name: "비밀번호 보기" }))
  await click(screen.getByRole("button", { name: "비밀번호 숨기기" }))
  assert.equal(passwordInput().getAttribute("type"), "password")
  assert.ok(screen.getByRole("button", { name: "비밀번호 보기" }))
})

test("A11-F-206 로그인 유지 체크 상자 누름 → aria-checked true", async () => {
  renderLogin()
  const box = screen.getByRole("checkbox", { name: "로그인 상태 유지" })
  assert.equal(box.getAttribute("aria-checked"), "false")
  await click(box)
  assert.equal(screen.getByRole("checkbox", { name: "로그인 상태 유지" }).getAttribute("aria-checked"), "true")
})

test("A11-F-207 다시 누름 → aria-checked false", async () => {
  renderLogin()
  await click(screen.getByRole("checkbox", { name: "로그인 상태 유지" }))
  await click(screen.getByRole("checkbox", { name: "로그인 상태 유지" }))
  assert.equal(screen.getByRole("checkbox", { name: "로그인 상태 유지" }).getAttribute("aria-checked"), "false")
})

// 소셜 단추 누름 → 페이지째 간 주소
async function socialTarget(buttonName, remember) {
  renderLogin()
  if (remember) await click(screen.getByRole("checkbox", { name: "로그인 상태 유지" }))
  const location = fakeLocation("/login")
  await click(screen.getByRole("button", { name: buttonName }))
  assert.equal(location.assigned.length, 1)
  return location.assigned[0]
}

test("A11-F-208 Google (유지 끔) → …/auth/google?rememberMe=false", async () => {
  assert.match(await socialTarget("Google 로그인", false), /\/auth\/google\?rememberMe=false$/)
})

test("A11-F-209 Google (유지 켬) → rememberMe=true", async () => {
  assert.match(await socialTarget("Google 로그인", true), /\/auth\/google\?rememberMe=true$/)
})

test("A11-F-210 Discord (유지 켬) → …/auth/discord?rememberMe=true", async () => {
  assert.match(await socialTarget("Discord 로그인", true), /\/auth\/discord\?rememberMe=true$/)
})

test("A11-F-211 /login?socialError=OAUTH_CANCELLED → 화면에 \"소셜 로그인을 취소했습니다.\"(role=alert)", () => {
  renderLogin("/login?socialError=OAUTH_CANCELLED")
  assert.equal(screen.getByRole("alert").textContent.trim(), "소셜 로그인을 취소했습니다.")
})

test("A11-F-212 다른 화면(아이디 찾기) 갔다 오면 주소에서 socialError 지워짐, 실패 줄 없음", async () => {
  const { router } = renderLogin("/login?socialError=OAUTH_CANCELLED")
  await click(screen.getByRole("link", { name: "아이디 찾기" }))
  assert.equal(router.state.location.pathname, "/find-id")
  await click(screen.getByRole("button", { name: "뒤로 가기" }))
  assert.equal(router.state.location.pathname, "/login")
  assert.equal(new URLSearchParams(router.state.location.search).get("socialError"), null)
  assert.equal(screen.queryByText("소셜 로그인을 취소했습니다."), null)
})

test("A11-F-213 로그인 누름 → 답 오기 전 로그인 단추 disabled [지금 동작]", async () => {
  const late = deferred()
  serve({ "POST /auth/login": late.promise })
  renderLogin()
  type(emailInput(), EMAIL)
  type(passwordInput(), PW)
  await click(loginButton())
  await settle(2)
  const disabled = loginButton().disabled
  late.resolve({ status: 401, body: { success: false, message: "이메일 또는 비밀번호가 일치하지 않습니다." } })
  await settle()
  assert.equal(disabled, true)
})

test("A11-F-214 로그인 401 알림 뒤 → 이메일 칸 값 그대로, 로그인 화면 그대로", async () => {
  serve({ "POST /auth/login": { status: 401, body: { success: false, message: "이메일 또는 비밀번호가 일치하지 않습니다." } } })
  fakeLocation("/login")
  const { router } = renderLogin()
  type(emailInput(), EMAIL)
  type(passwordInput(), PW)
  await click(loginButton())
  await settle()
  assert.deepEqual(alerts, ["이메일 또는 비밀번호가 일치하지 않습니다."])
  assert.equal(emailInput().value, EMAIL)
  assert.equal(router.state.location.pathname, "/login")
  assert.ok(loginButton())
})

test("A11-F-215 \"회원가입\" 누름 → 가입 칸 / 가입 칸 \"로그인하기\" 누름 → 로그인 칸", async () => {
  serve({ "GET /auth/terms": { status: 200, body: { success: true, data: { terms: TERMS } } } })
  renderLogin()
  await click(screen.getByRole("button", { name: "회원가입" }))
  await settle()
  assert.ok(screen.getByRole("button", { name: "이메일 중복확인" }))
  assert.equal(screen.queryByRole("button", { name: "로그인" }), null)
  await click(screen.getByRole("button", { name: "로그인하기" }))
  assert.ok(loginButton())
  assert.equal(screen.queryByRole("button", { name: "이메일 중복확인" }), null)
})

test("A11-F-275 이메일·비번 빈 채 로그인 → 서버 문구 \"이메일과 비밀번호를 입력해주세요.\" 알림", async () => {
  serve({ "POST /auth/login": { status: 400, body: { success: false, message: "이메일과 비밀번호를 입력해주세요." } } })
  renderLogin()
  await click(loginButton())
  await settle()
  assert.equal(sent("POST", "/auth/login").length, 1)
  assert.deepEqual(alerts, ["이메일과 비밀번호를 입력해주세요."])
})
