import test from "node:test"
import assert from "node:assert/strict"

import { createTribunalVoteSubmitController } from "../createTribunalVoteSubmitController.js"

function createFakeSocket({ connected = true } = {}) {
  let resolveAck
  let rejectAck
  const ackPromise = new Promise((resolve, reject) => {
    resolveAck = resolve
    rejectAck = reject
  })
  return {
    connected,
    lastEmit: null,
    emitWithAck(event, payload) {
      this.lastEmit = { event, payload }
      return ackPromise
    },
    resolveAck,
    rejectAck,
  }
}

function baseContext(overrides = {}) {
  return {
    gameId: "g1",
    dayIndex: 2,
    phase: "TRIBUNAL",
    alive: true,
    isDefendant: false,
    defendantUuid: "defendant-a",
    actorUuid: "juror-1",
    ...overrides,
  }
}

async function flushMicrotasks() {
  // ack promise 체인(.then) 여러 겹이 풀리도록 여러 번 양보한다.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

function setup({ context = baseContext(), socket = createFakeSocket() } = {}) {
  let latestContext = context
  const states = []
  const controller = createTribunalVoteSubmitController({
    getSocket: () => socket,
    onStateChange: (next) => states.push(next),
    getLatestContext: () => latestContext,
  })
  return {
    controller,
    socket,
    states,
    setContext: (next) => {
      latestContext = next
    },
  }
}

test("createTribunalVoteSubmitController: 정상 왕복 시 defendantUuid가 요청 시점과 동일하면 성공이 반영된다", async () => {
  const { controller, socket, states } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })
  assert.equal(controller.getState().status, "submitting")

  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitted")
  assert.equal(controller.getState().submittedVote, "GUILTY")
  assert.ok(states.some((s) => s.status === "submitted"))

  controller.dispose()
})

test("createTribunalVoteSubmitController: 요청 후 피고인이 바뀌면(A→B) 뒤늦게 도착한 성공 ack는 무시된다", async () => {
  const { controller, socket, setContext } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })

  // 로컬 플레이어가 이전/이후 피고인 어느 쪽도 아니므로 isDefendant는 계속 false로 불변이지만,
  // defendantUuid 자체는 A에서 B로 바뀌었다 — 이 전환을 감지해야 한다.
  setContext(baseContext({ defendantUuid: "defendant-b" }))

  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitting")
  assert.notEqual(controller.getState().submittedVote, "GUILTY")

  controller.dispose()
})

test("createTribunalVoteSubmitController: 요청 후 피고인이 바뀌면 뒤늦게 도착한 실패 ack도 무시된다", async () => {
  const { controller, socket, setContext } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })
  setContext(baseContext({ defendantUuid: "defendant-b" }))

  socket.resolveAck({ ok: false, message: "이미 제출했습니다." })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitting")
  assert.equal(controller.getState().error, null)

  controller.dispose()
})

test("createTribunalVoteSubmitController: 요청 후 phase가 TRIBUNAL에서 벗어나면 뒤늦은 성공 ack는 무시된다", async () => {
  const { controller, socket, setContext } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "NOT_GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })
  setContext(baseContext({ phase: "NIGHT" }))

  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "NOT_GUILTY" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitting")

  controller.dispose()
})

test("createTribunalVoteSubmitController: 요청 후 생존 상태가 바뀌면 뒤늦은 성공 ack는 무시된다", async () => {
  const { controller, socket, setContext } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })
  setContext(baseContext({ alive: false }))

  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitting")

  controller.dispose()
})

test("createTribunalVoteSubmitController: 요청 후 actor(self)가 바뀌면 뒤늦게 도착한 성공 ack는 무시된다", async () => {
  const { controller, socket, setContext } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })

  // 로컬 세션의 actor 자체가 바뀐 경우(예: state.self.uuid 교체) — gameId/dayIndex/phase/
  // defendantUuid/alive는 전부 요청 시점과 동일하게 유지되지만 actorUuid만 달라졌다. alive
  // boolean만으로는 이 전환을 감지하지 못하므로 actorUuid 동일성 비교가 반드시 필요하다.
  setContext(baseContext({ actorUuid: "juror-2" }))

  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitting")
  assert.notEqual(controller.getState().submittedVote, "GUILTY")

  controller.dispose()
})

test("createTribunalVoteSubmitController: 요청 후 actor(self)가 바뀌면 뒤늦게 도착한 실패 ack도 무시된다", async () => {
  const { controller, socket, setContext } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })
  setContext(baseContext({ actorUuid: "juror-2" }))

  socket.resolveAck({ ok: false, message: "이미 제출했습니다." })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitting")
  assert.equal(controller.getState().error, null)

  controller.dispose()
})

test("createTribunalVoteSubmitController: invalidate() 이후 도착한 ack는 반영되지 않고 idle을 유지한다", async () => {
  const { controller, socket } = setup()

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })
  controller.invalidate("CONTEXT_CHANGE")
  assert.equal(controller.getState().status, "idle")

  socket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "idle")
  assert.equal(controller.getState().submittedVote, null)

  controller.dispose()
})

test("createTribunalVoteSubmitController: 요청 시점과 다른 소켓에서 도착한 ack는 무시된다", async () => {
  let currentSocket = createFakeSocket()
  const requestSocket = currentSocket
  let latestContext = baseContext()
  const controller = createTribunalVoteSubmitController({
    getSocket: () => currentSocket,
    onStateChange: () => {},
    getLatestContext: () => latestContext,
  })

  controller.submit({ gameId: "g1", dayIndex: 2, vote: "GUILTY", defendantUuid: "defendant-a", actorUuid: "juror-1" })

  currentSocket = createFakeSocket()

  requestSocket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await flushMicrotasks()

  assert.equal(controller.getState().status, "submitting")

  controller.dispose()
})
