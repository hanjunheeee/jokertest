import test from "node:test"
import assert from "node:assert/strict"

import { createDayVoteSubmitController } from "../createDayVoteSubmitController.js"
import { INITIAL_DAY_VOTE_SUBMIT_STATE } from "../computeDayVoteSubmitPatch.js"

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** emitWithAck 호출마다 별도로 resolve/reject를 제어할 수 있는 deferred를 큐에 쌓는 mock이다. */
function createEmitWithAckMock() {
  const calls = []
  function emitWithAck(payload) {
    const deferred = createDeferred()
    calls.push({ payload, deferred })
    return deferred.promise
  }
  emitWithAck.calls = calls
  return emitWithAck
}

/** emitWithAck 프로미스의 then/catch 체인이 실행되도록 microtask 큐를 두 차례 비운다. */
function flush() {
  return Promise.resolve().then(() => Promise.resolve())
}

test("중복 submit 차단: submitting 중 두 번째 submit은 emitWithAck를 호출하지 않는다", () => {
  const emitWithAck = createEmitWithAckMock()
  const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: () => {} })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t2" })

  assert.equal(emitWithAck.calls.length, 1)
  assert.equal(emitWithAck.calls[0].payload.targetId, "t1")
  assert.equal(controller.getState().status, "submitting")
})

test("대상 투표 성공: hasSubmitted:true, lastSubmittedTargetId 반영, status:'idle'", async () => {
  const emitWithAck = createEmitWithAckMock()
  let lastNotified = null
  const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: (s) => { lastNotified = s } })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
  emitWithAck.calls[0].deferred.resolve({ ok: true })
  await flush()

  const expected = { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "t1" }
  assert.deepEqual(controller.getState(), expected)
  assert.deepEqual(lastNotified, expected)
})

test("기권(targetId:null) 성공: hasSubmitted:true, lastSubmittedTargetId:null", async () => {
  const emitWithAck = createEmitWithAckMock()
  const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: () => {} })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: null })
  emitWithAck.calls[0].deferred.resolve({ ok: true })
  await flush()

  assert.deepEqual(controller.getState(), { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: null })
})

test("실패 resolve: error를 반영하고 이전 hasSubmitted/lastSubmittedTargetId를 유지한다", async () => {
  const emitWithAck = createEmitWithAckMock()
  const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: () => {} })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
  emitWithAck.calls[0].deferred.resolve({ ok: true })
  await flush()

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t2" })
  emitWithAck.calls[1].deferred.resolve({ ok: false, code: "TARGET_NOT_ALIVE", message: "대상이 사망했습니다." })
  await flush()

  assert.deepEqual(controller.getState(), {
    status: "idle",
    error: { code: "TARGET_NOT_ALIVE", message: "대상이 사망했습니다." },
    hasSubmitted: true,
    lastSubmittedTargetId: "t1",
  })
})

test("성공 후 같은 controller에서 재제출이 가능하다(status idle 복귀 후 두 번째 emitWithAck 호출 발생)", async () => {
  const emitWithAck = createEmitWithAckMock()
  const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: () => {} })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
  emitWithAck.calls[0].deferred.resolve({ ok: true })
  await flush()

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t2" })

  assert.equal(emitWithAck.calls.length, 2)
  emitWithAck.calls[1].deferred.resolve({ ok: true })
  await flush()
  assert.deepEqual(controller.getState(), { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "t2" })
})

test("timeout: status:'idle' + ACK_TIMEOUT error이고, 이후 도착한 늦은 resolve는 no-op이다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const emitWithAck = createEmitWithAckMock()
  const controller = createDayVoteSubmitController({ emitWithAck, timeoutMs: 1000, onStateChange: () => {} })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
  t.mock.timers.tick(1000)

  assert.deepEqual(controller.getState(), {
    status: "idle",
    error: { code: "ACK_TIMEOUT", message: "요청 시간이 초과되었습니다." },
    hasSubmitted: false,
    lastSubmittedTargetId: null,
  })

  emitWithAck.calls[0].deferred.resolve({ ok: true })
  await flush()

  assert.deepEqual(controller.getState(), {
    status: "idle",
    error: { code: "ACK_TIMEOUT", message: "요청 시간이 초과되었습니다." },
    hasSubmitted: false,
    lastSubmittedTargetId: null,
  })
})

test("settle-once: 성공 resolve 이후 이미 해제된 타이머가 만료되어도 상태가 바뀌지 않는다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const emitWithAck = createEmitWithAckMock()
  const controller = createDayVoteSubmitController({ emitWithAck, timeoutMs: 1000, onStateChange: () => {} })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
  emitWithAck.calls[0].deferred.resolve({ ok: true })
  await flush()
  const afterSuccess = controller.getState()

  t.mock.timers.tick(1000)

  assert.deepEqual(controller.getState(), afterSuccess)
})

const invalidateReasons = ["GAME_ID_CHANGE", "PHASE_CHANGE", "DAY_INDEX_CHANGE", "DISCONNECT"]
for (const reason of invalidateReasons) {
  test(`invalidate('${reason}'): 진행 중 요청을 무효화해 즉시 INITIAL 상태로 리셋하고, 이후 늦은 resolve는 no-op이며 같은 controller를 다시 submit할 수 있다`, async () => {
    const emitWithAck = createEmitWithAckMock()
    const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: () => {} })

    controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
    controller.invalidate(reason)

    assert.deepEqual(controller.getState(), INITIAL_DAY_VOTE_SUBMIT_STATE)

    emitWithAck.calls[0].deferred.resolve({ ok: true })
    await flush()
    assert.deepEqual(controller.getState(), INITIAL_DAY_VOTE_SUBMIT_STATE)

    controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t2" })
    assert.equal(emitWithAck.calls.length, 2)
    emitWithAck.calls[1].deferred.resolve({ ok: true })
    await flush()
    assert.deepEqual(controller.getState(), { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "t2" })
  })
}

test("dispose(): 진행 중 요청이 있을 때 호출하면 이후 도착한 늦은 resolve/timeout이 onStateChange를 호출하지 않는다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const emitWithAck = createEmitWithAckMock()
  const notifications = []
  const controller = createDayVoteSubmitController({ emitWithAck, timeoutMs: 1000, onStateChange: (s) => notifications.push(s) })

  controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" })
  const countBeforeDispose = notifications.length
  controller.dispose()

  emitWithAck.calls[0].deferred.resolve({ ok: true })
  await flush()
  t.mock.timers.tick(1000)

  assert.equal(notifications.length, countBeforeDispose)
})

test("dispose(): idempotent하다 — 두 번 호출해도 예외가 없고 두 번째 호출도 onStateChange를 유발하지 않는다", () => {
  const emitWithAck = createEmitWithAckMock()
  const notifications = []
  const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: (s) => notifications.push(s) })

  assert.doesNotThrow(() => controller.dispose())
  const countAfterFirst = notifications.length
  assert.doesNotThrow(() => controller.dispose())
  assert.equal(notifications.length, countAfterFirst)
})

test("dispose() 이후 submit()을 호출해도 emitWithAck가 호출되지 않고 안전하게 실패한다", () => {
  const emitWithAck = createEmitWithAckMock()
  const controller = createDayVoteSubmitController({ emitWithAck, onStateChange: () => {} })

  controller.dispose()
  assert.doesNotThrow(() => controller.submit({ gameId: "g1", dayIndex: 1, targetId: "t1" }))

  assert.equal(emitWithAck.calls.length, 0)
})

test("socket 교체: 이전 controller를 dispose()한 뒤 새 controller로만 새 제출이 emit되고, 이전 controller의 늦은 resolve·timeout은 새 controller 상태에 완전한 no-op이다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const emitWithAckA = createEmitWithAckMock()
  const emitWithAckB = createEmitWithAckMock()

  // 1. socket A용 controller A를 만들고 첫 submit을 호출한다(A 요청 진행 중 상태).
  const controllerA = createDayVoteSubmitController({ emitWithAck: emitWithAckA, timeoutMs: 1000, onStateChange: () => {} })
  controllerA.submit({ gameId: "g1", dayIndex: 1, targetId: "a-target" })
  assert.equal(emitWithAckA.calls.length, 1)

  // 2. controller A를 dispose()한다.
  controllerA.dispose()

  // 3~4. socket B용 controller B를 만들고 새 submit을 수행한다 — 새 제출은 B로만 emit된다.
  const controllerB = createDayVoteSubmitController({ emitWithAck: emitWithAckB, timeoutMs: 1000, onStateChange: () => {} })
  controllerB.submit({ gameId: "g1", dayIndex: 1, targetId: "b-target" })
  assert.equal(emitWithAckB.calls.length, 1)

  // 5. socket A의 emitWithAck 호출 수는 교체 후 추가로 늘지 않는다.
  assert.equal(emitWithAckA.calls.length, 1)

  // 6. socket A 요청의 늦은 성공 resolve는 controller B state에 no-op이다.
  emitWithAckA.calls[0].deferred.resolve({ ok: true })
  await flush()
  assert.equal(controllerB.getState().hasSubmitted, false)

  // 7. controller B의 정상 resolve만 hasSubmitted/lastSubmittedTargetId를 변경한다.
  emitWithAckB.calls[0].deferred.resolve({ ok: true })
  await flush()
  assert.deepEqual(controllerB.getState(), { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "b-target" })

  // A는 dispose(), B는 정상 resolve로 각 타이머가 해제됐다. 이후 시간을 진행해도
  // controller B의 성공 상태는 바뀌지 않는다.
  t.mock.timers.tick(1000)
  assert.deepEqual(controllerB.getState(), { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "b-target" })

  // 8. dispose() 이후 controller A에 submit해도 socket A의 emitWithAck가 호출되지 않는다.
  controllerA.submit({ gameId: "g1", dayIndex: 1, targetId: "a-target-2" })
  assert.equal(emitWithAckA.calls.length, 1)

  // 9. (hook 배선 시뮬레이션) controllerRef.current가 없는 교체 순간은 optional chaining으로
  // submit 자체가 호출되지 않으므로, 두 controller 모두 이 시점까지 추가 emit이 없었음을
  // 재확인하는 것으로 대신한다(hook 자체는 §6.5에 따라 별도 단위 테스트 대상이 아니다).
  assert.equal(emitWithAckA.calls.length, 1)
  assert.equal(emitWithAckB.calls.length, 1)
})
