import test, { mock } from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"

import { useInGameStore } from "../../../../../src/domains/game/ingame/store/ingameStore.js"

const dom = new JSDOM(
  "<!doctype html><html><head></head><body></body></html>",
  { pretendToBeVisual: true },
)

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal(
  "requestAnimationFrame",
  dom.window.requestAnimationFrame.bind(dom.window),
)
installDomGlobal(
  "cancelAnimationFrame",
  dom.window.cancelAnimationFrame.bind(dom.window),
)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { renderHook } = await import("@testing-library/react")

let currentFakeSocket = null
const fakeSocketSubscribers = new Set()

function fakeGetSocket() {
  return currentFakeSocket
}

function fakeSubscribeSocket(callback) {
  fakeSocketSubscribers.add(callback)
  return () => {
    fakeSocketSubscribers.delete(callback)
  }
}

function setFakeSocket(next) {
  currentFakeSocket = next
  for (const callback of fakeSocketSubscribers) callback()
}

mock.module("../../../../../src/shared/socket/socketClient.js", {
  namedExports: {
    getSocket: fakeGetSocket,
    subscribeSocket: fakeSubscribeSocket,
  },
})

const actualTribunalVoteControllerModule =
  await import(
    "../../../../../src/domains/game/ingame/utils/createTribunalVoteSubmitController.js?controller-probe-actual"
  )

let activeControllerProbe = null

function beginControllerProbe() {
  const probe = {
    onStateChangeCalls: [],
    invalidateCalls: [],
    controller: null,
  }

  activeControllerProbe = probe
  return probe
}

function createObservedTribunalVoteSubmitController(options) {
  const probe = activeControllerProbe
  const originalOnStateChange = options.onStateChange

  const controller =
    actualTribunalVoteControllerModule
      .createTribunalVoteSubmitController({
        ...options,
        onStateChange(...args) {
          if (probe) {
            probe.onStateChangeCalls.push(args)
          }

          return originalOnStateChange(...args)
        },
      })

  if (probe) {
    const originalInvalidate =
      controller.invalidate.bind(controller)

    controller.invalidate = (...args) => {
      probe.invalidateCalls.push(args)
      return originalInvalidate(...args)
    }

    probe.controller = controller
  }

  return controller
}

mock.module(
  "../../../../../src/domains/game/ingame/utils/createTribunalVoteSubmitController.js",
  {
    namedExports: {
      ...actualTribunalVoteControllerModule,
      createTribunalVoteSubmitController:
        createObservedTribunalVoteSubmitController,
    },
  },
)

const { buildLatestTribunalVoteContext, useInGameTribunalVoteSubmit } = await import("../../../../../src/domains/game/ingame/hooks/useInGameTribunalVoteSubmit.js")

function mountTribunalVoteSubmitHook() {
  let captured
  function Harness() {
    captured = useInGameTribunalVoteSubmit()
    return null
  }
  renderToStaticMarkup(React.createElement(Harness))
  return captured
}

function seedStore(overrides = {}) {
  const state = {
    id: "g1",
    phase: "TRIBUNAL",
    dayIndex: 2,
    tribunal: { defendantUuid: "defendant-a" },
    players: [{ uuid: "juror-1", alive: true }],
    self: { uuid: "juror-1" },
    ...overrides,
  }
  useInGameStore.setState({ gameId: "g1", state, error: null })
  return state
}

function mutateCanonicalStoreWithoutNotify(mutator) {
  const snapshot = useInGameStore.getState()

  assert.ok(snapshot.state)
  mutator(snapshot.state)
}

function publishCanonicalStoreSnapshot() {
  const snapshot = useInGameStore.getState()
  const state = snapshot.state

  assert.ok(state)

  useInGameStore.setState({
    gameId: snapshot.gameId,
    state: {
      ...state,
      players: Array.isArray(state.players)
        ? state.players.map((player) => ({ ...player }))
        : state.players,
      self:
        state.self && typeof state.self === "object"
          ? { ...state.self }
          : state.self,
      tribunal:
        state.tribunal && typeof state.tribunal === "object"
          ? { ...state.tribunal }
          : state.tribunal,
    },
    error: snapshot.error,
  })
}

test("buildLatestTribunalVoteContext: 어떤 렌더도 없이 defendantUuid가 A→B로 바뀌면 즉시 새 값을 반영한다", () => {
  seedStore()

  const requestTimeSnapshot = buildLatestTribunalVoteContext()
  assert.equal(requestTimeSnapshot.defendantUuid, "defendant-a")

  seedStore({ tribunal: { defendantUuid: "defendant-b" } })

  const settleTimeSnapshot = buildLatestTribunalVoteContext()
  assert.equal(settleTimeSnapshot.defendantUuid, "defendant-b")
  assert.notEqual(settleTimeSnapshot.defendantUuid, requestTimeSnapshot.defendantUuid)
})

test("buildLatestTribunalVoteContext: 렌더 없이 gameId/dayIndex/phase가 바뀌어도 즉시 반영한다", () => {
  seedStore()

  const before = buildLatestTribunalVoteContext()
  assert.deepEqual(
    { gameId: before.gameId, dayIndex: before.dayIndex, phase: before.phase },
    { gameId: "g1", dayIndex: 2, phase: "TRIBUNAL" },
  )

  useInGameStore.setState((current) => ({
    gameId: current.gameId,
    state: { ...current.state, phase: "DAY", dayIndex: 3 },
    error: null,
  }))

  const after = buildLatestTribunalVoteContext()
  assert.deepEqual(
    { gameId: after.gameId, dayIndex: after.dayIndex, phase: after.phase },
    { gameId: "g1", dayIndex: 3, phase: "DAY" },
  )
})

test("buildLatestTribunalVoteContext: isDefendant/actorUuid는 항상 최신 state.self.uuid와 defendantUuid를 정확히 동일성 비교해 산출된다", () => {
  seedStore({ tribunal: { defendantUuid: "juror-1" }, self: { uuid: "juror-1" } })
  assert.equal(buildLatestTribunalVoteContext().isDefendant, true)
  assert.equal(buildLatestTribunalVoteContext().actorUuid, "juror-1")

  seedStore({
    tribunal: { defendantUuid: "defendant-other" },
    self: { uuid: "juror-2" },
    players: [{ uuid: "juror-2", alive: true }],
  })
  const snapshot = buildLatestTribunalVoteContext()
  assert.equal(snapshot.isDefendant, false)
  assert.equal(snapshot.defendantUuid, "defendant-other")
  assert.equal(snapshot.actorUuid, "juror-2")
})

test("buildLatestTribunalVoteContext: alive는 참가자 snapshot이 아니라 state.self.uuid에 대응하는 state.players[].alive에서 산출된다", () => {
  seedStore({ players: [{ uuid: "juror-1", alive: true }], self: { uuid: "juror-1" } })
  assert.equal(buildLatestTribunalVoteContext().alive, true)

  useInGameStore.setState((current) => ({
    gameId: current.gameId,
    state: {
      ...current.state,
      players: current.state.players.map((p) => (p.uuid === "juror-1" ? { ...p, alive: false } : p)),
    },
    error: null,
  }))

  assert.equal(buildLatestTribunalVoteContext().alive, false)
})

test("buildLatestTribunalVoteContext: 렌더 없이 state.self.uuid가 바뀌면(actor 교체) alive/actorUuid가 새 self를 기준으로 즉시 재계산된다", () => {
  seedStore({
    players: [
      { uuid: "juror-1", alive: false },
      { uuid: "juror-2", alive: true },
    ],
    self: { uuid: "juror-1" },
  })
  const before = buildLatestTribunalVoteContext()
  assert.equal(before.actorUuid, "juror-1")
  assert.equal(before.alive, false)

  useInGameStore.setState((current) => ({
    gameId: current.gameId,
    state: { ...current.state, self: { uuid: "juror-2" } },
    error: null,
  }))

  const after = buildLatestTribunalVoteContext()
  assert.equal(after.actorUuid, "juror-2")
  assert.equal(after.alive, true)
})

test("buildLatestTribunalVoteContext: self.uuid에 대응하는 players 항목이 없으면 alive는 false다", () => {
  seedStore({ players: [{ uuid: "other-player", alive: true }], self: { uuid: "juror-1" } })
  assert.equal(buildLatestTribunalVoteContext().alive, false)
})

test("useInGameTribunalVoteSubmit: submitTribunalVote는 렌더 시점이 아니라 호출 시점에 useInGameStore.getState()의 canonical self.uuid를 동기 캡처한다", () => {
  seedStore({
    self: { uuid: "juror-1" },
    players: [
      { uuid: "juror-1", alive: true },
      { uuid: "juror-2", alive: true },
    ],
  })

  const hookResult = mountTribunalVoteSubmitHook()

  seedStore({
    self: { uuid: "juror-2" },
    players: [
      { uuid: "juror-1", alive: true },
      { uuid: "juror-2", alive: true },
    ],
  })

  const originalGetState = useInGameStore.getState
  const capturedActorUuidsAtCall = []
  useInGameStore.getState = (...args) => {
    const snapshot = originalGetState(...args)
    capturedActorUuidsAtCall.push(snapshot.state?.self?.uuid)
    return snapshot
  }

  try {
    hookResult.submitTribunalVote("GUILTY")
  } finally {
    useInGameStore.getState = originalGetState
  }

  assert.ok(
    capturedActorUuidsAtCall.length > 0,
    "submitTribunalVote가 호출 중 useInGameStore.getState()를 전혀 호출하지 않았습니다 — actorUuid가 render 값에서만 오고 있을 가능성이 있습니다",
  )
  assert.equal(
    capturedActorUuidsAtCall[capturedActorUuidsAtCall.length - 1],
    "juror-2",
    "submitTribunalVote는 렌더 시점의 stale self.uuid('juror-1')가 아니라 호출 시점 store의 canonical self.uuid('juror-2')를 읽어야 한다",
  )
})

test("useInGameTribunalVoteSubmit: self가 렌더 이후 바뀌지 않은 정상 경로에서도 submitTribunalVote는 useInGameStore.getState()를 통해 동일한 self.uuid를 읽는다", () => {
  seedStore({
    self: { uuid: "juror-1" },
    players: [{ uuid: "juror-1", alive: true }],
  })

  const hookResult = mountTribunalVoteSubmitHook()

  const originalGetState = useInGameStore.getState
  const capturedActorUuidsAtCall = []
  useInGameStore.getState = (...args) => {
    const snapshot = originalGetState(...args)
    capturedActorUuidsAtCall.push(snapshot.state?.self?.uuid)
    return snapshot
  }

  try {
    hookResult.submitTribunalVote("NOT_GUILTY")
  } finally {
    useInGameStore.getState = originalGetState
  }

  assert.ok(capturedActorUuidsAtCall.length > 0)
  assert.equal(capturedActorUuidsAtCall[capturedActorUuidsAtCall.length - 1], "juror-1")
})

test("useInGameTribunalVoteSubmit: 유효하지 않은 vote 값이면 submitTribunalVote는 useInGameStore.getState()를 호출하지 않고 조용히 무시한다", () => {
  seedStore({ self: { uuid: "juror-1" }, players: [{ uuid: "juror-1", alive: true }] })

  const hookResult = mountTribunalVoteSubmitHook()

  const originalGetState = useInGameStore.getState
  let callCount = 0
  useInGameStore.getState = (...args) => {
    callCount += 1
    return originalGetState(...args)
  }

  try {
    hookResult.submitTribunalVote("ABSTAIN")
  } finally {
    useInGameStore.getState = originalGetState
  }

  assert.equal(callCount, 0)
})

function createFakeConnectedSocket() {
  let resolveAck
  let rejectAck
  const ackPromise = new Promise((resolve, reject) => {
    resolveAck = resolve
    rejectAck = reject
  })
  return {
    connected: true,
    lastEmit: null,
    emitWithAck(event, payload) {
      this.lastEmit = { event, payload }
      return ackPromise
    },
    on() {},
    off() {},
    ackPromise,
    resolveAck,
    rejectAck,
  }
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

async function mountRealTribunalVoteSubmitHook() {
  const controllerProbe = beginControllerProbe()
  const renderCount = { current: 0 }

  const hook = renderHook(() => {
    renderCount.current += 1
    return useInGameTribunalVoteSubmit()
  })

  await act(async () => {
    await Promise.resolve()
  })

  assert.ok(
    controllerProbe.controller,
    "실제 hook effect가 controller를 생성해야 한다",
  )

  return {
    getCaptured: () => hook.result.current,
    getRenderCount: () => renderCount.current,
    getControllerProbe: () => controllerProbe,
    unmount: () => {
      hook.unmount()

      if (activeControllerProbe === controllerProbe) {
        activeControllerProbe = null
      }
    },
  }
}
test("useInGameTribunalVoteSubmit(실제 mount): 제출 중 players[].alive가 바뀐 뒤 도착한 성공 ack는 hook 상태에 반영되지 않는다", async () => {
  seedStore({
    self: { uuid: "juror-1" },
    players: [{ uuid: "juror-1", alive: true }],
    tribunal: { defendantUuid: "defendant-a" },
  })

  const fakeSocket = createFakeConnectedSocket()
  setFakeSocket(fakeSocket)

  const hook = await mountRealTribunalVoteSubmitHook()

  act(() => {
    hook.getCaptured().submitTribunalVote("GUILTY")
  })
  assert.equal(hook.getCaptured().status, "submitting")
  assert.deepEqual(fakeSocket.lastEmit, {
    event: "cast_tribunal_vote",
    payload: { gameId: "g1", dayIndex: 2, vote: "GUILTY" },
  })
  const renderCountAtSubmit = hook.getRenderCount()
  const controllerProbe = hook.getControllerProbe()
  const controllerCallBaseline = {
    onStateChange:
      controllerProbe.onStateChangeCalls.length,
    invalidate:
      controllerProbe.invalidateCalls.length,
  }

  mutateCanonicalStoreWithoutNotify((state) => {
    const actor = state.players.find(
      (player) => player.uuid === "juror-1",
    )

    assert.ok(actor)
    actor.alive = false
  })
  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "store mutate 직후에는 아직 리렌더가 일어나지 않았어야 한다",
  )

  fakeSocket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await fakeSocket.ackPromise
  await flushMicrotasks()

  const ackSettleStateCalls =
    controllerProbe.onStateChangeCalls.slice(
      controllerCallBaseline.onStateChange,
    )

  const ackSettleInvalidateCalls =
    controllerProbe.invalidateCalls.slice(
      controllerCallBaseline.invalidate,
    )

  assert.deepEqual(
    ackSettleStateCalls,
    [],
    "stale ACK settle 시 controller.onStateChange가 호출되면 안 된다",
  )

  assert.deepEqual(
    ackSettleInvalidateCalls,
    [],
    "stale ACK settle 전 controller.invalidate가 호출되면 안 된다",
  )

  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "ack settle 시점까지도 리렌더/invalidate effect가 실행되지 않았어야 한다 — 즉 아래 " +
      "assertion은 invalidate가 아니라 controller의 getLatestContext 기반 isContextStale이 " +
      "stale ack를 거부했음을 증명한다",
  )
  assert.equal(hook.getCaptured().status, "submitting")
  assert.notEqual(hook.getCaptured().submittedVote, "GUILTY")

  await act(async () => {
    publishCanonicalStoreSnapshot()
    await Promise.resolve()
  })

  assert.ok(
    controllerProbe.invalidateCalls.length >
      controllerCallBaseline.invalidate,
    "store publish 이후 context-change effect가 controller.invalidate를 호출해야 한다",
  )

  assert.notEqual(hook.getCaptured().submittedVote, "GUILTY")
  assert.notEqual(hook.getCaptured().status, "submitted")

  hook.unmount()
})

test("useInGameTribunalVoteSubmit(실제 mount): 제출 중 players[].alive가 바뀐 뒤 도착한 실패 ack도 hook 상태에 반영되지 않는다", async () => {
  seedStore({
    self: { uuid: "juror-1" },
    players: [{ uuid: "juror-1", alive: true }],
    tribunal: { defendantUuid: "defendant-a" },
  })

  const fakeSocket = createFakeConnectedSocket()
  setFakeSocket(fakeSocket)

  const hook = await mountRealTribunalVoteSubmitHook()

  act(() => {
    hook.getCaptured().submitTribunalVote("NOT_GUILTY")
  })
  assert.equal(hook.getCaptured().status, "submitting")
  const renderCountAtSubmit = hook.getRenderCount()
  const controllerProbe = hook.getControllerProbe()
  const controllerCallBaseline = {
    onStateChange:
      controllerProbe.onStateChangeCalls.length,
    invalidate:
      controllerProbe.invalidateCalls.length,
  }

  mutateCanonicalStoreWithoutNotify((state) => {
    const actor = state.players.find(
      (player) => player.uuid === "juror-1",
    )

    assert.ok(actor)
    actor.alive = false
  })
  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "store mutate 직후에는 아직 리렌더가 일어나지 않았어야 한다",
  )

  fakeSocket.resolveAck({ ok: false, message: "STALE_FAILURE_SHOULD_NOT_APPEAR" })
  await fakeSocket.ackPromise
  await flushMicrotasks()

  const ackSettleStateCalls =
    controllerProbe.onStateChangeCalls.slice(
      controllerCallBaseline.onStateChange,
    )

  const ackSettleInvalidateCalls =
    controllerProbe.invalidateCalls.slice(
      controllerCallBaseline.invalidate,
    )

  assert.deepEqual(
    ackSettleStateCalls,
    [],
    "stale ACK settle 시 controller.onStateChange가 호출되면 안 된다",
  )

  assert.deepEqual(
    ackSettleInvalidateCalls,
    [],
    "stale ACK settle 전 controller.invalidate가 호출되면 안 된다",
  )

  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "ack settle 시점까지도 리렌더/invalidate effect가 실행되지 않았어야 한다 — 즉 아래 " +
      "assertion은 invalidate가 아니라 controller의 getLatestContext 기반 isContextStale이 " +
      "stale ack를 거부했음을 증명한다",
  )
  assert.equal(hook.getCaptured().status, "submitting")
  assert.notEqual(hook.getCaptured().error, "STALE_FAILURE_SHOULD_NOT_APPEAR")

  await act(async () => {
    publishCanonicalStoreSnapshot()
    await Promise.resolve()
  })

  assert.ok(
    controllerProbe.invalidateCalls.length >
      controllerCallBaseline.invalidate,
    "store publish 이후 context-change effect가 controller.invalidate를 호출해야 한다",
  )

  assert.notEqual(hook.getCaptured().error, "STALE_FAILURE_SHOULD_NOT_APPEAR")
  assert.notEqual(hook.getCaptured().status, "submitted")

  hook.unmount()
})

test("useInGameTribunalVoteSubmit(실제 mount): 제출 중 state.self.uuid가 바뀐(actor 교체) 뒤 도착한 성공 ack는 hook 상태에 반영되지 않는다", async () => {
  seedStore({
    self: { uuid: "juror-1" },
    players: [
      { uuid: "juror-1", alive: true },
      { uuid: "juror-2", alive: true },
    ],
    tribunal: { defendantUuid: "defendant-a" },
  })

  const fakeSocket = createFakeConnectedSocket()
  setFakeSocket(fakeSocket)

  const hook = await mountRealTribunalVoteSubmitHook()

  act(() => {
    hook.getCaptured().submitTribunalVote("GUILTY")
  })
  assert.equal(hook.getCaptured().status, "submitting")
  const renderCountAtSubmit = hook.getRenderCount()
  const controllerProbe = hook.getControllerProbe()
  const controllerCallBaseline = {
    onStateChange:
      controllerProbe.onStateChangeCalls.length,
    invalidate:
      controllerProbe.invalidateCalls.length,
  }

  mutateCanonicalStoreWithoutNotify((state) => {
    assert.ok(state.self)
    state.self.uuid = "juror-2"
  })
  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "store mutate 직후에는 아직 리렌더가 일어나지 않았어야 한다",
  )

  fakeSocket.resolveAck({ ok: true, gameId: "g1", dayIndex: 2, vote: "GUILTY" })
  await fakeSocket.ackPromise
  await flushMicrotasks()

  const ackSettleStateCalls =
    controllerProbe.onStateChangeCalls.slice(
      controllerCallBaseline.onStateChange,
    )

  const ackSettleInvalidateCalls =
    controllerProbe.invalidateCalls.slice(
      controllerCallBaseline.invalidate,
    )

  assert.deepEqual(
    ackSettleStateCalls,
    [],
    "stale ACK settle 시 controller.onStateChange가 호출되면 안 된다",
  )

  assert.deepEqual(
    ackSettleInvalidateCalls,
    [],
    "stale ACK settle 전 controller.invalidate가 호출되면 안 된다",
  )

  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "ack settle 시점까지도 리렌더/invalidate effect가 실행되지 않았어야 한다 — 즉 아래 " +
      "assertion은 invalidate가 아니라 controller의 getLatestContext 기반 isContextStale이 " +
      "stale ack를 거부했음을 증명한다",
  )
  assert.equal(hook.getCaptured().status, "submitting")
  assert.notEqual(hook.getCaptured().submittedVote, "GUILTY")

  await act(async () => {
    publishCanonicalStoreSnapshot()
    await Promise.resolve()
  })

  assert.ok(
    controllerProbe.invalidateCalls.length >
      controllerCallBaseline.invalidate,
    "store publish 이후 context-change effect가 controller.invalidate를 호출해야 한다",
  )

  assert.notEqual(hook.getCaptured().submittedVote, "GUILTY")
  assert.notEqual(hook.getCaptured().status, "submitted")

  hook.unmount()
})

test("useInGameTribunalVoteSubmit(실제 mount): 제출 중 state.self.uuid가 바뀐(actor 교체) 뒤 도착한 실패 ack도 hook 상태에 반영되지 않는다", async () => {
  seedStore({
    self: { uuid: "juror-1" },
    players: [
      { uuid: "juror-1", alive: true },
      { uuid: "juror-2", alive: true },
    ],
    tribunal: { defendantUuid: "defendant-a" },
  })

  const fakeSocket = createFakeConnectedSocket()
  setFakeSocket(fakeSocket)

  const hook = await mountRealTribunalVoteSubmitHook()

  act(() => {
    hook.getCaptured().submitTribunalVote("NOT_GUILTY")
  })
  assert.equal(hook.getCaptured().status, "submitting")
  const renderCountAtSubmit = hook.getRenderCount()
  const controllerProbe = hook.getControllerProbe()
  const controllerCallBaseline = {
    onStateChange:
      controllerProbe.onStateChangeCalls.length,
    invalidate:
      controllerProbe.invalidateCalls.length,
  }

  mutateCanonicalStoreWithoutNotify((state) => {
    assert.ok(state.self)
    state.self.uuid = "juror-2"
  })
  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "store mutate 직후에는 아직 리렌더가 일어나지 않았어야 한다",
  )

  fakeSocket.resolveAck({ ok: false, message: "STALE_FAILURE_SHOULD_NOT_APPEAR" })
  await fakeSocket.ackPromise
  await flushMicrotasks()

  const ackSettleStateCalls =
    controllerProbe.onStateChangeCalls.slice(
      controllerCallBaseline.onStateChange,
    )

  const ackSettleInvalidateCalls =
    controllerProbe.invalidateCalls.slice(
      controllerCallBaseline.invalidate,
    )

  assert.deepEqual(
    ackSettleStateCalls,
    [],
    "stale ACK settle 시 controller.onStateChange가 호출되면 안 된다",
  )

  assert.deepEqual(
    ackSettleInvalidateCalls,
    [],
    "stale ACK settle 전 controller.invalidate가 호출되면 안 된다",
  )

  assert.equal(
    hook.getRenderCount(),
    renderCountAtSubmit,
    "ack settle 시점까지도 리렌더/invalidate effect가 실행되지 않았어야 한다 — 즉 아래 " +
      "assertion은 invalidate가 아니라 controller의 getLatestContext 기반 isContextStale이 " +
      "stale ack를 거부했음을 증명한다",
  )
  assert.equal(hook.getCaptured().status, "submitting")
  assert.notEqual(hook.getCaptured().error, "STALE_FAILURE_SHOULD_NOT_APPEAR")

  await act(async () => {
    publishCanonicalStoreSnapshot()
    await Promise.resolve()
  })

  assert.ok(
    controllerProbe.invalidateCalls.length >
      controllerCallBaseline.invalidate,
    "store publish 이후 context-change effect가 controller.invalidate를 호출해야 한다",
  )

  assert.notEqual(hook.getCaptured().error, "STALE_FAILURE_SHOULD_NOT_APPEAR")
  assert.notEqual(hook.getCaptured().status, "submitted")

  hook.unmount()
})
