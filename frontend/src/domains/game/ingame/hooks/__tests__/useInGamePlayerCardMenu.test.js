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
installDomGlobal("KeyboardEvent", dom.window.KeyboardEvent)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL("../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `portrait-${index}` },
})
mock.module("../../utils/pickInGamePlayerFrame.js", {
  namedExports: {
    pickInGameJobPortrait: (index) => `portrait-${index}`,
    pickInGamePlayerFrame: (index) => `frame-${index}`,
    resolveInGamePlayerFrameSrc: (frameSrc) => frameSrc,
    resolveAccountCardFrameSrc: () => null,
  },
})
mock.module("../../../../user/api/emojiPalette.api.js", {
  namedExports: {
    getEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
    saveEmojiPaletteApi: async () => { throw new Error("network disabled in test") },
  },
})

const { act, render, renderHook, cleanup, fireEvent } = await import("@testing-library/react")
const { InGamePlayerSessionContext } = await import("../../components/InGamePlayerSessionContext.js")
const { InGamePlayerSessionProvider } = await import("../../components/InGamePlayerSessionProvider.jsx")
const { InGameActionContext } = await import("../../context/InGameActionContext.jsx")
const { useInGameActionPanel } = await import("../useInGameActionPanel.js")
const {
  useInGamePlayerCardMenu,
  buildInGamePlayerCardMenuItems,
  INGAME_CARD_MENU_ITEM_KINDS,
  INGAME_CARD_MENU_DAY_VOTE_LABEL,
  INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL,
  INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL,
  INGAME_CARD_MENU_DISABLED_REASONS,
} = await import("../useInGamePlayerCardMenu.js")
const { default: InGamePlayerBoard } = await import("../../components/board/InGamePlayerBoard.jsx")
const { INGAME_PLAYER_CARD_MENU_ATTR } = await import("../../components/board/InGamePlayerCardMenu.jsx")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { INGAME_E2E_ATTRS } = await import("../../constants/e2e/ingameE2eHooks.js")

const GAME_ID = "cm-v1-game"
const SELF_UUID = "u1"
const ROSTER = [
  { uuid: "u1", nickname: "A", themeIndex: 0 },
  { uuid: "u2", nickname: "B", themeIndex: 1 },
  { uuid: "u3", nickname: "C", themeIndex: 2 },
  { uuid: "u4", nickname: "D", themeIndex: 3 },
]

function makeActionContext(overrides = {}) {
  return {
    gameState: null,
    interactionBlocked: false,
    dayPhase: null,
    dayVoteTargets: [],
    dayVoteControlsEnabled: false,
    dayVoteStatus: "idle",
    dayVoteHasSubmitted: false,
    dayVoteLastSubmittedTargetId: null,
    selfAliveForControls: true,
    nightActionTargets: [],
    nightActionsLocked: true,
    nightActionStatus: "idle",
    nightActionLastSubmittedTargetId: null,
    nightActionLabel: null,
    isNightTurnActor: false,
    nightTurnRole: null,
    tribunalVoteControlsEnabled: false,
    tribunalVoteStatus: "idle",
    tribunalVoteAlive: true,
    selectedDayVoteTargetId: null,
    selectedNightTargetId: null,
    setSelectedDayVoteTargetId() {},
    setSelectedNightTargetId() {},
    submitDayVote() {},
    abstainDayVote() {},
    submitNightAction() {},
    skipNightAction() {},
    submitTribunalVote() {},
    ...overrides,
  }
}

function renderMenuHookWithContext(ctxValue, localPlayerId = SELF_UUID) {
  function Wrapper({ children }) {
    return React.createElement(
      InGamePlayerSessionContext.Provider,
      { value: { players: [], localPlayerId } },
      React.createElement(InGameActionContext.Provider, { value: ctxValue }, children),
    )
  }
  return renderHook(() => useInGamePlayerCardMenu(), { wrapper: Wrapper })
}

const ALIVE_DAY_TARGETS = [
  { id: "u2", name: "B", alive: true, connected: true },
  { id: "u3", name: "C", alive: true, connected: true },
]

function dayVoteContext(overrides = {}) {
  return makeActionContext({
    gameState: { id: GAME_ID, phase: "DAY", dayIndex: 1 },
    dayPhase: "DAY_VOTE",
    dayVoteTargets: ALIVE_DAY_TARGETS,
    dayVoteControlsEnabled: true,
    ...overrides,
  })
}

function nightContext(overrides = {}) {
  return makeActionContext({
    gameState: { id: GAME_ID, phase: "NIGHT", dayIndex: 1, nightTurnRole: "JOKER" },
    nightTurnRole: "JOKER",
    isNightTurnActor: true,
    nightActionsLocked: false,
    nightActionLabel: "암살",
    nightActionTargets: [
      { id: "u2", name: "B", alive: true, connected: true, selectable: true },
      { id: "u4", name: "D", alive: false, connected: true, selectable: false },
    ],
    ...overrides,
  })
}

function tribunalContext(overrides = {}) {
  return makeActionContext({
    gameState: { id: GAME_ID, phase: "TRIBUNAL", dayIndex: 1, tribunal: { defendantUuid: "u2" } },
    tribunalVoteControlsEnabled: true,
    ...overrides,
  })
}

test("AC-01: DAY_DISCUSSION에는 비활성 투표 항목만 뜨고, DAY_VOTE에서만 투표가 활성화된다", () => {
  const discussion = renderMenuHookWithContext(dayVoteContext({ dayPhase: "DAY_DISCUSSION" }))
  const discussionItems = discussion.result.current.getItems("u2")
  assert.equal(discussionItems.length, 1)
  assert.equal(discussionItems[0].kind, INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE)
  assert.equal(discussionItems[0].enabled, false)
  assert.equal(discussionItems[0].disabledReason, "토론 중입니다. 투표는 아직 열리지 않았습니다.")
  discussion.unmount()

  const vote = renderMenuHookWithContext(dayVoteContext())
  const items = vote.result.current.getItems("u2")
  assert.equal(items.length, 1)
  assert.equal(items[0].kind, INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE)
  assert.equal(items[0].label, INGAME_CARD_MENU_DAY_VOTE_LABEL)
  assert.equal(items[0].visible, true)
  assert.equal(items[0].enabled, true)
  assert.equal(items[0].disabledReason, null)
  vote.unmount()
})

test("AC-01: 본인 카드에는 낮 투표·밤 행동 항목이 노출되지 않는다", () => {
  const day = renderMenuHookWithContext(dayVoteContext())
  assert.deepEqual(day.result.current.getItems(SELF_UUID), [])
  day.unmount()

  const night = renderMenuHookWithContext(nightContext())
  assert.deepEqual(night.result.current.getItems(SELF_UUID), [])
  night.unmount()
})

test("AC-01: 투표 대상 목록에 없는 사람(사망자)은 항목이 뜨되 '대상이 아닙니다'로 잠긴다", () => {
  const rendered = renderMenuHookWithContext(dayVoteContext())
  const [item] = rendered.result.current.getItems("u4")
  assert.equal(item.visible, true)
  assert.equal(item.enabled, false)
  assert.equal(item.disabledReason, INGAME_CARD_MENU_DISABLED_REASONS.notTarget)
  rendered.unmount()
})

test("AC-01: 본인이 사망 상태면 대상 목록 부재보다 '사망한 플레이어는 행동할 수 없습니다'가 앞선다", () => {
  const rendered = renderMenuHookWithContext(
    dayVoteContext({ selfAliveForControls: false, dayVoteControlsEnabled: false, dayVoteTargets: [] }),
  )
  const [item] = rendered.result.current.getItems("u2")
  assert.equal(item.enabled, false)
  assert.equal(item.disabledReason, INGAME_CARD_MENU_DISABLED_REASONS.selfDead)
  rendered.unmount()
})

test("AC-01: 전송 중에는 '전송 중입니다'로 잠기고, 그 외 게이트가 닫히면 '현재 행동할 수 없습니다'다", () => {
  const submitting = renderMenuHookWithContext(dayVoteContext({ dayVoteStatus: "submitting" }))
  assert.equal(submitting.result.current.getItems("u2")[0].disabledReason,
    INGAME_CARD_MENU_DISABLED_REASONS.submitting)
  submitting.unmount()

  const gated = renderMenuHookWithContext(dayVoteContext({ dayVoteControlsEnabled: false }))
  assert.equal(gated.result.current.getItems("u2")[0].disabledReason,
    INGAME_CARD_MENU_DISABLED_REASONS.blocked)
  gated.unmount()
})

test("AC-01: 이미 투표한 대상 카드에는 투표취소만, 다른 카드에는 투표하기만 뜬다", () => {
  const rendered = renderMenuHookWithContext(
    dayVoteContext({
      dayVoteHasSubmitted: true,
      dayVoteLastSubmittedTargetId: "u3",
      selectedDayVoteTargetId: "u3",
    }),
  )
  const otherTarget = rendered.result.current.getItems("u2")
  assert.equal(otherTarget.length, 1)
  assert.equal(otherTarget[0].kind, INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE)
  assert.equal(otherTarget[0].label, INGAME_CARD_MENU_DAY_VOTE_LABEL)
  assert.equal(otherTarget[0].enabled, true)

  const votedTarget = rendered.result.current.getItems("u3")
  assert.equal(votedTarget.length, 1)
  assert.equal(votedTarget[0].kind, INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE_CANCEL)
  assert.equal(votedTarget[0].enabled, true)
  rendered.unmount()
})

test("AC-02: 투표취소 항목은 cast_day_vote targetId:null을 정확히 한 번 보낸다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)) })
  await act(async () => {
    transport.settleAll({ ok: true })
    useInGameStore.setState((s) => ({
      state: {
        ...s.state,
        self: {
          ...s.state.self,
          hasSubmittedDayVote: true,
          dayVoteTargetUuid: "u2",
          dayVoteRound: 1,
        },
      },
    }))
  })

  openCardMenu(view.container, "B")
  assert.equal(
    menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL),
    null,
    "투표한 대상 카드에 투표하기가 함께 뜨면 안 된다",
  )
  const cancelItem = menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL)
  assert.notEqual(cancelItem, null, "투표한 대상 카드에 투표취소만 있어야 한다")

  await act(async () => { fireEvent.click(cancelItem) })
  const sent = transport.sentFor("cast_day_vote")
  assert.equal(sent.length, 2, "투표취소가 정확히 한 번 더 나가지 않았다")
  assert.deepEqual(sent[1].payload, { gameId: GAME_ID, dayIndex: 1, targetId: null })
  view.unmount()
})

test("AC-01: 이미 밤 행동한 대상 카드에는 취소하기만, 다른 카드에는 직업 행동만 뜬다", () => {
  const rendered = renderMenuHookWithContext(
    nightContext({
      nightActionLastSubmittedTargetId: "u3",
      selectedNightTargetId: "u3",
    }),
  )
  const otherTarget = rendered.result.current.getItems("u2")
  assert.equal(otherTarget.length, 1)
  assert.equal(otherTarget[0].kind, INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION)
  assert.equal(otherTarget[0].label, "암살")
  assert.equal(otherTarget[0].enabled, true)

  const actedTarget = rendered.result.current.getItems("u3")
  assert.equal(actedTarget.length, 1)
  assert.equal(actedTarget[0].kind, INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION_CANCEL)
  assert.equal(actedTarget[0].label, INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL)
  assert.equal(actedTarget[0].enabled, true)
  rendered.unmount()
})

test("AC-01: 밤 항목은 내 역할 턴일 때만 뜨고, 선택 불가 대상은 '대상이 아닙니다'로 잠긴다", () => {
  const otherTurn = renderMenuHookWithContext(
    nightContext({ isNightTurnActor: false, nightTurnRole: "DOCTOR" }),
  )
  assert.deepEqual(otherTurn.result.current.getItems("u2"), [])
  otherTurn.unmount()

  const myTurn = renderMenuHookWithContext(nightContext())
  const [selectable] = myTurn.result.current.getItems("u2")
  assert.equal(selectable.kind, INGAME_CARD_MENU_ITEM_KINDS.NIGHT_ACTION)
  assert.equal(selectable.label, "암살")
  assert.equal(selectable.enabled, true)
  const [unselectable] = myTurn.result.current.getItems("u4")
  assert.equal(unselectable.enabled, false)
  assert.equal(unselectable.disabledReason, INGAME_CARD_MENU_DISABLED_REASONS.notTarget)
  myTurn.unmount()
})

test("AC-01: 밤 항목은 nightActionsLocked·submitting에서 각각 잠긴다", () => {
  const locked = renderMenuHookWithContext(nightContext({ nightActionsLocked: true }))
  assert.equal(locked.result.current.getItems("u2")[0].disabledReason,
    INGAME_CARD_MENU_DISABLED_REASONS.blocked)
  locked.unmount()

  const submitting = renderMenuHookWithContext(nightContext({ nightActionStatus: "submitting" }))
  assert.equal(submitting.result.current.getItems("u2")[0].disabledReason,
    INGAME_CARD_MENU_DISABLED_REASONS.submitting)
  submitting.unmount()
})

test("AC-01: 재판 항목은 피고 카드에만 유죄·무죄 두 개가 뜨고 다른 카드에는 없다", () => {
  const rendered = renderMenuHookWithContext(tribunalContext())
  const defendantItems = rendered.result.current.getItems("u2")
  assert.deepEqual(defendantItems.map((item) => item.kind), [
    INGAME_CARD_MENU_ITEM_KINDS.TRIBUNAL_GUILTY,
    INGAME_CARD_MENU_ITEM_KINDS.TRIBUNAL_NOT_GUILTY,
  ])
  assert.deepEqual(defendantItems.map((item) => item.vote), ["GUILTY", "NOT_GUILTY"])
  assert.deepEqual(defendantItems.map((item) => item.enabled), [true, true])
  assert.deepEqual(rendered.result.current.getItems("u3"), [])
  rendered.unmount()
})

test("AC-01: 재판 컨트롤이 닫혔거나 전송 중이면 두 항목이 같은 사유로 함께 잠긴다", () => {
  const blocked = renderMenuHookWithContext(tribunalContext({ tribunalVoteControlsEnabled: false }))
  assert.deepEqual(
    blocked.result.current.getItems("u2").map((item) => item.disabledReason),
    [INGAME_CARD_MENU_DISABLED_REASONS.blocked, INGAME_CARD_MENU_DISABLED_REASONS.blocked],
  )
  blocked.unmount()

  const submitting = renderMenuHookWithContext(tribunalContext({ tribunalVoteStatus: "submitting" }))
  assert.deepEqual(
    submitting.result.current.getItems("u2").map((item) => item.disabledReason),
    [INGAME_CARD_MENU_DISABLED_REASONS.submitting, INGAME_CARD_MENU_DISABLED_REASONS.submitting],
  )
  submitting.unmount()

  const dead = renderMenuHookWithContext(
    tribunalContext({ tribunalVoteControlsEnabled: false, tribunalVoteAlive: false }),
  )
  assert.equal(dead.result.current.getItems("u2")[0].disabledReason,
    INGAME_CARD_MENU_DISABLED_REASONS.selfDead)
  dead.unmount()
})

test("AC-01/AC-03: ENDED·조작 차단 상태에서는 어떤 단계의 항목도 노출되지 않고 메뉴도 열리지 않는다", () => {
  for (const base of [dayVoteContext(), nightContext(), tribunalContext()]) {
    const ended = renderMenuHookWithContext({ ...base, gameState: { ...base.gameState, phase: "ENDED" } })
    assert.deepEqual(ended.result.current.getItems("u2"), [], "ENDED에서 항목이 남았다")
    act(() => ended.result.current.openMenu("u2"))
    assert.equal(ended.result.current.openPlayerId, null, "ENDED에서 메뉴가 열렸다")
    ended.unmount()

    const blocked = renderMenuHookWithContext({ ...base, interactionBlocked: true })
    assert.deepEqual(blocked.result.current.getItems("u2"), [], "조작 차단 중에 항목이 남았다")
    act(() => blocked.result.current.openMenu("u2"))
    assert.equal(blocked.result.current.openPlayerId, null, "조작 차단 중에 메뉴가 열렸다")
    blocked.unmount()
  }
})

test("AC-01: 컨텍스트 Provider가 없으면(값 null) 항목을 만들지 않는다(빈 값을 꾸며 제출 경로를 열지 않는다)", () => {
  assert.deepEqual(buildInGamePlayerCardMenuItems(null, "u2", SELF_UUID), [])
  const rendered = renderMenuHookWithContext(null)
  assert.deepEqual(rendered.result.current.getItems("u2"), [])
  act(() => rendered.result.current.openMenu("u2"))
  assert.equal(rendered.result.current.openPlayerId, null)
  rendered.unmount()
})

function createControlledSocket() {
  const sent = []
  const pending = []
  const socket = {
    id: "cm-v1-socket",
    connected: true,
    on() {},
    off() {},
    emitWithAck(event, payload) {
      const entry = { event, payload }
      sent.push(entry)
      return new Promise((resolve) => {
        pending.push((response) => {
          entry.response = response
          resolve(response)
        })
      })
    },
    timeout() {
      return { emitWithAck: (event, payload) => socket.emitWithAck(event, payload) }
    },
  }
  return {
    socket,
    sent,
    sentFor(event) { return sent.filter((entry) => entry.event === event) },
    settleAll(response = { ok: true }) {
      const due = pending.splice(0, pending.length)
      for (const resolveAck of due) resolveAck(response)
    },
  }
}

function seedSession({
  phase, dayPhase = null, dayIndex = 1, role = "CITIZEN",
  deadUuids = [], tribunal = null, nightTurnRole = null, dayVoteRound = null,
}) {
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
        dayIndex,
        dayPhase,
        ...(tribunal ? { tribunal } : {}),
        ...(nightTurnRole ? { nightTurnRole } : {}),
        ...(dayVoteRound ? { dayVoteRound } : {}),
        players: ROSTER.map((player) => ({ ...player, alive: !deadUuids.includes(player.uuid) })),
        self: {
          uuid: SELF_UUID,
          nickname: "A",
          role,
          team: role === "JOKER" ? "JOKER" : "CITIZEN",
          ...(role === "JOKER" ? { allies: [] } : {}),
          hasActedThisPhase: false,
        },
      },
    })
  })
}

function ActionHarness({ interactionBlocked = false, children }) {
  const actionPanelValue = useInGameActionPanel({ interactionBlocked })
  return React.createElement(InGameActionContext.Provider, { value: actionPanelValue }, children)
}

function mountBoard({ interactionBlocked = false, strict = false } = {}) {
  const tree = React.createElement(
    InGamePlayerSessionProvider,
    null,
    React.createElement(ActionHarness, { interactionBlocked },
      React.createElement(InGamePlayerBoard)),
  )
  return render(strict ? React.createElement(React.StrictMode, null, tree) : tree)
}

function slotOf(container, nickname) {
  const card = container.querySelector(`[${INGAME_E2E_ATTRS.playerNickname}="${nickname}"]`)
  assert.notEqual(card, null, `${nickname} 카드를 찾지 못했다`)
  return card.closest('[role="button"]')
}

function menuNode(container) {
  return container.querySelector(`[${INGAME_PLAYER_CARD_MENU_ATTR}]`)
}

function menuIsOpen(container) {
  return menuNode(container) !== null
}

function menuButton(container, label) {
  const menu = menuNode(container)
  if (!menu) return null
  return [...menu.querySelectorAll("button")].find((node) => node.textContent.startsWith(label)) ?? null
}

function openCardMenu(container, nickname) {
  const slot = slotOf(container, nickname)
  if (menuIsOpen(container)) return slot
  act(() => {
    fireEvent.mouseDown(slot)
    fireEvent.click(slot)
  })
  return slot
}

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
  useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 0 })
  setSocket(null)
})

test("AC-02: 낮 투표 항목을 실제로 클릭하면 선택값이 먼저 서고 cast_day_vote가 정확히 1회 나간다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  assert.equal(menuIsOpen(view.container), true, "좌클릭으로 메뉴가 열리지 않았다")

  await act(async () => { fireEvent.click(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)) })

  const sent = transport.sentFor("cast_day_vote")
  assert.equal(sent.length, 1, "낮 투표가 정확히 한 번 나가지 않았다")
  assert.deepEqual(sent[0].payload, { gameId: GAME_ID, dayIndex: 1, targetId: "u2" })
  assert.equal(menuIsOpen(view.container), false, "제출 뒤 메뉴가 닫히지 않았다")

  await act(async () => { transport.settleAll({ ok: true }) })
  openCardMenu(view.container, "C")
  await act(async () => { fireEvent.click(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)) })
  const resent = transport.sentFor("cast_day_vote")
  assert.equal(resent.length, 2, "ACK 뒤 재투표가 나가지 않았다")
  assert.deepEqual(resent[1].payload, { gameId: GAME_ID, dayIndex: 1, targetId: "u3" })
  await act(async () => { transport.settleAll({ ok: true }) })
})

test("AC-02: 투표취소 뒤 같은 대상에 다시 투표하면 cast_day_vote가 정확히 1회 더 나간다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)) })
  await act(async () => {
    transport.settleAll({ ok: true })
    useInGameStore.setState((s) => ({
      state: {
        ...s.state,
        self: {
          ...s.state.self,
          hasSubmittedDayVote: true,
          dayVoteTargetUuid: "u2",
          dayVoteRound: 1,
        },
      },
    }))
  })
  assert.equal(transport.sentFor("cast_day_vote").length, 1)

  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_CANCEL_LABEL)) })
  await act(async () => {
    transport.settleAll({ ok: true })
    useInGameStore.setState((s) => ({
      state: {
        ...s.state,
        self: {
          ...s.state.self,
          hasSubmittedDayVote: true,
          dayVoteTargetUuid: null,
          dayVoteRound: 1,
        },
      },
    }))
  })

  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)) })
  const sent = transport.sentFor("cast_day_vote")
  assert.equal(sent.length, 3, "투표취소 뒤 같은 대상 재투표가 나가지 않았다")
  assert.deepEqual(sent[1].payload, { gameId: GAME_ID, dayIndex: 1, targetId: null })
  assert.deepEqual(sent[2].payload, { gameId: GAME_ID, dayIndex: 1, targetId: "u2" })
  await act(async () => { transport.settleAll({ ok: true }) })
})

test("AC-02: 같은 버튼을 한 틱에 두 번 눌러도, StrictMode로 마운트해도 제출은 1회다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard({ strict: true })
  openCardMenu(view.container, "B")
  const button = menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)
  await act(async () => {
    fireEvent.click(button)
    fireEvent.click(button)
  })
  assert.equal(transport.sentFor("cast_day_vote").length, 1, "연속 두 클릭이 두 번 제출됐다")
  await act(async () => { transport.settleAll({ ok: true }) })
})

test("AC-02: 취소하기 항목은 submit_night_action targetId:null을 정확히 한 번 보낸다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "NIGHT", role: "JOKER", nightTurnRole: "JOKER" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, "암살")) })
  await act(async () => { transport.settleAll({ ok: true }) })

  openCardMenu(view.container, "B")
  assert.equal(menuButton(view.container, "암살"), null, "행동한 대상 카드에 직업 행동이 함께 뜨면 안 된다")
  const cancelItem = menuButton(view.container, INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL)
  assert.notEqual(cancelItem, null, "행동한 대상 카드에 취소하기만 있어야 한다")

  await act(async () => { fireEvent.click(cancelItem) })
  const sent = transport.sentFor("submit_night_action")
  assert.equal(sent.length, 2, "취소하기가 정확히 한 번 더 나가지 않았다")
  assert.deepEqual(sent[1].payload, { gameId: GAME_ID, targetId: null })
  view.unmount()
})

test("AC-02: 밤 행동 항목은 submit_night_action을 1회 보내고, ACK 뒤 재제출이 다시 열린다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "NIGHT", role: "JOKER", nightTurnRole: "JOKER" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, "암살")) })

  let sent = transport.sentFor("submit_night_action")
  assert.equal(sent.length, 1, "밤 행동이 정확히 한 번 나가지 않았다")
  assert.deepEqual(sent[0].payload, { gameId: GAME_ID, targetId: "u2" })

  await act(async () => { transport.settleAll({ ok: true }) })
  openCardMenu(view.container, "C")
  await act(async () => { fireEvent.click(menuButton(view.container, "암살")) })
  sent = transport.sentFor("submit_night_action")
  assert.equal(sent.length, 2, "ACK 뒤 대상을 바꾼 재제출이 나가지 않았다")
  assert.deepEqual(sent[1].payload, { gameId: GAME_ID, targetId: "u3" })
  await act(async () => { transport.settleAll({ ok: true }) })
})

test("AC-02: 밤 — 취소하기 뒤 같은 대상에 다시 행동하면 submit_night_action이 정확히 1회 더 나간다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "NIGHT", role: "JOKER", nightTurnRole: "JOKER" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, "암살")) })
  assert.equal(transport.sentFor("submit_night_action").length, 1, "첫 밤 행동이 1회 나가지 않았다")

  openCardMenu(view.container, "B")
  const lockedItem = menuButton(view.container, "암살")
  assert.notEqual(lockedItem, null, "전송 중에 밤 항목이 사라졌다")
  assert.equal(lockedItem.disabled, true, "전송 중인데 밤 항목이 잠기지 않았다")
  await act(async () => { fireEvent.click(lockedItem) })
  assert.equal(transport.sentFor("submit_night_action").length, 1,
    "전송 중 같은 대상 재클릭이 두 번째 제출을 보냈다")

  await act(async () => { transport.settleAll({ ok: true }) })
  openCardMenu(view.container, "B")
  const cancelItem = menuButton(view.container, INGAME_CARD_MENU_NIGHT_ACTION_CANCEL_LABEL)
  assert.notEqual(cancelItem, null, "ACK 뒤 행동한 대상 카드에 취소하기가 떠야 한다")
  await act(async () => { fireEvent.click(cancelItem) })
  await act(async () => { transport.settleAll({ ok: true }) })

  openCardMenu(view.container, "B")
  const reopenedItem = menuButton(view.container, "암살")
  assert.notEqual(reopenedItem, null, "취소 뒤 같은 대상 카드에 직업 행동이 다시 떠야 한다")
  assert.equal(reopenedItem.disabled, false, "취소 뒤에도 밤 항목이 잠겨 있다")
  await act(async () => { fireEvent.click(reopenedItem) })

  const sent = transport.sentFor("submit_night_action")
  assert.equal(sent.length, 3, "취소 뒤 같은 대상 재행동이 나가지 않았다")
  assert.deepEqual(sent[0].payload, { gameId: GAME_ID, targetId: "u2" })
  assert.deepEqual(sent[1].payload, { gameId: GAME_ID, targetId: null })
  assert.deepEqual(sent[2].payload, { gameId: GAME_ID, targetId: "u2" },
    "재행동 payload가 첫 제출과 같은 대상이 아니다")
  assert.equal(menuIsOpen(view.container), false, "재행동 뒤 메뉴가 닫히지 않았다")
  await act(async () => { transport.settleAll({ ok: true }) })
})

test("AC-03: 열려 있는 카드를 한 번 더 누르면 토글로 닫히고, 다시 열면 제출이 1회 나간다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  const slot = openCardMenu(view.container, "B")
  assert.equal(menuIsOpen(view.container), true, "전제: 메뉴가 열려 있어야 한다")

  act(() => { fireEvent.click(slot) })
  assert.equal(menuIsOpen(view.container), false, "같은 카드를 다시 눌렀을 때 메뉴가 닫혀야 한다")

  openCardMenu(view.container, "B")
  assert.equal(menuIsOpen(view.container), true, "다시 연 뒤 메뉴가 열려 있어야 한다")

  await act(async () => { fireEvent.click(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)) })
  const sent = transport.sentFor("cast_day_vote")
  assert.equal(sent.length, 1, "다시 연 뒤 메뉴 항목이 제출되지 않았다")
  assert.deepEqual(sent[0].payload, { gameId: GAME_ID, dayIndex: 1, targetId: "u2" })
  await act(async () => { transport.settleAll({ ok: true }) })
})

test("AC-02: 재판 항목은 대상 선택 없이 cast_tribunal_vote를 1회 보낸다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "TRIBUNAL", tribunal: { defendantUuid: "u2" } })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  await act(async () => { fireEvent.click(menuButton(view.container, "유죄")) })

  const sent = transport.sentFor("cast_tribunal_vote")
  assert.equal(sent.length, 1, "재판 투표가 정확히 한 번 나가지 않았다")
  assert.equal(sent[0].payload.vote, "GUILTY")
  assert.equal(sent[0].payload.gameId, GAME_ID)
  assert.equal(menuIsOpen(view.container), false, "재판 제출 뒤 메뉴가 닫히지 않았다")
  await act(async () => { transport.settleAll({ ok: true, vote: "GUILTY" }) })
})

test("AC-02/AC-03: 게이트가 닫힌 뒤 보관해 둔 재판 handler를 불러도 제출이 0회다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "TRIBUNAL", tribunal: { defendantUuid: "u2" } })

  let menuApi = null
  function Probe() {
    menuApi = useInGamePlayerCardMenu()
    return null
  }
  const view = render(React.createElement(
    InGamePlayerSessionProvider,
    null,
    React.createElement(ActionHarness, null, React.createElement(Probe)),
  ))
  act(() => menuApi.openMenu("u2"))
  const staleHandler = menuApi.getItems("u2").find((item) => item.vote === "GUILTY").onSelect

  act(() => {
    useInGameStore.getState().applyTribunalResolved({
      gameId: GAME_ID, dayIndex: 1, phase: "NIGHT", defendantUuid: "u2",
      outcome: "NOT_GUILTY", counts: { guilty: 1, notGuilty: 3 }, executedUuid: null,
    })
  })
  assert.equal(useInGameStore.getState().state.phase, "NIGHT", "전제: 재판이 끝나 밤으로 넘어가야 한다")
  assert.equal(menuApi.openPlayerId, null, "단계가 바뀌었는데 메뉴가 닫히지 않았다")

  await act(async () => { staleHandler() })
  assert.equal(transport.sentFor("cast_tribunal_vote").length, 0,
    "닫힌 뒤 보관된 handler가 재판 투표를 보냈다")
  view.unmount()
})

test("AC-02/AC-03: 단계·메뉴 세대는 그대로인데 현재 게이트만 false가 되면 보관한 재판 handler가 제출 0회다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "TRIBUNAL", tribunal: { defendantUuid: "u2" } })

  let menuApi = null
  function Probe() {
    menuApi = useInGamePlayerCardMenu()
    return null
  }
  const view = render(React.createElement(
    InGamePlayerSessionProvider,
    null,
    React.createElement(ActionHarness, null, React.createElement(Probe)),
  ))
  act(() => menuApi.openMenu("u2"))
  assert.equal(menuApi.openPlayerId, "u2", "전제: 피고 카드 메뉴가 열려 있어야 한다")
  const guiltyItem = menuApi.getItems("u2").find((item) => item.vote === "GUILTY")
  assert.equal(guiltyItem.enabled, true, "전제: 캡처 시점에는 항목이 활성이어야 한다")
  const staleHandler = guiltyItem.onSelect

  act(() => {
    useInGameStore.setState((s) => ({
      state: {
        ...s.state,
        players: s.state.players.map((player) => (
          player.uuid === SELF_UUID ? { ...player, alive: false } : player
        )),
      },
    }))
  })

  assert.equal(useInGameStore.getState().state.phase, "TRIBUNAL", "전제: 단계는 그대로여야 한다")
  assert.equal(useInGameStore.getState().state.tribunal.defendantUuid, "u2",
    "전제: 피고는 그대로여야 한다")
  assert.equal(menuApi.openPlayerId, "u2",
    "전제: 게이트만 닫혔으므로 메뉴는 열린 채여야 한다(닫혔다면 세대 검사가 막은 것이라 이 시험이 무의미해진다)")
  assert.equal(menuApi.getItems("u2")[0].enabled, false, "전제: 지금의 게이트가 닫혀 있어야 한다")
  assert.equal(menuApi.getItems("u2")[0].disabledReason, INGAME_CARD_MENU_DISABLED_REASONS.selfDead)

  await act(async () => { staleHandler() })
  assert.equal(transport.sentFor("cast_tribunal_vote").length, 0,
    "게이트가 닫힌 뒤 보관된 handler가 재판 투표를 보냈다(캡처 시점 값으로 판단했다)")
  view.unmount()
})

const PENDING_CANCEL_ROUTES = [
  ["Esc", () => { fireEvent.keyDown(document, { key: "Escape" }) }],
  ["바깥 mousedown", () => { fireEvent.mouseDown(document.body) }],
  ["phase 전환", () => {
    useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, { outcome: "TIE" })
  }],
  ["dayPhase 전환", () => {
    useInGameStore.setState((s) => ({ state: { ...s.state, dayPhase: "DAY_DISCUSSION" } }))
  }],
  ["dayVoteRound 전환", () => {
    useInGameStore.setState((s) => ({ state: { ...s.state, dayVoteRound: 2 } }))
  }],
  ["identity 전환", () => { useAuthStore.setState({ identityGeneration: 11 }) }],
]

test("AC-03: 낮 투표 pending을 세운 직후 취소 사건이 오면 제출이 0회이고 메뉴도 닫힌다", async () => {
  for (const [label, cancel] of PENDING_CANCEL_ROUTES) {
    const transport = createControlledSocket()
    setSocket(transport.socket)
    seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

    const view = mountBoard()
    openCardMenu(view.container, "B")
    const voteItem = menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)
    assert.equal(voteItem?.disabled, false, `${label}: 전제로 투표 항목이 활성이어야 한다`)

    act(() => {
      fireEvent.click(voteItem)
      cancel()
    })
    await act(async () => {})

    assert.equal(transport.sentFor("cast_day_vote").length, 0,
      `${label}: 취소됐는데 보관하던 낮 투표가 전송됐다`)
    assert.equal(menuIsOpen(view.container), false, `${label}: 취소 뒤에도 메뉴가 열려 있다`)
    cleanup()
  }
})

test("AC-03: 밤 행동 pending을 세운 직후 조작이 차단되면 제출이 0회이고 메뉴도 닫힌다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "NIGHT", role: "JOKER", nightTurnRole: "JOKER" })

  function Screen({ blocked }) {
    return React.createElement(
      InGamePlayerSessionProvider,
      null,
      React.createElement(ActionHarness, { interactionBlocked: blocked },
        React.createElement(InGamePlayerBoard)),
    )
  }
  const view = render(React.createElement(Screen, { blocked: false }))
  openCardMenu(view.container, "B")
  const nightItem = menuButton(view.container, "암살")
  assert.equal(nightItem?.disabled, false, "전제로 밤 항목이 활성이어야 한다")

  act(() => {
    fireEvent.click(nightItem)
    view.rerender(React.createElement(Screen, { blocked: true }))
  })
  await act(async () => {})

  assert.equal(transport.sentFor("submit_night_action").length, 0,
    "조작이 차단됐는데 보관하던 밤 행동이 전송됐다")
  assert.equal(menuIsOpen(view.container), false, "차단 뒤에도 메뉴가 열려 있다")
})

test("AC-03: 바깥 mousedown과 Esc는 메뉴를 닫고 아무것도 제출하지 않는다", async () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  assert.equal(menuIsOpen(view.container), true)
  act(() => { fireEvent.mouseDown(document.body) })
  assert.equal(menuIsOpen(view.container), false, "바깥 클릭으로 메뉴가 닫히지 않았다")

  openCardMenu(view.container, "B")
  assert.equal(menuIsOpen(view.container), true)
  act(() => { fireEvent.keyDown(document, { key: "Escape" }) })
  assert.equal(menuIsOpen(view.container), false, "Esc로 메뉴가 닫히지 않았다")

  assert.equal(transport.sent.length, 0, "닫힘 경로가 무언가를 전송했다")
})

test("AC-03: 메뉴 안의 mousedown은 바깥 클릭으로 처리되지 않는다(정상 클릭이 닫히지 않는다)", () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  openCardMenu(view.container, "B")
  act(() => { fireEvent.mouseDown(menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)) })
  assert.equal(menuIsOpen(view.container), true, "메뉴 안 mousedown이 메뉴를 닫았다")
})

test("AC-03: 단계·낮 하위 구간·밤 역할 턴·투표 라운드·신원이 바뀌면 메뉴가 닫힌다", () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)

  const transitions = [
    ["phase", () => seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" }),
      () => useInGameStore.getState().applyDayVoteResolvedToPhase(GAME_ID, 1, { outcome: "TIE" })],
    ["dayPhase", () => seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" }),
      () => useInGameStore.setState((s) => ({ state: { ...s.state, dayPhase: "DAY_DISCUSSION" } }))],
    ["nightTurnRole", () => seedSession({ phase: "NIGHT", role: "JOKER", nightTurnRole: "JOKER" }),
      () => useInGameStore.setState((s) => ({ state: { ...s.state, nightTurnRole: "DOCTOR" } }))],
    ["dayVoteRound", () => seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" }),
      () => useInGameStore.setState((s) => ({ state: { ...s.state, dayVoteRound: 2 } }))],
    ["identity", () => seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" }),
      () => useAuthStore.setState({ identityGeneration: 7 })],
  ]

  for (const [label, seed, transition] of transitions) {
    seed()
    const view = mountBoard()
    openCardMenu(view.container, "B")
    assert.equal(menuIsOpen(view.container), true, `${label}: 전제로 메뉴가 열려 있어야 한다`)
    act(() => { transition() })
    assert.equal(menuIsOpen(view.container), false, `${label}이(가) 바뀌었는데 메뉴가 닫히지 않았다`)
    cleanup()
  }
  assert.equal(transport.sent.length, 0, "단계 전환 경로가 무언가를 전송했다")
})

test("AC-03: 조작이 차단된 동안에는 카드를 눌러도 메뉴가 열리지 않는다", () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard({ interactionBlocked: true })
  openCardMenu(view.container, "B")
  assert.equal(menuIsOpen(view.container), false, "조작 차단 중에 메뉴가 열렸다")
  assert.equal(transport.sent.length, 0)
})

test("AC-03: 메뉴를 연 뒤 조작이 차단되면 메뉴가 닫힌다", () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  function Screen({ blocked }) {
    return React.createElement(
      InGamePlayerSessionProvider,
      null,
      React.createElement(ActionHarness, { interactionBlocked: blocked },
        React.createElement(InGamePlayerBoard)),
    )
  }
  const view = render(React.createElement(Screen, { blocked: false }))
  openCardMenu(view.container, "B")
  assert.equal(menuIsOpen(view.container), true)
  act(() => { view.rerender(React.createElement(Screen, { blocked: true })) })
  assert.equal(menuIsOpen(view.container), false, "조작 차단으로 전환됐는데 메뉴가 닫히지 않았다")
  assert.equal(transport.sent.length, 0)
})

test("AC-03: 카드가 초점을 가진 채 Enter·Space를 누르면 열리고, 메뉴 버튼에서 올라온 키는 무시한다", () => {
  const transport = createControlledSocket()
  setSocket(transport.socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  const slot = slotOf(view.container, "B")
  act(() => { fireEvent.keyDown(slot, { key: "Enter" }) })
  assert.equal(menuIsOpen(view.container), true, "Enter로 메뉴가 열리지 않았다")

  act(() => { fireEvent.keyDown(document, { key: "Escape" }) })
  act(() => { fireEvent.keyDown(slot, { key: " " }) })
  assert.equal(menuIsOpen(view.container), true, "Space로 메뉴가 열리지 않았다")

  const voteItem = menuButton(view.container, INGAME_CARD_MENU_DAY_VOTE_LABEL)
  act(() => { fireEvent.keyDown(voteItem, { key: " " }) })
  assert.equal(menuIsOpen(view.container), true)
  assert.equal(transport.sent.length, 0, "키보드 열기가 무언가를 전송했다")
})

test("AC-03: 메뉴가 열린 카드 위의 mousedown은 바깥 클릭으로 처리되지 않는다(앵커 등록)", () => {
  setSocket(createControlledSocket().socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  const slot = openCardMenu(view.container, "B")
  act(() => { fireEvent.mouseDown(slot) })
  assert.equal(menuIsOpen(view.container), true, "자기 카드 위 mousedown이 메뉴를 닫았다")

  const other = slotOf(view.container, "C")
  act(() => {
    fireEvent.mouseDown(other)
    fireEvent.click(other)
  })
  assert.equal(menuIsOpen(view.container), true)
  assert.equal(
    menuNode(view.container).closest('[role="button"]') === other, true,
    "다른 카드를 눌렀는데 메뉴가 그 카드로 옮겨가지 않았다",
  )
})

test("AC-03: 카드 우클릭(contextmenu)으로는 메뉴가 열리지 않는다", () => {
  setSocket(createControlledSocket().socket)
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const view = mountBoard()
  act(() => { fireEvent.contextMenu(slotOf(view.container, "B")) })
  assert.equal(menuIsOpen(view.container), false, "우클릭으로 메뉴가 열렸다")
})

test("V-2(AC-03): 방장이어도 카드 행동 오버레이에 추방 항목은 없다(설정 → 방관리만)", () => {
  const ctx = dayVoteContext({ hostUuid: SELF_UUID })
  const items = buildInGamePlayerCardMenuItems(ctx, "u2", SELF_UUID)
  assert.deepEqual(items.map((entry) => entry.kind), [INGAME_CARD_MENU_ITEM_KINDS.DAY_VOTE])
})
