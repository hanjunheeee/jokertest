import test from "node:test"
import assert from "node:assert/strict"

import { createTribunalVoteResolveController } from "../createTribunalVoteResolveController.js"

function createFakeSocket({ connected = true } = {}) {
  let resolveAck
  let rejectAck
  const ackPromise = new Promise((resolve, reject) => {
    resolveAck = resolve
    rejectAck = reject
  })
  return {
    connected,
    emitCalls: [],
    emitWithAck(event, payload) {
      this.emitCalls.push({ event, payload })
      return ackPromise
    },
    resolveAck,
    rejectAck,
  }
}

function baseContext(overrides = {}) {
  return {
    gameId: "g1",
    dayIndex: 3,
    phase: "TRIBUNAL",
    actorUuid: "juror-1",
    defendantUuid: "defendant-a",
    ...overrides,
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

function setup({ context = baseContext(), socket = createFakeSocket(), timeoutMs } = {}) {
  let latestContext = context
  const states = []
  const controller = createTribunalVoteResolveController({
    getSocket: () => socket,
    onStateChange: (next) => states.push(next),
    getLatestContext: () => latestContext,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  })
  return { controller, socket, states, setContext: (next) => { latestContext = next } }
}

test("createTribunalVoteResolveController: 진행 중 중복 resolve()는 두 번째 emit을 보내지 않는다", () => {
  const { controller, socket } = setup()

  controller.resolve({ gameId: "g1", dayIndex: 3, phase: "TRIBUNAL", actorUuid: "juror-1", defendantUuid: "defendant-a" })
  controller.resolve({ gameId: "g1", dayIndex: 3, phase: "TRIBUNAL", actorUuid: "juror-1", defendantUuid: "defendant-a" })

  assert.equal(socket.emitCalls.length, 1)
  controller.dispose()
})

test("createTribunalVoteResolveController: 성공 ack는 outcome/counts/executedUuid를 반영하고 status를 resolved로 잠근다", async () => {
  const { controller, socket } = setup()

  controller.resolve({ gameId: "g1", dayIndex: 3, phase: "TRIBUNAL", actorUuid: "juror-1", defendantUuid: "defendant-a" })
  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 3, outcome: "GUILTY", counts: { guilty: 2, notGuilty: 1 }, executedUuid: "defendant-a" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "resolved")
  assert.equal(controller.getState().outcome, "GUILTY")
  assert.deepEqual(controller.getState().counts, { guilty: 2, notGuilty: 1 })
  assert.equal(controller.getState().executedUuid, "defendant-a")

  controller.resolve({ gameId: "g1", dayIndex: 3, phase: "TRIBUNAL", actorUuid: "juror-1", defendantUuid: "defendant-a" })
  assert.equal(socket.emitCalls.length, 1)

  controller.dispose()
})

test("createTribunalVoteResolveController: 실패 ack는 idle로 복귀하고 error가 설정된다", async () => {
  const { controller, socket } = setup()

  controller.resolve({ gameId: "g1", dayIndex: 3, phase: "TRIBUNAL", actorUuid: "juror-1", defendantUuid: "defendant-a" })
  socket.resolveAck({ ok: false, message: "아직 투표가 끝나지 않았습니다." })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "idle")
  assert.equal(controller.getState().error, "아직 투표가 끝나지 않았습니다.")

  controller.dispose()
})

test("createTribunalVoteResolveController: ack가 timeoutMs 안에 도착하지 않으면 idle로 복귀한다", async () => {
  const { controller } = setup({ timeoutMs: 5 })

  controller.resolve({ gameId: "g1", dayIndex: 3, phase: "TRIBUNAL", actorUuid: "juror-1", defendantUuid: "defendant-a" })
  assert.equal(controller.getState().status, "resolving")

  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.equal(controller.getState().status, "idle")
  assert.ok(controller.getState().error)

  controller.dispose()
})

test("createTribunalVoteResolveController: 요청 후 defendantUuid가 바뀌면 뒤늦게 도착한 성공 ack는 무시된다", async () => {
  const { controller, socket, setContext } = setup()

  controller.resolve({ gameId: "g1", dayIndex: 3, phase: "TRIBUNAL", actorUuid: "juror-1", defendantUuid: "defendant-a" })
  setContext(baseContext({ defendantUuid: "defendant-b" }))

  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 3, outcome: "GUILTY", counts: { guilty: 2, notGuilty: 0 }, executedUuid: "defendant-a" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "resolving")
  assert.equal(controller.getState().outcome, null)

  controller.dispose()
})
