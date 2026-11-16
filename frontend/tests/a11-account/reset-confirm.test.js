// 새 비밀번호 저장 상태 시험 (훅 useResetPage: 규칙 검사·저장 요청·링크 문제·막힘) + 비밀값을 브라우저 저장소에 안 둠
// 목록 A11b 화면 상태 A11-F-525~538, A11-F-587~588
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { renderHook, act, cleanup, screen, fireEvent } = await import("@testing-library/react")
const { installFetch, HOLD, NETWORK_DOWN, flushUi, submitEvent, renderRoutes, storageDump } = await import("./a11Kit.mjs")
const { useResetPage } = await import("../../src/domains/auth/hooks/recovery/useResetPage.js")
const { RESET_TEXT } = await import("../../src/domains/auth/constants/recoveryMessages.js")
const { PasswordResetPage } = await import("../../src/domains/auth/pages/PasswordResetPage.jsx")
const { default: FindIdPage } = await import("../../src/domains/auth/pages/FindIdPage.jsx")

const VERIFY = "/auth/password-reset/verify"
const CONFIRM = "/auth/password-reset/confirm"
const TOKEN = "TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"
const GOOD_PW = "TestOnly-Pass-1"

test.afterEach(() => cleanup())

// 링크 확인은 늘 VALID, 저장 답만 바꿈 → ready 상태 훅
async function readyHook(confirmAnswer) {
  const net = installFetch({
    [`GET ${VERIFY}`]: { status: 200, body: { ok: true, status: "VALID" } },
    [`POST ${CONFIRM}`]: confirmAnswer,
  })
  const hook = renderHook(() => useResetPage(TOKEN))
  await flushUi()
  assert.equal(hook.result.current.status, "ready", "준비: 링크 확인 끝")
  return { net, hook }
}

// 두 칸에 넣고 저장 누름
async function fillAndSubmit(hook, password, confirm = password) {
  act(() => hook.result.current.setPassword(password))
  act(() => hook.result.current.setPasswordConfirm(confirm))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
}

// 규칙에 걸려 서버를 안 부르는 세 가지 (7자·65자·한글 25자)
for (const [no, label, pw] of [
  ["525", "7자", "Test-07"],
  ["526", "65자", "T".repeat(65)],
  ["527", "한글 25자", "가".repeat(25)],
]) {
  test(`A11-F-${no} 새 비번 ${label} → 규칙 문구, 서버 안 부름`, async () => {
    const { net, hook } = await readyHook({ status: 200, body: { ok: true } })
    await fillAndSubmit(hook, pw)
    assert.match(hook.result.current.formError, /^비밀번호는 /)
    assert.equal(net.to("POST", CONFIRM).length, 0)
  })
}

test("A11-F-528 확인 칸이 다름 → '비밀번호 확인이 일치하지 않습니다.', 서버 안 부름", async () => {
  const { net, hook } = await readyHook({ status: 200, body: { ok: true } })
  await fillAndSubmit(hook, GOOD_PW, `${GOOD_PW}x`)
  assert.equal(hook.result.current.formError, "비밀번호 확인이 일치하지 않습니다.")
  assert.equal(net.to("POST", CONFIRM).length, 0)
})

test("A11-F-529 검사 통과 → 저장(confirm) 요청 1번", async () => {
  const { net, hook } = await readyHook(HOLD)
  await fillAndSubmit(hook, GOOD_PW)
  assert.equal(net.to("POST", CONFIRM).length, 1)
  assert.deepEqual(net.to("POST", CONFIRM)[0].body, { token: TOKEN, newPassword: GOOD_PW })
})

test("A11-F-530 저장 보내는 중에 다시 누름 → 요청 더 안 감", async () => {
  const { net, hook } = await readyHook(HOLD)
  await fillAndSubmit(hook, GOOD_PW)
  act(() => hook.result.current.handleSubmit(submitEvent()))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  assert.equal(net.to("POST", CONFIRM).length, 1)
})

test("A11-F-531 서버 ok:true → 끝(done), 두 칸 비움", async () => {
  const { hook } = await readyHook({ status: 200, body: { ok: true } })
  await fillAndSubmit(hook, GOOD_PW)
  assert.equal(hook.result.current.status, "done")
  assert.equal(hook.result.current.password, "")
  assert.equal(hook.result.current.passwordConfirm, "")
})

for (const [no, code] of [["532", "EXPIRED"], ["533", "USED"], ["534", "INVALID"]]) {
  test(`A11-F-${no} 저장 답 ${code} → 잘못된 링크 + 사유 ${code}`, async () => {
    const { hook } = await readyHook({ status: 400, body: { ok: false, code } })
    await fillAndSubmit(hook, GOOD_PW)
    assert.equal(hook.result.current.status, "linkInvalid")
    assert.equal(hook.result.current.linkInvalidReason, code)
  })
}

test("A11-F-535 저장 답 SOCIAL_ONLY → 소셜 계정 안내(socialOnly)", async () => {
  const { hook } = await readyHook({ status: 400, body: { ok: false, code: "SOCIAL_ONLY" } })
  await fillAndSubmit(hook, GOOD_PW)
  assert.equal(hook.result.current.status, "socialOnly")
})

test("A11-F-536 저장 답 429 → confirmRateLimited 문구, 입력 그대로", async () => {
  const { hook } = await readyHook({ status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  await fillAndSubmit(hook, GOOD_PW)
  assert.equal(hook.result.current.formError, RESET_TEXT.confirmRateLimited)
  assert.equal(hook.result.current.password, GOOD_PW)
  assert.equal(hook.result.current.passwordConfirm, GOOD_PW)
})

test("A11-F-537 저장 중 망 끊김 → confirmRetry 문구, 입력 그대로", async () => {
  const { hook } = await readyHook(NETWORK_DOWN)
  await fillAndSubmit(hook, GOOD_PW)
  assert.equal(hook.result.current.formError, RESET_TEXT.confirmRetry)
  assert.equal(hook.result.current.password, GOOD_PW)
  assert.equal(hook.result.current.passwordConfirm, GOOD_PW)
})

test("A11-F-538 200인데 ok가 true 아님 → confirmRetry 문구", async () => {
  const { hook } = await readyHook({ status: 200, body: { ok: false } })
  await fillAndSubmit(hook, GOOD_PW)
  assert.equal(hook.result.current.formError, RESET_TEXT.confirmRetry)
  assert.notEqual(hook.result.current.status, "done")
})

test("A11-F-587 재설정 링크 화면 → token이 localStorage·sessionStorage에 없음", async () => {
  installFetch({
    [`GET ${VERIFY}`]: { status: 200, body: { ok: true, status: "VALID" } },
    [`POST ${CONFIRM}`]: { status: 200, body: { ok: true } },
  })
  renderRoutes([{ path: "/password-reset", element: React.createElement(PasswordResetPage) }], {
    entries: [`/password-reset?token=${TOKEN}`],
  })
  await flushUi()
  // 새 비번 넣고 저장까지 해 봄
  fireEvent.change(screen.getByPlaceholderText("8~64자 비밀번호"), { target: { value: GOOD_PW } })
  fireEvent.change(screen.getByPlaceholderText("비밀번호를 다시 입력하세요"), { target: { value: GOOD_PW } })
  fireEvent.click(screen.getByRole("button", { name: "비밀번호 변경" }))
  await flushUi()
  assert.match(document.body.textContent, /비밀번호가 재설정되었어요/, "준비: 저장 끝")
  const saved = storageDump()
  assert.equal(saved.includes(TOKEN), false)
  assert.equal(saved.includes(GOOD_PW), false)
})

test("A11-F-588 아이디 찾기 → 생년월일이 브라우저 저장소에 없음", async () => {
  installFetch({ "POST /auth/find-id": { status: 200, body: { ok: false, code: "NOT_FOUND" } } })
  renderRoutes([{ path: "/find-id", element: React.createElement(FindIdPage) }], { entries: ["/find-id"] })
  await flushUi()
  fireEvent.change(screen.getByPlaceholderText("닉네임을 입력하세요"), { target: { value: "가면손님" } })
  fireEvent.change(document.querySelector("input[name='birthDate']"), { target: { value: "1999-04-17" } })
  fireEvent.click(screen.getByRole("button", { name: "아이디 찾기" }))
  await flushUi()
  assert.match(document.body.textContent, /일치하는 계정을 찾을 수 없습니다/, "준비: 찾기 끝")
  const saved = storageDump()
  assert.equal(saved.includes("1999-04-17"), false)
  assert.equal(saved.includes("19990417"), false)
})
