// 비밀번호 바꾸기 상태 시험 (훅 usePasswordForm: 빈칸·성공 뒤 1.5초 안내·로그인 화면으로·서버 거절 문구)
// 목록 A11b 화면 상태 A11-F-550~557
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { act, cleanup } = await import("@testing-library/react")
const { installFetch, HOLD, flushUi, submitEvent, renderRoutes, signIn, resetStores } = await import("./a11Kit.mjs")
const { usePasswordForm } = await import("../../src/domains/user/hooks/usePasswordForm.js")
const { forceRelogin } = await import("../../src/shared/utils/forceRelogin.js")
const { useAuthStore } = await import("../../src/domains/auth/store/auth.store.js")

const PATH = "/user/me/password"
const OLD_PW = "TestOnly-Old-1"
const NEW_PW = "TestOnly-New-1"
const SUCCESS = { status: 200, body: { success: true, message: "비밀번호가 변경되었습니다.", reloginRequired: true } }

test.afterEach(() => { cleanup(); resetStores() })

// /account 화면에 훅을 붙여 그림 (다시 로그인은 진짜 forceRelogin에 라우터 이동만 넣음)
function mountAt(answer) {
  const net = installFetch({ [`PATCH ${PATH}`]: answer })
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
  return { net, box, view }
}

// 칸 넣기 (확인 칸은 새 비번과 같게 넣음 — 다르면 안 보내는 것은 a11e-password-section 시험이 봄)
function fill(box, currentPassword, newPassword) {
  act(() => box.form.handlePwChange({ target: { name: "currentPassword", value: currentPassword } }))
  act(() => box.form.handlePwChange({ target: { name: "newPassword", value: newPassword } }))
  act(() => box.form.handlePwChange({ target: { name: "newPasswordConfirm", value: newPassword } }))
}

// 보내기 + 답 반영
async function submit(box) {
  await act(async () => { await box.form.handlePasswordSubmit(submitEvent()) })
}

test("A11-F-550 빈 칸 → 서버 안 부름", async () => {
  const { net, box } = mountAt(SUCCESS)
  fill(box, OLD_PW, "")
  await submit(box)
  fill(box, "", NEW_PW)
  await submit(box)
  assert.equal(net.to("PATCH", PATH).length, 0)
})

test("A11-F-551 성공(reloginRequired) → '비밀번호가 변경되었습니다. 다시 로그인해 주세요.'", async () => {
  const { box } = mountAt(SUCCESS)
  fill(box, OLD_PW, NEW_PW)
  await submit(box)
  assert.equal(box.form.pwMsg?.text, "비밀번호가 변경되었습니다. 다시 로그인해 주세요.")
})

test("A11-F-552 가짜 시계 1.49초엔 아직 /account", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  t.after(() => t.mock.timers.reset())
  const { box, view } = mountAt(SUCCESS)
  fill(box, OLD_PW, NEW_PW)
  await submit(box)
  act(() => t.mock.timers.tick(1490))
  assert.equal(view.path(), "/account")
})

test("A11-F-553 1.5초 뒤 /login", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  t.after(() => t.mock.timers.reset())
  const { box, view } = mountAt(SUCCESS)
  fill(box, OLD_PW, NEW_PW)
  await submit(box)
  act(() => t.mock.timers.tick(1490))
  assert.equal(view.path(), "/account", "준비: 아직")
  act(() => t.mock.timers.tick(10))
  t.mock.timers.reset()
  await flushUi()
  assert.equal(view.path(), "/login")
})

test("A11-F-554 400 CURRENT_PASSWORD_INVALID → 서버 문구, /login 안 감, 로그인 정보 그대로", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  t.after(() => t.mock.timers.reset())
  const { box, view } = mountAt({
    status: 400,
    body: { success: false, code: "CURRENT_PASSWORD_INVALID", message: "현재 비밀번호가 올바르지 않습니다." },
  })
  fill(box, "TestOnly-Wrong-1", NEW_PW)
  await submit(box)
  act(() => t.mock.timers.tick(3000))
  t.mock.timers.reset()
  await flushUi()
  assert.equal(box.form.pwMsg?.text, "현재 비밀번호가 올바르지 않습니다.")
  assert.equal(view.path(), "/account")
  assert.equal(useAuthStore.getState().isLoggedIn, true)
  assert.equal(useAuthStore.getState().user?.uuid, "u-a11")
})

test("A11-F-555 429 → 서버 문구", async () => {
  const text = "현재 비밀번호를 여러 번 잘못 입력했습니다. 잠시 후 다시 시도해주세요."
  const { box } = mountAt({ status: 429, body: { success: false, code: "PASSWORD_CHANGE_LOCKED", message: text } })
  fill(box, OLD_PW, NEW_PW)
  await submit(box)
  assert.equal(box.form.pwMsg?.text, text)
})

test("A11-F-556 규칙 400 → 서버 규칙 문구", async () => {
  const text = "비밀번호는 8~64자여야 합니다."
  const { box } = mountAt({ status: 400, body: { success: false, message: text } })
  fill(box, OLD_PW, "TestOnly-New-1")
  await submit(box)
  assert.equal(box.form.pwMsg?.text, text)
})

test("A11-F-557 같은 순간 두 번 누름 → 요청 1번", async () => {
  const { net, box } = mountAt(HOLD)
  fill(box, OLD_PW, NEW_PW)
  act(() => {
    box.form.handlePasswordSubmit(submitEvent())
    box.form.handlePasswordSubmit(submitEvent())
  })
  await flushUi()
  assert.equal(net.to("PATCH", PATH).length, 1)
  await net.release("PATCH", PATH, SUCCESS)
})
