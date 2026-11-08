// 결제창 멈춤 감시 시험: 돌아옴·오래 기다림이면 닫힘으로 끝남, 연 직후·틀 안 초점·끈 뒤엔 안 끝남
import assert from "node:assert/strict"
import test, { mock } from "node:test"
import { CANCEL_CODES, PAYMENT_WATCH, isCancelCode, watchPaymentWindow } from "../../../../src/domains/store/store/currency/paymentWatch.js"

// 이벤트만 흉내 내는 창·문서
const fakeTarget = () => {
  const handlers = new Map()
  return {
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: (name, fn) => { if (handlers.get(name) === fn) handlers.delete(name) },
    fire: (name) => handlers.get(name)?.(),
    has: (name) => handlers.has(name),
  }
}
const setup = () => {
  let clock = 0
  const win = fakeTarget()
  const doc = Object.assign(fakeTarget(), { visibilityState: "visible", activeElement: { tagName: "BODY" } })
  const watch = watchPaymentWindow({ win, doc, now: () => clock })
  let outcome = null
  watch.promise.catch((error) => { outcome = error })
  const advance = async (ms) => { clock += ms; mock.timers.tick(ms); await Promise.resolve() }
  return { win, doc, watch, advance, outcome: () => outcome }
}

test.beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
test.afterEach(() => mock.timers.reset())

test("취소 코드: v2·예전 이름 모두 취소로 봄", () => {
  for (const code of CANCEL_CODES) assert.equal(isCancelCode(code), true)
  assert.equal(isCancelCode("PAYMENT_WINDOW_FAILED"), false)
})

test("연 뒤 페이지로 돌아오고 잠깐 지나도 틀 밖이면 닫힘으로 끝남", async () => {
  const { win, advance, outcome } = setup()
  await advance(PAYMENT_WATCH.graceMs + 10)
  win.fire("focus")
  await advance(PAYMENT_WATCH.settleMs)
  assert.equal(outcome()?.code, "PAYMENT_WINDOW_CLOSED")
  assert.equal(outcome()?.why, "returned")
  assert.equal(win.has("focus"), false)
})

test("연 직후 흔들림·틀(iframe) 안 초점·숨김 상태는 닫힘 아님", async () => {
  const { win, doc, advance, outcome } = setup()
  win.fire("focus")
  await advance(PAYMENT_WATCH.settleMs)
  assert.equal(outcome(), null)
  await advance(PAYMENT_WATCH.graceMs)
  doc.activeElement = { tagName: "IFRAME" }
  win.fire("focus")
  await advance(PAYMENT_WATCH.settleMs)
  assert.equal(outcome(), null)
  doc.activeElement = { tagName: "BODY" }
  doc.visibilityState = "hidden"
  doc.fire("visibilitychange")
  await advance(PAYMENT_WATCH.settleMs)
  assert.equal(outcome(), null)
  doc.visibilityState = "visible"
  doc.fire("visibilitychange")
  await advance(PAYMENT_WATCH.settleMs)
  assert.equal(outcome()?.code, "PAYMENT_WINDOW_CLOSED")
})

test("돌아오지 않아도 정한 시간이 지나면 닫힘, stop() 뒤엔 안 끝남", async () => {
  const first = setup()
  await first.advance(PAYMENT_WATCH.timeoutMs)
  assert.equal(first.outcome()?.why, "timeout")

  const second = setup()
  second.watch.stop()
  await second.advance(PAYMENT_WATCH.timeoutMs)
  second.win.fire("focus")
  assert.equal(second.outcome(), null)
  assert.equal(second.win.has("focus"), false)
})
