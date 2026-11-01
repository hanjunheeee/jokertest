import test from "node:test"
import assert from "node:assert/strict"

import { createDayVoteSubmitController } from "../../../../../src/domains/game/ingame/utils/createDayVoteSubmitController.js"
import { INITIAL_DAY_VOTE_SUBMIT_STATE } from "../../../../../src/domains/game/ingame/utils/voteSubmitPatch.js"

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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

  const controllerA = createDayVoteSubmitController({ emitWithAck: emitWithAckA, timeoutMs: 1000, onStateChange: () => {} })
  controllerA.submit({ gameId: "g1", dayIndex: 1, targetId: "a-target" })
  assert.equal(emitWithAckA.calls.length, 1)

  controllerA.dispose()

  const controllerB = createDayVoteSubmitController({ emitWithAck: emitWithAckB, timeoutMs: 1000, onStateChange: () => {} })
  controllerB.submit({ gameId: "g1", dayIndex: 1, targetId: "b-target" })
  assert.equal(emitWithAckB.calls.length, 1)

  assert.equal(emitWithAckA.calls.length, 1)

  emitWithAckA.calls[0].deferred.resolve({ ok: true })
  await flush()
  assert.equal(controllerB.getState().hasSubmitted, false)

  emitWithAckB.calls[0].deferred.resolve({ ok: true })
  await flush()
  assert.deepEqual(controllerB.getState(), { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "b-target" })

  t.mock.timers.tick(1000)
  assert.deepEqual(controllerB.getState(), { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "b-target" })

  controllerA.submit({ gameId: "g1", dayIndex: 1, targetId: "a-target-2" })
  assert.equal(emitWithAckA.calls.length, 1)

  assert.equal(emitWithAckA.calls.length, 1)
  assert.equal(emitWithAckB.calls.length, 1)
})
