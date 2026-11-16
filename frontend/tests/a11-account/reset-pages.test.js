// 비밀번호 찾기 화면 부품 시험 (재설정 요청 화면·링크 도착 화면을 jsdom에 그려 글·단추·꺼짐 확인) + 글이 제자리에 보임
// 목록 A11b 화면 부품 A11-F-701~717, A11-F-757~763
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { screen, fireEvent, cleanup, within, act } = await import("@testing-library/react")
const { installFetch, HOLD, NETWORK_DOWN, flushUi, renderRoutes, signIn, resetStores } = await import("./a11Kit.mjs")
const { PasswordResetRequestPage, PasswordResetPage } = await import("../../src/domains/auth/pages/PasswordResetPage.jsx")
const { default: FindIdPage } = await import("../../src/domains/auth/pages/FindIdPage.jsx")
const { default: AccountPanel } = await import("../../src/domains/user/components/AccountPanel.jsx")
const { REQUEST_TEXT, RESET_TEXT, FIND_ID_TEXT } = await import("../../src/domains/auth/constants/recoveryMessages.js")

const REQUEST = "/auth/password-reset/request"
const VERIFY = "/auth/password-reset/verify"
const CONFIRM = "/auth/password-reset/confirm"
const TOKEN = "TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"
const GOOD_PW = "TestOnly-Pass-1"
const VALID = { status: 200, body: { ok: true, status: "VALID" } }

test.afterEach(() => { cleanup(); resetStores() })

// 화면 글 전체 (빈칸 하나로 모음)
const pageText = () => document.body.textContent.replace(/\s+/g, " ")

// 앞 요소가 문서에서 뒤 요소보다 먼저 나오는지 (칸 아래 글 확인)
const comesBefore = (a, b) => Boolean(a.compareDocumentPosition(b) & window.Node.DOCUMENT_POSITION_FOLLOWING)

// 재설정 요청 화면을 그리고 이메일을 넣어 보냄 (answer 없으면 안 보냄)
async function requestPage(answer, { email = "reset-user@example.com", send = true } = {}) {
  const net = installFetch({ [`POST ${REQUEST}`]: answer })
  const view = renderRoutes([
    { path: "/password-reset/request", element: React.createElement(PasswordResetRequestPage) },
    { path: "/login", element: React.createElement("p", null, "로그인 화면") },
  ], { entries: ["/password-reset/request"] })
  if (send) {
    fireEvent.change(screen.getByRole("textbox", { name: "가입할 때 등록한 이메일을 입력하세요" }), { target: { value: email } })
    fireEvent.click(screen.getByRole("button", { name: "재설정 링크 보내기" }))
    await flushUi()
  }
  return { net, view }
}

// 링크 도착 화면을 그림 (verify 답·confirm 답), 앞 주소 하나를 둬서 뒤로 가기를 볼 수 있게 함
async function resetPage(verifyAnswer, confirmAnswer = { status: 200, body: { ok: true } }) {
  const net = installFetch({ [`GET ${VERIFY}`]: verifyAnswer, [`POST ${CONFIRM}`]: confirmAnswer })
  const view = renderRoutes([
    { path: "/mail", element: React.createElement("p", null, "메일 화면") },
    { path: "/password-reset", element: React.createElement(PasswordResetPage) },
    { path: "/password-reset/request", element: React.createElement("p", null, "재설정 요청 화면") },
    { path: "/login", element: React.createElement("p", null, "로그인 화면") },
  ], { entries: ["/mail", `/password-reset?token=${TOKEN}`] })
  await flushUi()
  return { net, view }
}

// 새 비번 두 칸 넣고 "비밀번호 변경"
async function fillNewPassword(password, confirm = password) {
  fireEvent.change(screen.getByPlaceholderText("8~64자 비밀번호"), { target: { value: password } })
  fireEvent.change(screen.getByPlaceholderText("비밀번호를 다시 입력하세요"), { target: { value: confirm } })
  fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }))
  await flushUi()
}

// ── 재설정 요청 화면 ──

test("A11-F-701 첫 화면 → 이메일 칸 + 안내 글 + '재설정 링크 보내기'", async () => {
  await requestPage(null, { send: false })
  assert.ok(screen.getByRole("textbox", { name: "가입할 때 등록한 이메일을 입력하세요" }))
  assert.match(pageText(), /가입할 때 등록한 이메일로 비밀번호 재설정 링크를 보내드려요/)
  assert.ok(screen.getByRole("button", { name: "재설정 링크 보내기" }))
})

test("A11-F-702 보내는 중 → 단추 '전송 중'·꺼짐", async () => {
  await requestPage(HOLD)
  const button = screen.getByRole("button", { name: "전송 중" })
  assert.equal(button.matches(":disabled"), true)
})

test("A11-F-703 보냄(sent) → 접수 안내 글 + '다시 보내기'", async () => {
  await requestPage({ status: 200, body: { ok: true } })
  assert.equal(screen.getByRole("status").textContent, REQUEST_TEXT.sent)
  assert.ok(screen.getByRole("button", { name: "다시 보내기" }))
})

test("A11-F-704 rateLimited → 막힘 글", async () => {
  await requestPage({ status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  assert.ok(screen.getAllByRole("alert").some((el) => el.textContent === REQUEST_TEXT.rateLimited))
})

test("A11-F-705 failed → 실패 글 + '다시 입력'", async () => {
  await requestPage(NETWORK_DOWN)
  assert.ok(screen.getAllByRole("alert").some((el) => el.textContent === REQUEST_TEXT.failed))
  assert.ok(screen.getByRole("button", { name: "다시 입력" }))
})

// ── 링크 도착 화면 ──

test("A11-F-706 확인 중 → '링크를 확인하고 있어요'(role=status)", async () => {
  await resetPage(HOLD)
  assert.equal(screen.getByRole("status").textContent, "링크를 확인하고 있어요")
})

test("A11-F-707 ready → 새 비번·확인 두 칸 + 안내 '8~64자 비밀번호'", async () => {
  await resetPage(VALID)
  assert.ok(screen.getByLabelText("8~64자 비밀번호"))
  assert.ok(screen.getByLabelText("비밀번호를 다시 입력하세요"))
  assert.equal(document.querySelectorAll("input[name='password'], input[name='passwordConfirm']").length, 2)
})

test("A11-F-708 만료 → linkExpired 글 + '다시 요청하기'", async () => {
  await resetPage({ status: 200, body: { ok: false, code: "EXPIRED" } })
  assert.equal(screen.getByRole("alert").textContent, RESET_TEXT.linkExpired)
  assert.ok(screen.getByRole("button", { name: "다시 요청하기" }))
})

test("A11-F-709 사용됨 → linkUsed 글", async () => {
  await resetPage({ status: 200, body: { ok: false, code: "USED" } })
  assert.equal(screen.getByRole("alert").textContent, RESET_TEXT.linkUsed)
})

test("A11-F-710 잘못됨 → linkInvalid 글", async () => {
  await resetPage({ status: 200, body: { ok: false, code: "INVALID" } })
  assert.equal(screen.getByRole("alert").textContent, RESET_TEXT.linkInvalid)
})

test("A11-F-711 확인 실패 → '다시 확인' 단추", async () => {
  await resetPage({ status: 500, body: {} })
  assert.ok(screen.getByRole("button", { name: "다시 확인" }))
})

test("A11-F-712 done → 완료 글 + '로그인으로 이동'", async () => {
  await resetPage(VALID)
  await fillNewPassword(GOOD_PW)
  assert.equal(screen.getByRole("status").textContent, RESET_TEXT.done)
  assert.ok(screen.getByRole("button", { name: "로그인으로 이동" }))
})

test("A11-F-713 '로그인으로 이동' → /login, 뒤로 가기 해도 재설정 화면 안 옴", async () => {
  const { view } = await resetPage(VALID)
  await fillNewPassword(GOOD_PW)
  fireEvent.click(screen.getByRole("button", { name: "로그인으로 이동" }))
  await flushUi()
  assert.equal(view.path(), "/login")
  await act(async () => { await view.router.navigate(-1) })
  await flushUi()
  assert.notEqual(view.path(), "/password-reset")
})

test("A11-F-714 socialOnly → 소셜 안내 글", async () => {
  await resetPage(VALID, { status: 400, body: { ok: false, code: "SOCIAL_ONLY" } })
  await fillNewPassword(GOOD_PW)
  assert.equal(screen.getByRole("alert").textContent, RESET_TEXT.socialOnly)
})

test("A11-F-715 두 칸 type=password · autoComplete=new-password", async () => {
  await resetPage(VALID)
  for (const name of ["password", "passwordConfirm"]) {
    const input = document.querySelector(`input[name='${name}']`)
    assert.equal(input.getAttribute("type"), "password", `${name} 종류`)
    assert.equal(input.getAttribute("autocomplete"), "new-password", `${name} 자동 완성`)
  }
})

test("A11-F-716 보기 단추 누름 → type=text, 다시 → password", async () => {
  await resetPage(VALID)
  const input = document.querySelector("input[name='password']")
  const toggle = within(input.parentElement).getByRole("button")
  fireEvent.click(toggle)
  assert.equal(input.getAttribute("type"), "text")
  fireEvent.click(toggle)
  assert.equal(input.getAttribute("type"), "password")
})

test("A11-F-717 보기 단추 이름이 누를 때마다 바뀜", async () => {
  await resetPage(VALID)
  const input = document.querySelector("input[name='password']")
  const toggle = within(input.parentElement).getByRole("button")
  const first = toggle.getAttribute("aria-label")
  fireEvent.click(toggle)
  const second = toggle.getAttribute("aria-label")
  fireEvent.click(toggle)
  assert.notEqual(first, second)
  assert.equal(toggle.getAttribute("aria-label"), first)
  assert.deepEqual([first, second], ["비밀번호 보기", "비밀번호 숨기기"])
})

// ── 글이 제자리에 보임 ──

test("A11-F-757 재설정 7자 제출 → 칸 아래 규칙 글", async () => {
  await resetPage(VALID)
  await fillNewPassword("Test-07")
  const alert = screen.getByRole("alert")
  assert.match(alert.textContent, /^비밀번호는 8~64자/)
  assert.ok(comesBefore(document.querySelector("input[name='passwordConfirm']"), alert))
})

test("A11-F-758 확인 칸 다름 → '비밀번호 확인이 일치하지 않습니다.'", async () => {
  await resetPage(VALID)
  await fillNewPassword(GOOD_PW, `${GOOD_PW}x`)
  assert.equal(screen.getByRole("alert").textContent, "비밀번호 확인이 일치하지 않습니다.")
})

test("A11-F-759 저장 429 → confirmRateLimited 글", async () => {
  await resetPage(VALID, { status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  await fillNewPassword(GOOD_PW)
  assert.equal(screen.getByRole("alert").textContent, RESET_TEXT.confirmRateLimited)
})

test("A11-F-760 아이디 찾기 rateLimited → 막힘 글", async () => {
  installFetch({ "POST /auth/find-id": { status: 429, body: { ok: false, code: "RATE_LIMITED" } } })
  renderRoutes([{ path: "/find-id", element: React.createElement(FindIdPage) }], { entries: ["/find-id"] })
  fireEvent.change(screen.getByPlaceholderText("닉네임을 입력하세요"), { target: { value: "가면손님" } })
  fireEvent.change(document.querySelector("input[name='birthDate']"), { target: { value: "1999-04-17" } })
  fireEvent.click(screen.getByRole("button", { name: "아이디 찾기" }))
  await flushUi()
  assert.ok(screen.getAllByRole("alert").some((el) => el.textContent === FIND_ID_TEXT.rateLimited))
})

test("A11-F-761 재설정 요청 badInput → '입력하신 이메일을 다시 확인해주세요.'", async () => {
  await requestPage({ status: 400, body: { ok: false, code: "INVALID_INPUT" } })
  assert.ok(screen.getAllByRole("alert").some((el) => el.textContent === REQUEST_TEXT.badInput))
})

test("A11-F-762 링크 확인 verifyRateLimited 글 + '다시 확인'", async () => {
  await resetPage({ status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  assert.equal(screen.getByRole("alert").textContent, RESET_TEXT.verifyRateLimited)
  assert.ok(screen.getByRole("button", { name: "다시 확인" }))
})

test("A11-F-763 비번 바꾸기 성공 글 (계정 관리 화면)", async (t) => {
  // 성공 1.5초 뒤 로그인 화면으로 가는 예약이 진짜로 안 돌게 가짜 시계
  t.mock.timers.enable({ apis: ["setTimeout"] })
  t.after(() => t.mock.timers.reset())
  installFetch({
    "GET /user/me/account": { status: 200, body: { success: true, data: { email: "account-user@example.com", hasLocalPassword: true } } },
    "PATCH /user/me/password": { status: 200, body: { success: true, message: "비밀번호가 변경되었습니다.", reloginRequired: true } },
  })
  signIn()
  renderRoutes([{ path: "/account", element: React.createElement(AccountPanel) }], { entries: ["/account"] })
  const section = screen.getByRole("heading", { name: "비밀번호 변경" }).closest("section")
  fireEvent.change(section.querySelector("input[name='currentPassword']"), { target: { value: "TestOnly-Old-1" } })
  fireEvent.change(section.querySelector("input[name='newPassword']"), { target: { value: "TestOnly-New-1" } })
  await act(async () => {
    fireEvent.click(within(section).getByRole("button", { name: "변경" }))
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  })
  await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve() })
  assert.match(section.textContent, /비밀번호가 변경되었습니다\. 다시 로그인해 주세요\./)
})
