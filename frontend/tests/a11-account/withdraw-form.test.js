// 회원 탈퇴 상태 시험 (훅 useWithdrawForm: 본인 확인 칸·빈칸·확인 창·두 번 누름·성공·거절 문구) + 끝난 뒤 로그인 정보 비움
// 목록 A11b 화면 상태 A11-F-558~569, A11-F-589~590
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { act, cleanup } = await import("@testing-library/react")
const { installFetch, HOLD, flushUi, submitEvent, renderRoutes, signIn, resetStores } = await import("./a11Kit.mjs")
const { useWithdrawForm } = await import("../../src/domains/user/hooks/member/useWithdrawForm.js")
const { usePasswordForm } = await import("../../src/domains/user/hooks/usePasswordForm.js")
const { forceRelogin } = await import("../../src/shared/utils/forceRelogin.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")

const PATH = "/user/me/withdraw"
const LOCAL = { email: "withdraw-user@example.com", hasLocalPassword: true }
const SOCIAL = { email: "social-user@example.com", hasLocalPassword: false }
const PW = "TestOnly-Pass-1"
const DONE = { status: 200, body: { success: true, message: "회원 탈퇴가 완료되었습니다." } }

test.afterEach(() => { cleanup(); resetStores() })

// /account 화면에 탈퇴 훅을 붙여 그림 (성공 뒤 이동은 진짜 forceRelogin에 라우터 이동만 넣음)
function mountAt(answer, account = LOCAL) {
  const net = installFetch({ [`POST ${PATH}`]: answer })
  signIn()
  const box = {}
  let router = null
  function Probe() {
    box.form = useWithdrawForm({ account, onWithdrawn: () => forceRelogin({ navigate: (to) => router.navigate(to) }) })
    return null
  }
  const view = renderRoutes([
    { path: "/account", element: React.createElement(Probe) },
    { path: "/login", element: React.createElement("p", null, "로그인 화면") },
  ], { entries: ["/account"] })
  router = view.router
  return { net, box, view }
}

// 본인 확인 칸 넣고 "탈퇴"(확인 창 열기)
function typeAndOpen(box, secret) {
  act(() => box.form.setSecret(secret))
  act(() => box.form.openConfirm(submitEvent()))
}

// 확인 창 "탈퇴하기" + 답 반영
async function confirm(box) {
  await act(async () => { await box.form.confirmWithdraw() })
  await flushUi()
}

test("A11-F-558 hasLocalPassword: true → 비번 칸 씀 (보내는 값이 password)", async () => {
  const { net, box } = mountAt(DONE, LOCAL)
  assert.equal(box.form.usesPassword, true)
  typeAndOpen(box, PW)
  await confirm(box)
  assert.deepEqual(net.to("POST", PATH)[0].body, { password: PW })
})

test("A11-F-559 hasLocalPassword: false → 이메일 칸 씀 (보내는 값이 confirmEmail)", async () => {
  const { net, box } = mountAt(DONE, SOCIAL)
  assert.equal(box.form.usesPassword, false)
  typeAndOpen(box, SOCIAL.email)
  await confirm(box)
  assert.deepEqual(net.to("POST", PATH)[0].body, { confirmEmail: SOCIAL.email })
})

test("A11-F-560 비번 계정 빈칸 → '비밀번호를 입력해주세요.', 서버 안 부름", async () => {
  const { net, box } = mountAt(DONE, LOCAL)
  typeAndOpen(box, "")
  assert.equal(box.form.msg?.text, "비밀번호를 입력해주세요.")
  assert.equal(box.form.confirmOpen, false)
  assert.equal(net.to("POST", PATH).length, 0)
})

test("A11-F-561 소셜 계정 빈칸 → '계정 이메일을 입력해주세요.', 서버 안 부름", async () => {
  const { net, box } = mountAt(DONE, SOCIAL)
  typeAndOpen(box, "   ")
  assert.equal(box.form.msg?.text, "계정 이메일을 입력해주세요.")
  assert.equal(net.to("POST", PATH).length, 0)
})

test("A11-F-562 '탈퇴' → 확인 창 열림, 요청 0", async () => {
  const { net, box } = mountAt(DONE)
  typeAndOpen(box, PW)
  assert.equal(box.form.confirmOpen, true)
  assert.equal(net.to("POST", PATH).length, 0)
})

test("A11-F-563 확인 창 닫기 → 요청 0", async () => {
  const { net, box } = mountAt(DONE)
  typeAndOpen(box, PW)
  act(() => box.form.closeConfirm())
  await flushUi()
  assert.equal(box.form.confirmOpen, false)
  assert.equal(net.to("POST", PATH).length, 0)
})

test("A11-F-564 '탈퇴하기' 두 번 눌러도 요청 1번", async () => {
  const { net, box } = mountAt(HOLD)
  typeAndOpen(box, PW)
  act(() => {
    box.form.confirmWithdraw()
    box.form.confirmWithdraw()
  })
  await flushUi()
  assert.equal(net.to("POST", PATH).length, 1)
  await net.release("POST", PATH, DONE)
})

test("A11-F-565 성공 → '회원 탈퇴가 완료되었습니다.' 뒤 /login", async () => {
  const { box, view } = mountAt(DONE)
  typeAndOpen(box, PW)
  await confirm(box)
  assert.equal(box.form.msg?.text, "회원 탈퇴가 완료되었습니다.")
  assert.equal(view.path(), "/login")
})

// 서버 거절: 서버가 보내는 그대로(상태·code·문구) → 화면 문구
const REJECTS = [
  ["566", 409, "WITHDRAW_IN_GAME", "진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다."],
  ["567", 400, "WITHDRAW_PASSWORD_INVALID", "비밀번호가 올바르지 않습니다."],
  ["568", 400, "WITHDRAW_CONFIRM_MISMATCH", "계정 이메일을 정확히 입력해주세요."],
  ["569", 429, "WITHDRAW_LOCKED", "여러 번 잘못 입력했습니다. 잠시 후 다시 시도해주세요."],
]
for (const [no, status, code, text] of REJECTS) {
  test(`A11-F-${no} ${code} → '${text}'`, async () => {
    const account = code === "WITHDRAW_CONFIRM_MISMATCH" ? SOCIAL : LOCAL
    const { box, view } = mountAt({ status, body: { success: false, code, message: text } }, account)
    typeAndOpen(box, account === SOCIAL ? "wrong-user@example.com" : PW)
    await confirm(box)
    assert.equal(box.form.msg?.text, text)
    assert.equal(box.form.msg?.type, "error")
    assert.equal(view.path(), "/account")
  })
}

test("A11-F-589 탈퇴 성공 → 로그인 정보(auth 스토어) 비고 /login", async () => {
  const { box, view } = mountAt(DONE)
  assert.equal(useAuthStore.getState().isLoggedIn, true, "준비: 로그인 상태")
  typeAndOpen(box, PW)
  await confirm(box)
  assert.equal(useAuthStore.getState().isLoggedIn, false)
  assert.equal(useAuthStore.getState().user, null)
  assert.equal(view.path(), "/login")
})

test("A11-F-590 비번 바꾸기 성공 → 1.5초 뒤 로그인 정보 비고 /login", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  t.after(() => t.mock.timers.reset())
  installFetch({ "PATCH /user/me/password": { status: 200, body: { success: true, message: "비밀번호가 변경되었습니다.", reloginRequired: true } } })
  signIn()
  const box = {}
  let router = null
  function Probe() {
    box.form = usePasswordForm({ onReloginRequired: () => forceRelogin({ navigate: (to) => router.navigate(to) }) })
    return null
  }
  const view = renderRoutes([
    { path: "/account", element: React.createElement(Probe) },
    { path: "/login", element: React.createElement("p", null, "로그인 화면") },
  ], { entries: ["/account"] })
  router = view.router
  act(() => box.form.handlePwChange({ target: { name: "currentPassword", value: PW } }))
  act(() => box.form.handlePwChange({ target: { name: "newPassword", value: "TestOnly-New-1" } }))
  // 확인 칸도 같은 값 (다르면 안 보냄 — a11e-password-section 시험이 봄)
  act(() => box.form.handlePwChange({ target: { name: "newPasswordConfirm", value: "TestOnly-New-1" } }))
  await act(async () => { await box.form.handlePasswordSubmit(submitEvent()) })
  assert.equal(useAuthStore.getState().isLoggedIn, true, "준비: 아직 로그인 상태")
  act(() => t.mock.timers.tick(1500))
  t.mock.timers.reset()
  await flushUi()
  assert.equal(useAuthStore.getState().isLoggedIn, false)
  assert.equal(useAuthStore.getState().user, null)
  assert.equal(view.path(), "/login")
})
