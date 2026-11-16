// 재설정 링크(메일 속 token) 확인 상태 시험 (훅 useResetPage: 확인 요청·막힘·다시 확인·옛 답 버림)
// 목록 A11b 화면 상태 A11-F-511~524
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { renderHook, act, cleanup } = await import("@testing-library/react")
const { installFetch, HOLD, flushUi } = await import("./a11Kit.mjs")
const { useResetPage } = await import("../../src/domains/auth/hooks/recovery/useResetPage.js")
const { RESET_TEXT } = await import("../../src/domains/auth/constants/recoveryMessages.js")

const PATH = "/auth/password-reset/verify"
// 43자 시험용 token (메일 링크 모양)
const TOKEN = "TestOnlyResetToken_aaaaaaaaaaaaaaaaaaaaaaaa"
const VALID = { status: 200, body: { ok: true, status: "VALID" } }

test.afterEach(() => cleanup())

// 훅을 그림 (props.token을 바꿔 다시 그릴 수 있음)
async function mount(answer, { token = TOKEN, strict = false } = {}) {
  const net = installFetch({ [`GET ${PATH}`]: answer })
  const hook = renderHook(({ t }) => useResetPage(t), {
    initialProps: { t: token },
    wrapper: strict ? ({ children }) => React.createElement(React.StrictMode, null, children) : undefined,
  })
  await flushUi()
  return { net, hook }
}

test("A11-F-511 화면에 들어오면 링크 확인 요청 1번", async () => {
  const { net } = await mount(VALID)
  assert.equal(net.to("GET", PATH).length, 1)
})

test("A11-F-512 StrictMode로 두 번 그려져도 확인 요청 1번", async () => {
  const { net } = await mount(VALID, { strict: true })
  assert.equal(net.to("GET", PATH).length, 1)
})

test("A11-F-513 token을 주소에 실을 때 encodeURIComponent로 감쌈", async () => {
  const odd = "ab+cd/ef=gh&x"
  const { net } = await mount(VALID, { token: odd })
  assert.equal(net.to("GET", PATH)[0].path, `${PATH}?token=${encodeURIComponent(odd)}`)
  assert.equal(net.to("GET", PATH)[0].path, `${PATH}?token=ab%2Bcd%2Fef%3Dgh%26x`)
})

test("A11-F-514 서버 VALID → 새 비번 입력(ready)", async () => {
  const { hook } = await mount(VALID)
  assert.equal(hook.result.current.status, "ready")
})

for (const [no, code] of [["515", "EXPIRED"], ["516", "USED"], ["517", "INVALID"]]) {
  test(`A11-F-${no} 서버 ${code} → 잘못된 링크(linkInvalid) + 사유 ${code}`, async () => {
    const { hook } = await mount({ status: 200, body: { ok: false, code } })
    assert.equal(hook.result.current.status, "linkInvalid")
    assert.equal(hook.result.current.linkInvalidReason, code)
  })
}

test("A11-F-518 token 없음 → 잘못된 링크, 서버 안 부름", async () => {
  const { net, hook } = await mount(VALID, { token: "" })
  assert.equal(hook.result.current.status, "linkInvalid")
  assert.equal(net.to("GET", PATH).length, 0)
})

test("A11-F-519 서버 429 → 확인 실패 + verifyRateLimited 문구", async () => {
  const { hook } = await mount({ status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  assert.equal(hook.result.current.status, "verifyFailed")
  assert.equal(hook.result.current.verifyFailedMessage, RESET_TEXT.verifyRateLimited)
})

test("A11-F-520 서버 500 → 확인 실패 + verifyFailed 문구", async () => {
  const { hook } = await mount({ status: 500, body: { ok: false, code: "SERVER_ERROR" } })
  assert.equal(hook.result.current.status, "verifyFailed")
  assert.equal(hook.result.current.verifyFailedMessage, RESET_TEXT.verifyFailed)
})

test("A11-F-521 '다시 확인' → 새 확인 요청 1번", async () => {
  const { net, hook } = await mount((_body, count) => (count === 1 ? { status: 500, body: {} } : VALID))
  assert.equal(hook.result.current.status, "verifyFailed", "준비: 첫 확인 실패")
  act(() => hook.result.current.retryVerify())
  await flushUi()
  assert.equal(net.to("GET", PATH).length, 2)
  assert.equal(hook.result.current.status, "ready")
})

test("A11-F-522 모르는 code → 확인 실패(verifyFailed)", async () => {
  const { hook } = await mount({ status: 200, body: { ok: false, code: "SOMETHING_NEW" } })
  assert.equal(hook.result.current.status, "verifyFailed")
})

test("A11-F-523 화면을 나간 뒤 온 답 → 상태 안 바뀜", async () => {
  const { net, hook } = await mount(HOLD)
  assert.equal(hook.result.current.status, "verifying", "준비: 확인 중")
  hook.unmount()
  await net.release("GET", PATH, VALID)
  assert.equal(hook.result.current.status, "verifying")
})

test("A11-F-524 주소의 token이 바뀌면 옛 token 답은 버림", async () => {
  const { net, hook } = await mount(HOLD)
  hook.rerender({ t: "TestOnlyResetToken_bbbbbbbbbbbbbbbbbbbbbbbb" })
  await flushUi()
  assert.equal(net.to("GET", PATH).length, 2, "준비: 새 token으로 다시 확인")
  // 옛 token 답(쓸 수 있음)이 늦게 옴 → 아직 확인 중
  await net.release("GET", PATH, VALID)
  assert.equal(hook.result.current.status, "verifying")
  // 새 token 답(만료) → 그 답대로
  await net.release("GET", PATH, { status: 200, body: { ok: false, code: "EXPIRED" } })
  assert.equal(hook.result.current.status, "linkInvalid")
  assert.equal(hook.result.current.linkInvalidReason, "EXPIRED")
})
