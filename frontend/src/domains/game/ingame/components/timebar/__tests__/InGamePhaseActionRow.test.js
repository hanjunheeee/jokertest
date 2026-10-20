/**
 * CN V-2 AC-01 — 시간흐름 바 아래 **단계 행동 줄**의 노출·활성·호출 계약.
 *
 * 제어 패널(InGameActionPanel)이 사라지면서 대상 없는 행동 버튼이 전부 이 줄로 옮겨왔다.
 * 그래서 이 시험이 지켜야 하는 것은 두 가지다:
 *
 *   1. 단계·역할별로 **정확히 그 버튼들만** 뜬다(다른 단계의 버튼이 새어 나오지 않는다).
 *   2. 각 버튼은 대응하는 컨텍스트 함수를 **정확히 1회** 부르고, 잠겼으면 0회다.
 *
 * 앞부분은 순수 계산이라 컨텍스트 값을 직접 주입해 행렬을 훑는다. 뒷부분(⑤)은 **실제**
 * useInGameActionPanel·실제 zustand store·실제 InGameActionProvider를 마운트해서, 사망·조작
 * 차단이 실제 활성식으로 잠기고 소켓 전송이 0회인지 본다 — 목 컨텍스트만으로는 "내가 적은
 * 플래그가 내가 적은 대로 동작한다"까지만 보이기 때문이다.
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
})
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MouseEvent", dom.window.MouseEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
installDomGlobal("IntersectionObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// 바깥 경계(자산 선택·HTTP·효과음)만 대역한다.
mock.module("../../../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `portrait-${index}` },
})
mock.module("../../../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `portrait-${index}`,
    pickInGamePlayerFrame: (index) => `frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc) => frameSrc,
    resolveAccountCardFrameSrc: () => null,
  },
})
mock.module("@/shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
const rejectNetwork = async () => { throw new Error("이 시험에서 예기치 않은 HTTP 호출이 일어났다") }
mock.module("@/shared/api/client.js", {
  namedExports: {
    api: { get: rejectNetwork, post: rejectNetwork, put: rejectNetwork, patch: rejectNetwork, delete: rejectNetwork },
    apiClient: rejectNetwork,
    refreshAccessToken: rejectNetwork,
  },
})
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: {
    dispatchSfxEvent: () => {}, dispatchUiSfx: () => {}, useSfxRuntime: () => {},
    getSfxMix: () => ({ gain: 0, muted: true }), subscribeSfxMix: () => () => {},
  },
})

let currentSocket = null
const socketSubscribers = new Set()
mock.module("@/shared/socket/socketClient.js", {
  namedExports: {
    getSocket: () => currentSocket,
    subscribeSocket: (cb) => { socketSubscribers.add(cb); return () => socketSubscribers.delete(cb) },
    setSocket: (next) => {
      currentSocket = next
      for (const cb of [...socketSubscribers]) cb()
    },
  },
})

const { act, render, cleanup, fireEvent } = await import("@testing-library/react")
const { default: InGamePhaseActionRow, INGAME_PHASE_ACTIONS } = await import("../InGamePhaseActionRow.jsx")
const { default: InGameCornerActionPanel } = await import("../../actions/InGameCornerActionPanel.jsx")
const { InGameActionContext } = await import("../../../context/InGameActionContext.jsx")
const { InGamePlayerSessionProvider } = await import("../../InGamePlayerSessionProvider.jsx")
const { InGameActionProvider } = await import("../../../pages/InGamePage.jsx")
const { useInGameStore } = await import("../../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../../auth/store/auth.store.js")

// ═══════════════════════════════════════════════════════════════════════════
// ①~④ 단계·역할별 노출 / 활성 / 정확히 1회
// ═══════════════════════════════════════════════════════════════════════════

/** 모든 게이트가 닫힌 기본형. 시험이 필요한 축만 연다. */
function makeCtx(overrides = {}) {
  return {
    gameState: null,
    dayPhase: null,
    dayReadyStatus: "idle",
    dayReadyControlsEnabled: false,
    submitDayReady: mock.fn(),
    dayVoteControlsEnabled: false,
    dayVoteStatus: "idle",
    abstainDayVote: mock.fn(),
    dayVoteResolveControlsEnabled: false,
    dayVoteResolveStatus: "idle",
    resolveDayVote: mock.fn(),
    tribunalResolveControlsEnabled: false,
    tribunalResolveLocked: false,
    resolveTribunalVote: mock.fn(),
    isNightTurnActor: false,
    nightActionsLocked: true,
    nightActionStatus: "idle",
    skipNightAction: mock.fn(),
    resolveNightStatus: "idle",
    resolveNight: mock.fn(),
    ...overrides,
  }
}

function renderRow(ctx) {
  return render(React.createElement(
    InGameActionContext.Provider, { value: ctx },
    React.createElement(InGamePhaseActionRow),
  ))
}

const buttonFor = (container, action) =>
  container.querySelector(`[data-ingame-phase-action="${action}"]`)

/** 이 줄이 그린 버튼의 action 표식 전부(순서 그대로). */
const renderedActions = (container) =>
  [...container.querySelectorAll("[data-ingame-phase-action]")]
    .map((node) => node.getAttribute("data-ingame-phase-action"))

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
  useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 0 })
  currentSocket = null
  for (const cb of [...socketSubscribers]) cb()
})

test("AC-01: 컨텍스트가 없으면 줄 자체를 그리지 않는다", () => {
  const view = render(React.createElement(
    InGameActionContext.Provider, { value: null },
    React.createElement(InGamePhaseActionRow),
  ))
  assert.deepEqual(renderedActions(view.container), [])
})

test("AC-01①: 낮 토론 — 낮 준비 버튼만 뜨고, 활성일 때 submitDayReady를 정확히 1회 부른다", () => {
  const ctx = makeCtx({
    gameState: { phase: "DAY" }, dayPhase: "DAY_DISCUSSION", dayReadyControlsEnabled: true,
  })
  const view = renderRow(ctx)

  assert.deepEqual(renderedActions(view.container), [INGAME_PHASE_ACTIONS.DAY_READY],
    "낮 토론에 준비 버튼 말고 다른 단계의 버튼이 새어 나왔다")
  const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_READY)
  assert.equal(button.disabled, false)
  fireEvent.click(button)
  assert.equal(ctx.submitDayReady.mock.callCount(), 1, "낮 준비 클릭이 정확히 1회가 아니다")
})

test("AC-01①: 낮 토론 — dayReadyControlsEnabled가 false면 비활성이고 클릭해도 0회다", () => {
  const ctx = makeCtx({
    gameState: { phase: "DAY" }, dayPhase: "DAY_DISCUSSION", dayReadyControlsEnabled: false,
  })
  const view = renderRow(ctx)

  const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_READY)
  assert.equal(button.disabled, true)
  fireEvent.click(button)
  assert.equal(ctx.submitDayReady.mock.callCount(), 0, "잠긴 낮 준비 버튼이 제출을 보냈다")
})

test("AC-01②: 낮 투표 — 낮 집계만 뜨고(기권은 우측 하단 패널) resolveDayVote를 1회 부른다", () => {
  const ctx = makeCtx({
    gameState: { phase: "DAY" },
    dayPhase: "DAY_VOTE",
    dayVoteControlsEnabled: true,
    dayVoteResolveControlsEnabled: true,
  })
  const view = renderRow(ctx)

  assert.deepEqual(renderedActions(view.container), [INGAME_PHASE_ACTIONS.DAY_VOTE_RESOLVE])

  fireEvent.click(buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_RESOLVE))
  assert.equal(ctx.resolveDayVote.mock.callCount(), 1, "낮 집계 클릭이 정확히 1회가 아니다")
  assert.equal(ctx.abstainDayVote.mock.callCount(), 0, "집계 클릭이 기권까지 불렀다")
})

test("AC-01②: 낮 투표 — dayVoteResolveControlsEnabled가 false면 집계가 잠기고 클릭해도 0회다", () => {
  const ctx = makeCtx({
    gameState: { phase: "DAY" }, dayPhase: "DAY_VOTE",
    dayVoteControlsEnabled: true, dayVoteResolveControlsEnabled: false,
  })
  const view = renderRow(ctx)

  const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_RESOLVE)
  assert.equal(button.disabled, true)
  fireEvent.click(button)
  assert.equal(ctx.resolveDayVote.mock.callCount(), 0, "잠긴 집계 버튼이 요청을 보냈다")
})

test("AC-01③: 재판 — 재판 판정 버튼이 뜨고 활성일 때만 resolveTribunalVote를 1회 부른다", () => {
  // TRIBUNAL은 DAY의 하위 구간이 아니라 별개의 최상위 phase다 — dayPhase는 null이다.
  const enabled = makeCtx({
    gameState: { phase: "TRIBUNAL" }, tribunalResolveControlsEnabled: true,
  })
  let view = renderRow(enabled)
  assert.deepEqual(renderedActions(view.container), [INGAME_PHASE_ACTIONS.TRIBUNAL_RESOLVE],
    "재판에 판정 버튼 말고 다른 단계의 버튼이 새어 나왔다")
  fireEvent.click(buttonFor(view.container, INGAME_PHASE_ACTIONS.TRIBUNAL_RESOLVE))
  assert.equal(enabled.resolveTribunalVote.mock.callCount(), 1)
  cleanup()

  const locked = makeCtx({
    gameState: { phase: "TRIBUNAL" }, tribunalResolveControlsEnabled: false, tribunalResolveLocked: true,
  })
  view = renderRow(locked)
  const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.TRIBUNAL_RESOLVE)
  assert.equal(button.disabled, true)
  fireEvent.click(button)
  assert.equal(locked.resolveTribunalVote.mock.callCount(), 0, "잠긴 판정 버튼이 요청을 보냈다")
})

test("AC-01④: 밤 — 내 역할 턴이면 밤 종료만 뜨고(건너뛰기는 우측 하단 패널) resolveNight을 1회 부른다", () => {
  const ctx = makeCtx({
    gameState: { phase: "NIGHT" }, isNightTurnActor: true, nightActionsLocked: false,
  })
  const view = renderRow(ctx)

  assert.deepEqual(renderedActions(view.container), [INGAME_PHASE_ACTIONS.NIGHT_RESOLVE])

  fireEvent.click(buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_RESOLVE))
  assert.equal(ctx.resolveNight.mock.callCount(), 1, "밤 종료 클릭이 정확히 1회가 아니다")
  assert.equal(ctx.skipNightAction.mock.callCount(), 0, "밤 종료 클릭이 건너뛰기를 불렀다")
})

test("AC-01④: 밤 — nightActionsLocked여도 밤 종료는 그대로 열려 있다", () => {
  const ctx = makeCtx({
    gameState: { phase: "NIGHT" }, isNightTurnActor: true, nightActionsLocked: true,
  })
  const view = renderRow(ctx)

  const resolve = buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_RESOLVE)
  assert.equal(resolve.disabled, false, "밤 행동 잠금이 밤 종료까지 잠갔다")
  fireEvent.click(resolve)
  assert.equal(ctx.resolveNight.mock.callCount(), 1)
})

test("AC-01④: 밤 — resolveNightStatus가 idle이 아니면 밤 종료가 잠기고 클릭해도 0회다", () => {
  for (const status of ["resolving", "resolved"]) {
    const ctx = makeCtx({
      gameState: { phase: "NIGHT" }, isNightTurnActor: true,
      nightActionsLocked: false, resolveNightStatus: status,
    })
    const view = renderRow(ctx)
    const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_RESOLVE)
    assert.equal(button.disabled, true, `resolveNightStatus=${status}인데 밤 종료가 열려 있다`)
    fireEvent.click(button)
    assert.equal(ctx.resolveNight.mock.callCount(), 0)
    cleanup()
  }
})

test("AC-01④: 밤 — 내 역할 턴이 아니면 밤 버튼을 하나도 그리지 않는다", () => {
  const ctx = makeCtx({
    gameState: { phase: "NIGHT" }, isNightTurnActor: false, nightActionsLocked: false,
  })
  const view = renderRow(ctx)
  assert.deepEqual(renderedActions(view.container), [],
    "내 턴이 아닌데 밤 버튼이 떴다(잠긴 버튼조차 보이면 안 된다)")
})

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ 실제 useInGameActionPanel + 실제 Provider — 사망·조작 차단 잠금과 송신 0회
// ═══════════════════════════════════════════════════════════════════════════

const GAME_ID = "cn-v2-row"
const SELF_UUID = "u1"

function createRecordingSocket() {
  const sent = []
  const socket = {
    id: "front-cn-v2-row",
    connected: true,
    on() {},
    off() {},
    emit(event, payload, callback) {
      sent.push({ event, payload })
      if (typeof callback === "function") callback({ ok: true })
    },
    timeout() { return socket },
    emitWithAck(event, payload) {
      sent.push({ event, payload })
      return new Promise(() => {})
    },
  }
  return { socket, sent }
}

function seedSession({ phase, dayPhase = null, selfAlive = true, role = "CITIZEN", nightTurnRole = null }) {
  act(() => {
    useAuthStore.setState({
      isLoggedIn: true, user: { uuid: SELF_UUID, nickname: "A" }, identityGeneration: 0,
    })
    useInGameStore.setState({ gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0 })
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase,
        dayIndex: 1,
        dayPhase,
        ...(nightTurnRole ? { nightTurnRole } : {}),
        players: [
          { uuid: SELF_UUID, nickname: "A", themeIndex: 0, alive: selfAlive },
          { uuid: "u2", nickname: "B", themeIndex: 1, alive: true },
          { uuid: "u3", nickname: "C", themeIndex: 2, alive: true },
        ],
        self: {
          uuid: SELF_UUID, nickname: "A", role,
          team: role === "JOKER" ? "JOKER" : "CITIZEN",
          ...(role === "JOKER" ? { allies: [] } : {}),
          hasActedThisPhase: false,
        },
      },
    })
  })
}

/**
 * 이 줄이 낼 수 있는 **모든** 송신 사건. 잠금 시험은 이름 하나가 아니라 이 집합 전체가
 * 비었는지를 본다 — 예전에는 존재하지 않는 이름("ready_day_vote")으로 걸러서, 버튼이 실제로
 * 보냈더라도 필터가 항상 빈 배열을 돌려주는 **공허한 단언**이었다. 아래 "송신이 실제로
 * 관측된다"(대조군) 시험이 이 집합과 기록 소켓이 살아 있음을 먼저 증명한다.
 */
const PHASE_ACTION_EVENTS = [
  "ready_for_day_vote", "cast_day_vote", "resolve_day_vote", "submit_night_action", "resolve_night",
]

const actionEventsOf = (transport) =>
  transport.sent.filter((entry) => PHASE_ACTION_EVENTS.includes(entry.event))

/** 실제 조작 Provider 아래에 실제 행동 줄만 마운트한다(페이지 전체 오버레이는 끌어오지 않는다). */
function mountRealRow({ interactionBlocked = false }) {
  let view
  act(() => {
    view = render(React.createElement(
      InGamePlayerSessionProvider,
      null,
      React.createElement(InGameActionProvider, { interactionBlocked },
        React.createElement(React.Fragment, null,
          React.createElement(InGamePhaseActionRow),
          React.createElement(InGameCornerActionPanel, { onVoteStatusClick: () => {} }),
        )),
    ))
  })
  return view
}

test("AC-01⑤: 사망한 참가자는 실제 훅의 활성식으로 낮 준비가 잠기고 송신이 0회다", () => {
  const transport = createRecordingSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  seedSession({ phase: "DAY", dayPhase: "DAY_DISCUSSION", selfAlive: false })

  const view = mountRealRow({ interactionBlocked: false })
  const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_READY)
  assert.notEqual(button, null, "전제: 낮 토론에는 준비 버튼이 있어야 한다")
  assert.equal(button.disabled, true, "사망자에게 낮 준비가 열려 있다")
  act(() => { fireEvent.click(button) })
  assert.deepEqual(actionEventsOf(transport), [])
})

/**
 * 대조군. 위아래의 "송신 0회" 단언들이 **버튼이 막혀서** 통과하는 것이지, 이 시험 장치가
 * 애초에 아무 것도 관측하지 못해서 통과하는 것이 아님을 증명한다.
 */
test("AC-01⑤: 잠기지 않은 낮 준비는 실제로 ready_for_day_vote를 1회 보낸다(대조군)", () => {
  const transport = createRecordingSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  seedSession({ phase: "DAY", dayPhase: "DAY_DISCUSSION", selfAlive: true })

  const view = mountRealRow({ interactionBlocked: false })
  const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_READY)
  assert.equal(button.disabled, false, "전제: 생존·비차단이면 낮 준비가 열려 있어야 한다")
  act(() => { fireEvent.click(button) })
  assert.deepEqual(actionEventsOf(transport).map((entry) => entry.event), ["ready_for_day_vote"],
    "행동 줄의 클릭이 실제 송신으로 이어지지 않았다(잠금 시험이 공허하다)")
})

test("AC-01⑤: interactionBlocked면 낮 토론 준비가 잠기고 송신이 0회다", () => {
  const transport = createRecordingSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  // 살아 있는 참가자다 — 잠그는 것은 오직 조작 차단뿐임을 분리해서 본다.
  seedSession({ phase: "DAY", dayPhase: "DAY_DISCUSSION", selfAlive: true })

  const view = mountRealRow({ interactionBlocked: true })
  const button = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_READY)
  assert.notEqual(button, null, "전제: 낮 토론에는 준비 버튼이 있어야 한다")
  assert.equal(button.disabled, true, "조작 차단 중인데 낮 준비가 열려 있다")
  act(() => { fireEvent.click(button) })
  assert.deepEqual(actionEventsOf(transport), [])
})

test("AC-01⑤: 사망한 참가자는 기권이 잠기지만 낮 집계는 그대로 열려 있다(생존 조건을 새로 붙이지 않는다)", () => {
  const transport = createRecordingSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE", selfAlive: false })

  const view = mountRealRow({ interactionBlocked: false })
  const abstain = buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN)
  assert.equal(abstain.disabled, true, "사망자에게 기권이 열려 있다")
  act(() => { fireEvent.click(abstain) })
  assert.deepEqual(actionEventsOf(transport), [])

  assert.equal(buttonFor(view.container, INGAME_PHASE_ACTIONS.DAY_VOTE_RESOLVE).disabled, false,
    "낮 집계에 없던 생존 조건이 새로 붙었다")
})

test("AC-01⑤: interactionBlocked면 낮 투표(기권·집계)가 함께 잠기고 송신이 0회다", () => {
  const transport = createRecordingSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE", selfAlive: true })

  const view = mountRealRow({ interactionBlocked: true })
  for (const action of [INGAME_PHASE_ACTIONS.DAY_VOTE_ABSTAIN, INGAME_PHASE_ACTIONS.DAY_VOTE_RESOLVE]) {
    const button = buttonFor(view.container, action)
    assert.notEqual(button, null, `전제: ${action} 버튼이 있어야 한다`)
    assert.equal(button.disabled, true, `조작 차단 중인데 ${action}이 열려 있다`)
    act(() => { fireEvent.click(button) })
  }
  assert.deepEqual(actionEventsOf(transport), [])
})

test("AC-01⑤: 사망한 참가자는 밤 건너뛰기가 잠기지만, 밤 종료는 resolveNightStatus로만 잠긴다", () => {
  const transport = createRecordingSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  // 죽은 역할의 턴이든 산 역할의 턴이든 턴 판정은 같다 — 그래서 버튼 자체는 뜨고, 잠금만 걸린다.
  seedSession({ phase: "NIGHT", selfAlive: false, role: "JOKER", nightTurnRole: "JOKER" })

  const view = mountRealRow({ interactionBlocked: false })
  const skip = buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_SKIP)
  assert.notEqual(skip, null, "전제: 내 역할 턴이면 밤 버튼이 떠야 한다")
  assert.equal(skip.disabled, true, "사망자에게 밤 건너뛰기가 열려 있다")
  act(() => { fireEvent.click(skip) })
  assert.deepEqual(actionEventsOf(transport), [])

  assert.equal(buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_RESOLVE).disabled, false,
    "밤 종료에 없던 생존 조건이 새로 붙었다")
})

test("AC-01⑤: interactionBlocked면 밤 건너뛰기가 잠기고 송신이 0회다", () => {
  const transport = createRecordingSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  // 살아 있는 내 역할 턴이다 — 잠그는 것은 오직 조작 차단뿐임을 분리해서 본다.
  seedSession({ phase: "NIGHT", selfAlive: true, role: "JOKER", nightTurnRole: "JOKER" })

  const view = mountRealRow({ interactionBlocked: true })
  const skip = buttonFor(view.container, INGAME_PHASE_ACTIONS.NIGHT_SKIP)
  assert.notEqual(skip, null, "전제: 내 역할 턴이면 밤 버튼이 떠야 한다")
  assert.equal(skip.disabled, true, "조작 차단 중인데 밤 건너뛰기가 열려 있다")
  act(() => { fireEvent.click(skip) })
  assert.deepEqual(actionEventsOf(transport), [])
})
