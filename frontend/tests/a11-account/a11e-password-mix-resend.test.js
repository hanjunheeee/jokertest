// 비번 영문+숫자 규칙(비번 바꾸기·재설정 화면 미리 검사)·재설정 메일 "다시 보내기" 1분 기다림·밀려난 링크 안내 시험
// 목록 A11b 화면 A11-F-798~820 (2026-11-16 결정 다섯째 2·3)
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { renderHook, act, cleanup, screen, fireEvent, render } = await import("@testing-library/react")
const { installFetch, flushUi, submitEvent, renderRoutes, resetStores } = await import("./a11Kit.mjs")
const { usePasswordForm } = await import("../../src/domains/user/hooks/usePasswordForm.js")
const { useResetPage } = await import("../../src/domains/auth/hooks/recovery/useResetPage.js")
const { useResetRequest } = await import("../../src/domains/auth/hooks/recovery/useResetRequest.js")
const { PasswordResetRequestPage, PasswordResetPage } = await import("../../src/domains/auth/pages/PasswordResetPage.jsx")
const { default: PasswordSection } = await import("../../src/domains/user/components/AccountPanel/PasswordSection.jsx")
const { REQUEST_TEXT, RESET_TEXT } = await import("../../src/domains/auth/constants/recoveryMessages.js")

const CHANGE = "/user/me/password"
const REQUEST = "/auth/password-reset/request"
const VERIFY = "/auth/password-reset/verify"
const CONFIRM = "/auth/password-reset/confirm"
const TOKEN = "TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"
const EMAIL = "reset-user@example.com"
const OLD_PW = "TestOnly-Old-1"
const MIX_MESSAGE = "비밀번호는 영문과 숫자를 모두 포함해야 합니다."
const VALID = { status: 200, body: { ok: true, status: "VALID" } }
const T0 = Date.UTC(2026, 10, 16, 3, 0, 0)

test.afterEach(() => { cleanup(); resetStores() })

// 길이·바이트는 다 맞고 글자 종류만 다른 값 (거절 3 · 통과 3)
const REJECTED = [["영문만 8자", "abcdefgh"], ["숫자만 8자", "12345678"], ["한글만 8자", "가면무도회살인사"]]
const ACCEPTED = [["영문+숫자 8자", "abcdefg1"], ["영문+숫자+기호", "Mask-2026!"], ["한글+영문 1+숫자 1", "가면무도회살a1"]]

// 가짜 시계 (1초 단위 다시 그림·지금 시각)
function useClock(t) {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: T0 })
  t.after(() => t.mock.timers.reset())
  return (ms) => act(() => t.mock.timers.tick(ms))
}

// ── 비번 바꾸기 미리 검사 (798~803) ──

async function changeWith(newPassword) {
  const net = installFetch({ [`PATCH ${CHANGE}`]: { status: 200, body: { success: true, reloginRequired: true } } })
  const hook = renderHook(() => usePasswordForm({ onReloginRequired: () => {} }))
  for (const [name, value] of [["currentPassword", OLD_PW], ["newPassword", newPassword], ["newPasswordConfirm", newPassword]]) {
    act(() => hook.result.current.handlePwChange({ target: { name, value } }))
  }
  await act(async () => { await hook.result.current.handlePasswordSubmit(submitEvent()) })
  return { net, hook }
}

REJECTED.forEach(([name, pw], i) => {
  test(`A11-F-${798 + i} 비번 바꾸기 새 비번 ${name} → 요청 0번 + "${MIX_MESSAGE}"`, async () => {
    const { net, hook } = await changeWith(pw)
    assert.equal(net.to("PATCH", CHANGE).length, 0)
    assert.deepEqual(hook.result.current.pwMsg, { type: "error", text: MIX_MESSAGE })
  })
})

ACCEPTED.forEach(([name, pw], i) => {
  test(`A11-F-${801 + i} 비번 바꾸기 새 비번 ${name} → 요청 1번, 보낸 새 비번 그대로`, async () => {
    const { net } = await changeWith(pw)
    const sent = net.to("PATCH", CHANGE)
    assert.equal(sent.length, 1)
    assert.deepEqual(sent[0].body, { currentPassword: OLD_PW, newPassword: pw })
  })
})

// ── 재설정 새 비번 미리 검사 (804~809) ──

async function resetWith(pw) {
  const net = installFetch({ [`GET ${VERIFY}`]: VALID, [`POST ${CONFIRM}`]: { status: 200, body: { ok: true } } })
  const hook = renderHook(() => useResetPage(TOKEN))
  await flushUi()
  assert.equal(hook.result.current.status, "ready", "준비: 링크 확인 끝")
  act(() => hook.result.current.setPassword(pw))
  act(() => hook.result.current.setPasswordConfirm(pw))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  return { net, hook }
}

REJECTED.forEach(([name, pw], i) => {
  test(`A11-F-${804 + i} 재설정 새 비번 ${name} → 서버 안 부름 + "${MIX_MESSAGE}"`, async () => {
    const { net, hook } = await resetWith(pw)
    assert.equal(net.to("POST", CONFIRM).length, 0)
    assert.equal(hook.result.current.formError, MIX_MESSAGE)
  })
})

ACCEPTED.forEach(([name, pw], i) => {
  test(`A11-F-${807 + i} 재설정 새 비번 ${name} → 저장 요청 1번, 끝(done)`, async () => {
    const { net, hook } = await resetWith(pw)
    assert.equal(net.to("POST", CONFIRM).length, 1)
    assert.deepEqual(net.to("POST", CONFIRM)[0].body, { token: TOKEN, newPassword: pw })
    assert.equal(hook.result.current.status, "done")
  })
})

// ── 다시 보내기 1분 기다림: 훅 (810~812) ──

async function sentHook() {
  const net = installFetch({ [`POST ${REQUEST}`]: { status: 200, body: { ok: true } } })
  const hook = renderHook(() => useResetRequest())
  act(() => hook.result.current.setEmail(EMAIL))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  assert.equal(hook.result.current.status, "sent", "준비: 보냄")
  return { net, hook }
}

async function resend(hook) {
  act(() => hook.result.current.handleResend())
  await flushUi()
}

test("A11-F-810 보낸 직후 남은 초 60, '다시 보내기' → 요청 안 나감", async (t) => {
  useClock(t)
  const { net, hook } = await sentHook()
  assert.equal(hook.result.current.resendWaitSec, 60)
  await resend(hook)
  assert.equal(net.to("POST", REQUEST).length, 1)
})

test("A11-F-811 59초 뒤 남은 초 1, '다시 보내기' → 요청 안 나감", async (t) => {
  const tick = useClock(t)
  const { net, hook } = await sentHook()
  for (let i = 0; i < 59; i += 1) tick(1000)
  assert.equal(hook.result.current.resendWaitSec, 1)
  await resend(hook)
  assert.equal(net.to("POST", REQUEST).length, 1)
})

test("A11-F-812 60초 뒤 남은 초 0, '다시 보내기' → 요청 1번 더, 남은 초 다시 60", async (t) => {
  const tick = useClock(t)
  const { net, hook } = await sentHook()
  for (let i = 0; i < 60; i += 1) tick(1000)
  assert.equal(hook.result.current.resendWaitSec, 0)
  await resend(hook)
  assert.equal(net.to("POST", REQUEST).length, 2)
  assert.deepEqual(net.to("POST", REQUEST)[1].body, { email: EMAIL })
  assert.equal(hook.result.current.resendWaitSec, 60)
})

// ── 다시 보내기 1분 기다림: 화면 (813~815) ──

async function sentPage() {
  installFetch({ [`POST ${REQUEST}`]: { status: 200, body: { ok: true } } })
  renderRoutes([
    { path: "/password-reset/request", element: React.createElement(PasswordResetRequestPage) },
  ], { entries: ["/password-reset/request"] })
  fireEvent.change(screen.getByRole("textbox", { name: "가입할 때 등록한 이메일을 입력하세요" }), { target: { value: EMAIL } })
  fireEvent.click(screen.getByRole("button", { name: "재설정 링크 보내기" }))
  await flushUi()
}

test("A11-F-813 보낸 직후 '다시 보내기' 단추 꺼짐 + '60초 뒤 다시 보낼 수 있습니다.'", async (t) => {
  useClock(t)
  await sentPage()
  assert.equal(screen.getByRole("button", { name: "다시 보내기" }).matches(":disabled"), true)
  assert.ok(screen.getByText("60초 뒤 다시 보낼 수 있습니다."))
})

test("A11-F-814 60초 지나면 '다시 보내기' 켜지고 남은 초 글 없음", async (t) => {
  const tick = useClock(t)
  await sentPage()
  tick(30 * 1000)
  assert.ok(screen.getByText("30초 뒤 다시 보낼 수 있습니다."), "준비: 30초 남음")
  tick(30 * 1000)
  assert.equal(screen.getByRole("button", { name: "다시 보내기" }).matches(":disabled"), false)
  assert.equal(screen.queryByText(/초 뒤 다시 보낼 수 있습니다\./), null)
})

test("A11-F-815 접수 안내 글에 '가장 최근에 받은 메일의 링크만 쓸 수 있어요'", async () => {
  await sentPage()
  assert.equal(screen.getByRole("status").textContent, REQUEST_TEXT.sent)
  assert.match(REQUEST_TEXT.sent, /여러 번 요청했다면 가장 최근에 받은 메일의 링크만 쓸 수 있어요\./)
})

// ── 밀려난 링크 (816~818) ──

test("A11-F-816 링크 확인 SUPERSEDED → 잘못된 링크(linkInvalid) + 까닭 SUPERSEDED", async () => {
  installFetch({ [`GET ${VERIFY}`]: { status: 200, body: { ok: false, code: "SUPERSEDED" } } })
  const hook = renderHook(() => useResetPage(TOKEN))
  await flushUi()
  assert.equal(hook.result.current.status, "linkInvalid")
  assert.equal(hook.result.current.linkInvalidReason, "SUPERSEDED")
})

test("A11-F-817 저장 400 SUPERSEDED → 잘못된 링크(linkInvalid) + 까닭 SUPERSEDED", async () => {
  installFetch({ [`GET ${VERIFY}`]: VALID, [`POST ${CONFIRM}`]: { status: 400, body: { ok: false, code: "SUPERSEDED" } } })
  const hook = renderHook(() => useResetPage(TOKEN))
  await flushUi()
  act(() => hook.result.current.setPassword("TestOnly-Pass-1"))
  act(() => hook.result.current.setPasswordConfirm("TestOnly-Pass-1"))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  assert.equal(hook.result.current.status, "linkInvalid")
  assert.equal(hook.result.current.linkInvalidReason, "SUPERSEDED")
})

test("A11-F-818 밀려난 링크 화면 → 최근 메일 링크 안내 글 + '다시 요청하기' → 요청 화면", async () => {
  installFetch({ [`GET ${VERIFY}`]: { status: 200, body: { ok: false, code: "SUPERSEDED" } } })
  const view = renderRoutes([
    { path: "/password-reset", element: React.createElement(PasswordResetPage) },
    { path: "/password-reset/request", element: React.createElement("p", null, "재설정 요청 화면") },
  ], { entries: [`/password-reset?token=${TOKEN}`] })
  await flushUi()
  assert.equal(screen.getByRole("alert").textContent, RESET_TEXT.linkSuperseded)
  assert.match(RESET_TEXT.linkSuperseded, /새로 요청하셨다면 가장 최근에 받은 메일의 링크를 사용해주세요\./)
  fireEvent.click(screen.getByRole("button", { name: "다시 요청하기" }))
  await flushUi()
  assert.equal(view.path(), "/password-reset/request")
})

// ── 안내 글 (819~820) ──

test("A11-F-819 재설정 새 비번 칸 안내 '8~64자 비밀번호 (영문·숫자 포함)'", async () => {
  installFetch({ [`GET ${VERIFY}`]: VALID })
  renderRoutes([{ path: "/password-reset", element: React.createElement(PasswordResetPage) }], { entries: [`/password-reset?token=${TOKEN}`] })
  await flushUi()
  assert.equal(document.querySelector("input[name='password']").getAttribute("placeholder"), "8~64자 비밀번호 (영문·숫자 포함)")
})

test("A11-F-820 비번 바꾸기 새 비번 칸 안내 '새 비밀번호 (8~64자, 영문·숫자 포함)'", () => {
  render(React.createElement(PasswordSection, {
    account: { hasLocalPassword: true },
    pwForm: { currentPassword: "", newPassword: "", newPasswordConfirm: "" },
    handlePwChange: () => {}, pwMsg: null, pwLoading: false, onSubmit: () => {},
  }))
  assert.equal(document.querySelector("input[name='newPassword']").getAttribute("placeholder"), "새 비밀번호 (8~64자, 영문·숫자 포함)")
})
