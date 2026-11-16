// 비밀번호 재설정 메일 요청 화면 상태 시험 (훅 useResetRequest: 보내기·막힘·실패·다시 보내기)
// 목록 A11b 화면 상태 A11-F-501~510
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { installFetch, HOLD, NETWORK_DOWN, flushUi, submitEvent } = await import("./a11Kit.mjs")
const { useResetRequest } = await import("../../src/domains/auth/hooks/recovery/useResetRequest.js")
const { REQUEST_TEXT } = await import("../../src/domains/auth/constants/recoveryMessages.js")

const PATH = "/auth/password-reset/request"
const EMAIL = "reset-user@example.com"

test.afterEach(() => cleanup())

// 훅을 그리고 이메일을 넣은 뒤 보내기까지 (answer = 서버 답)
async function submitWith(answer, email = EMAIL) {
  const net = installFetch({ [`POST ${PATH}`]: answer })
  const hook = renderHook(() => useResetRequest())
  act(() => hook.result.current.setEmail(email))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  return { net, hook }
}

test("A11-F-501 모양 맞는 이메일 → 요청 1번, 보내는 중(submitting)", async () => {
  const { net, hook } = await submitWith(HOLD)
  assert.equal(net.to("POST", PATH).length, 1)
  assert.deepEqual(net.to("POST", PATH)[0].body, { email: EMAIL })
  assert.equal(hook.result.current.status, "submitting")
})

test("A11-F-502 보내는 중에 다시 누름 → 요청 더 안 감", async () => {
  const { net, hook } = await submitWith(HOLD)
  act(() => hook.result.current.handleSubmit(submitEvent()))
  act(() => hook.result.current.handleSubmit(submitEvent()))
  await flushUi()
  assert.equal(net.to("POST", PATH).length, 1)
})

test("A11-F-503 서버 답 ok:true → 보냄(sent)", async () => {
  const { hook } = await submitWith({ status: 200, body: { ok: true } })
  assert.equal(hook.result.current.status, "sent")
})

test("A11-F-504 서버 429 → 잠시 막힘(rateLimited)", async () => {
  const { hook } = await submitWith({ status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  assert.equal(hook.result.current.status, "rateLimited")
})

test("A11-F-505 망 끊김 → 실패(failed)", async () => {
  const { hook } = await submitWith(NETWORK_DOWN)
  assert.equal(hook.result.current.status, "failed")
})

test("A11-F-506 서버 500 → 실패(failed)", async () => {
  const { hook } = await submitWith({ status: 500, body: { ok: false, code: "SERVER_ERROR" } })
  assert.equal(hook.result.current.status, "failed")
})

test("A11-F-507 서버 400 → 입력 다시 확인 문구(REQUEST_TEXT.badInput)", async () => {
  const { hook } = await submitWith({ status: 400, body: { ok: false, code: "INVALID_INPUT" } })
  assert.equal(hook.result.current.formError, REQUEST_TEXT.badInput)
  assert.equal(hook.result.current.formError, "입력하신 이메일을 다시 확인해주세요.")
})

test("A11-F-508 200인데 ok가 true 아님 → 실패(성공으로 안 봄)", async () => {
  const { hook } = await submitWith({ status: 200, body: { ok: false } })
  assert.equal(hook.result.current.status, "failed")
})

test("A11-F-509 보냄 상태에서 1분 뒤 '다시 보내기' → 같은 주소로 요청 1번 더", async (t) => {
  // 다시 보내기는 1분 기다림 (2026-11-16 결정 다섯째 3) → 가짜 시계로 1분 넘김
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: Date.UTC(2026, 10, 16, 3, 0, 0) })
  t.after(() => t.mock.timers.reset())
  const { net, hook } = await submitWith({ status: 200, body: { ok: true } })
  assert.equal(hook.result.current.status, "sent", "준비: 보냄")
  act(() => t.mock.timers.tick(60 * 1000))
  // 입력 칸 값이 바뀌어도 다시 보내기는 보낸 주소로 감
  act(() => hook.result.current.setEmail("other-user@example.com"))
  act(() => hook.result.current.handleResend())
  await flushUi()
  const sent = net.to("POST", PATH)
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[1].body, { email: EMAIL })
})

test("A11-F-510 모양 틀린 이메일 → 서버 안 부름", async () => {
  const { net, hook } = await submitWith({ status: 200, body: { ok: true } }, "not-an-email")
  assert.equal(net.to("POST", PATH).length, 0)
  assert.notEqual(hook.result.current.formError, "")
  assert.equal(hook.result.current.status, "idle")
})
