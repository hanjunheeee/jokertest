// 가입 이메일 중복 확인 상태 시험 — 빈 주소·사용 가능·이미 있음·주소 바꿈·늦게 온 옛 답
// 목록 A11a 화면 상태 A11-F-038~042
import test from "node:test"
import assert from "node:assert/strict"
import { React, rtl, EMAIL, serve, sent, deferred, resetAll, settle } from "./a11Kit.mjs"

const { useEmailCheck } = await import("../../src/domains/auth/hooks/login/useEmailCheck.js")

const CHECK = "/auth/check-email"
// 서버 답 모양 ({ success, data: { available } })
const answer = (available) => ({ status: 200, body: { success: true, data: { available } } })

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

// 화면에 실제로 그려질 때마다 [주소, 상태]를 모아 둠 (옛 결과가 한 번이라도 보였나 보려고)
// 그리다 버려진 것은 화면에 안 나가서, 그려진 뒤(layout effect)에만 모음
function start(email) {
  const seen = []
  const hook = rtl.renderHook(({ email: value }) => {
    const r = useEmailCheck(value)
    React.useLayoutEffect(() => { seen.push([value, r.status]) })
    return r
  }, { initialProps: { email } })
  return { hook, seen }
}
async function check(hook) { await rtl.act(async () => { await hook.result.current.check() }) }

test("A11-F-038 빈 이메일로 중복 확인 → 요청 0번", async () => {
  serve({ [`GET ${CHECK}`]: answer(true) })
  const { hook } = start("")
  await check(hook)
  assert.equal(sent("GET", CHECK).length, 0)
  assert.equal(hook.result.current.status, "idle")
})

test("A11-F-039 쓸 수 있는 이메일 → available", async () => {
  serve({ [`GET ${CHECK}`]: answer(true) })
  const { hook } = start(EMAIL)
  await check(hook)
  assert.equal(sent("GET", CHECK)[0].query.get("email"), EMAIL)
  assert.equal(hook.result.current.status, "available")
})

test("A11-F-040 이미 있는 이메일 → duplicate", async () => {
  serve({ [`GET ${CHECK}`]: answer(false) })
  const { hook } = start(EMAIL)
  await check(hook)
  assert.equal(hook.result.current.status, "duplicate")
})

test("A11-F-041 available 뒤 이메일 바꿈 → 바로 idle, 새 주소로 available이 한 번도 안 보임", async () => {
  serve({ [`GET ${CHECK}`]: answer(true) })
  const { hook, seen } = start(EMAIL)
  await check(hook)
  assert.equal(hook.result.current.status, "available")
  const other = "tester2@example.com"
  hook.rerender({ email: other })
  assert.equal(hook.result.current.status, "idle")
  assert.equal(seen.some(([value, status]) => value === other && status === "available"), false)
})

test("A11-F-042 확인 1(늦음)·확인 2(빠름) → 1의 답이 늦게 와도 2의 결과", async () => {
  const slow = deferred()
  serve({ [`GET ${CHECK}`]: (req, n) => (n === 1 ? slow.promise : answer(false)) })
  const { hook } = start(EMAIL)
  let first
  rtl.act(() => { first = hook.result.current.check() })
  await check(hook)
  assert.equal(hook.result.current.status, "duplicate")
  slow.resolve(answer(true))
  await rtl.act(async () => { await first })
  await settle(2)
  assert.equal(hook.result.current.status, "duplicate")
})
