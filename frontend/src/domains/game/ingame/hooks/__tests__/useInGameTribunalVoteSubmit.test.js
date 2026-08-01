import test, { mock } from "node:test"
import assert from "node:assert/strict"
import React, { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { JSDOM } from "jsdom"

import { useInGameStore } from "../../store/ingameStore.js"

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

// useInGameTribunalVoteSubmit이 module 최상단에서 import하는 socketClient(getSocket/subscribeSocket)를
// 실제 mount 테스트에서 제어 가능한 fake로 교체한다. mock.module은 아직 로드되지 않은 specifier에만
// 적용되므로, hook 모듈은 정적 import가 아니라 이 mock 등록 이후의 동적 import로 가져온다 — 기존
// 테스트가 참조하는 buildLatestTribunalVoteContext/useInGameTribunalVoteSubmit 바인딩 자체는 정적
// import였을 때와 동일하게 동작한다.
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

mock.module("../../../../../shared/socket/socketClient.js", {
  namedExports: {
    getSocket: fakeGetSocket,
    subscribeSocket: fakeSubscribeSocket,
  },
})

const actualTribunalVoteControllerModule =
  await import(
    "../../utils/createTribunalVoteSubmitController.js?controller-probe-actual"
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
  "../../utils/createTribunalVoteSubmitController.js",
  {
    namedExports: {
      ...actualTribunalVoteControllerModule,
      createTribunalVoteSubmitController:
        createObservedTribunalVoteSubmitController,
    },
  },
)

const { buildLatestTribunalVoteContext, useInGameTribunalVoteSubmit } = await import("../useInGameTribunalVoteSubmit.js")

// useInGameTribunalVoteSubmit()을 실제 함수 컴포넌트 안에서 렌더해 real hook closure(submitTribunalVote
// 등)를 얻는다. renderToStaticMarkup은 effect를 실행하지 않으므로 controller 인스턴스는 생성되지
// 않지만(그래서 아래 테스트는 controller.submit 자체가 아니라 submitTribunalVote 클로저가 무엇을
// 읽는지를 검증한다), hook 본문(모든 selector·useState·useRef 초기화·반환된 submitTribunalVote
// 클로저)은 실제 프로덕션 코드 그대로 실행된다 — buildLatestTribunalVoteContext처럼 별도로 추출한
// 순수 함수가 아니라 useInGameTribunalVoteSubmit 자체를 mount하는 것이 핵심이다.
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

// buildLatestTribunalVoteContext는 useInGameTribunalVoteSubmit이 controller에 넘기는
// getLatestContext(() => buildLatestTribunalVoteContext())의 실제 구현체다. gameId/dayIndex/
// phase/defendantUuid뿐 아니라 actor identity(state.self.uuid)와 그 참가자의 alive까지 전부
// 단일 useInGameStore.getState() 스냅샷에서 산출해야 한다 — React가 이 hook을 아직 리렌더하지
// 않은 구간(store 변경 ~ 다음 렌더 사이)에 ack가 settle되더라도 항상 최신 store 값을 반영하기
// 위해서다. 아래 테스트들은 이 함수가 어떤 React 렌더도 거치지 않고 zustand store 변경을 즉시
// 반영하는지 검증한다 — ref 기반(참가자 snapshot) 구현이었다면 렌더가 없는 한 이전 값을 계속
// 돌려줬을 것이다.

test("buildLatestTribunalVoteContext: 어떤 렌더도 없이 defendantUuid가 A→B로 바뀌면 즉시 새 값을 반영한다", () => {
  seedStore()

  const requestTimeSnapshot = buildLatestTribunalVoteContext()
  assert.equal(requestTimeSnapshot.defendantUuid, "defendant-a")

  // 렌더를 전혀 트리거하지 않고 store만 직접 mutate한다 — 소켓 이벤트 핸들러가 리렌더 전에
  // day_vote_resolved/night_result_applied 등을 반영하는 경우와 동일한 타이밍이다.
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

  // 로컬 플레이어가 이전/이후 피고인 어느 쪽도 아닌 채로 피고인이 바뀌는 경우: isDefendant는
  // 계속 false로 불변이지만 defendantUuid 원본 값은 정확히 갱신되어야 한다.
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

  // 렌더를 거치지 않고 players[].alive만 store에서 직접 바꾼다 — night_result_applied 등
  // 소켓 핸들러가 리렌더 전에 store를 갱신하는 것과 동일한 타이밍이다. 이것이 정확히 "settle
  // 시점에 alive가 최신 render snapshot이 아니라 최신 store 값을 반영해야 한다"는 요구사항의
  // 재현이다.
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

// ---------------------------------------------------------------------------
// useInGameTribunalVoteSubmit (실제 hook mount) — submit 시점 canonical actor 캡처
// ---------------------------------------------------------------------------
//
// submitTribunalVote는 gameId/dayIndex/defendantUuid는 렌더 시점 값(사용자가 화면에서 본 값)을
// 그대로 쓰지만, actorUuid("누가 제출하는가")만은 호출 시점에 useInGameStore.getState()를 직접
// 호출해 캡처해야 한다 — self가 렌더 이후·다음 리렌더 이전에 바뀌면 render selector 값(actorUuid)은
// 아직 stale하기 때문이다. 아래 테스트는 useInGameTribunalVoteSubmit 자체를 real 컴포넌트 안에서
// mount해 얻은 실제 submitTribunalVote 클로저를 호출하고, 그 호출이 useInGameStore.getState()를
// 통해 최신(canonical) self.uuid를 읽는지 검증한다. 이전 구현(render-value actorUuid를 그대로
// 넘기던 버전)이었다면 이 클로저는 submitTribunalVote 호출 중 getState()를 전혀 호출하지 않았을
// 것이므로 capturedActorUuidsAtCall이 비어 있어 이 테스트가 실패했을 것이다.
test("useInGameTribunalVoteSubmit: submitTribunalVote는 렌더 시점이 아니라 호출 시점에 useInGameStore.getState()의 canonical self.uuid를 동기 캡처한다", () => {
  seedStore({
    self: { uuid: "juror-1" },
    players: [
      { uuid: "juror-1", alive: true },
      { uuid: "juror-2", alive: true },
    ],
  })

  const hookResult = mountTribunalVoteSubmitHook()

  // 렌더 이후, 다음 리렌더가 일어나기 전에 store의 self가 교체된다(예: 재연결로 세션 identity가
  // 바뀌는 경우) — 이 hook은 아직 리렌더되지 않았으므로 render selector 기반 actorUuid는 여전히
  // "juror-1"이다.
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

// ---------------------------------------------------------------------------
// useInGameTribunalVoteSubmit (실제 hook mount, effect 포함) — settle 시점 stale ack 방어
// ---------------------------------------------------------------------------
//
// 위 mountTribunalVoteSubmitHook(renderToStaticMarkup)은 effect를 실행하지 않으므로 controller가
// 생성되지 않고, 실제 요청 제출·ack settle을 검증할 수 없다. 아래는 react-test-renderer + act로
// effect가 실제로 실행되는 mount를 만들어 controller가 생성되고, 실제 submitTribunalVote 호출이
// 진짜 socket 요청(emitWithAck)을 보내고, 그 요청이 살아있는 도중 store의 self 또는 players[].alive가
// 바뀐 뒤 도착한 성공/실패 ack가 hook의 실제 status/submittedVote/error에 반영되지 않는지 검증한다.

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
  // ack promise 체인(.then) 여러 겹이 풀리도록 여러 번 양보한다.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

// renderCount는 hook 본문이 실제로 몇 번 실행(=React가 몇 번 렌더)됐는지를 직접 센다. store만
// mutate하고 act로 감싸지 않으면 React의 rerender와 그에 이은 context-change effect(invalidate)는
// 아직 실행되지 않는다 — 아래 stale ack 테스트들은 ack settle 시점까지 renderCount가 그대로임을
// 명시적으로 확인해, ack가 거부된 이유가 controller의 getLatestContext 기반 isContextStale
// 검사 때문인지(맞음) hook의 invalidate effect가 generation을 먼저 무효화했기 때문인지(아님)를
// 구분한다.
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

  // act로 감싸지 않고 store만 직접 mutate한다 — React rerender/context-change effect가 아직
  // 이 hook에 반영되지 않았음을 renderCount로 증명한다.
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

  // act로 감싸지 않은 채 성공 ack를 도착시키고 promise chain만 흘려보낸다 — React rerender와
  // 그에 이은 invalidate effect는 여전히 실행되지 않는다.
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

  // 이제 React 업데이트(및 context-change effect에 따른 invalidate)를 flush한다.
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

  // actor 자체가 교체된다(예: 재연결로 세션 identity가 바뀌는 경우) — gameId/dayIndex/phase/
  // defendantUuid/alive는 요청 시점과 동일하게 유지되지만 self.uuid만 바뀐다.
  // act로 감싸지 않고 store만 직접 mutate한다 — React rerender/context-change effect가 아직
  // 이 hook에 반영되지 않았음을 renderCount로 증명한다.
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
