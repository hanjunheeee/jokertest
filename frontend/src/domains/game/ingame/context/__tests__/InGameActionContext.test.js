/**
 * CM V-1 AC-05 — useInGameActionPanel이 **단일 인스턴스**로 불려, 컨트롤 패널과 플레이어 카드
 * 메뉴가 같은 선택 상태·같은 제출 상태를 공유한다.
 *
 * 컨텍스트 헬퍼·store·라운드 계산을 mock하지 않는다. 대역은 바깥 경계뿐이다 — 소켓 전송,
 * HTTP, 효과음 런타임, 자산 선택.
 *
 *   (1) Provider가 주는 값이 두 소비 위치에서 **같은 참조**다(setter까지 toBe).
 *   (a)(b) 낮: 패널에서 고른 대상과 메뉴에서 고른 대상이 한 칸을 공유한다(양방향).
 *   (c)(d) 밤: 같은 계약을 밤 대상 선택에서도 본다(양방향).
 *   (e)(f) 재판: 한쪽의 제출 진행·완료 상태가 다른 쪽에 그대로 보인다(양방향).
 *   (g) 각 단계의 전송은 정확히 1회다.
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
installDomGlobal("alert", () => {})
dom.window.alert = () => {}
dom.window.confirm = () => false
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
const { RouterProvider, createMemoryRouter } = await import("react-router-dom")
const { default: InGamePage, InGameActionProvider } = await import("../../pages/InGamePage.jsx")
const { InGameActionContext } = await import("../InGameActionContext.jsx")
const { InGamePlayerSessionProvider } = await import("../../components/InGamePlayerSessionProvider.jsx")
const { default: InGameActionPanel } = await import("../../components/actions/InGameActionPanel.jsx")
const { default: InGamePlayerBoard } = await import("../../components/board/InGamePlayerBoard.jsx")
const { useInGameStore } = await import("../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { INGAME_PLAYER_CARD_MENU_ATTR } = await import("../../components/board/InGamePlayerCardMenu.jsx")
const {
  INGAME_CARD_MENU_DAY_VOTE_LABEL, INGAME_CARD_MENU_DISABLED_REASONS,
} = await import("../../hooks/useInGamePlayerCardMenu.js")
const { INGAME_E2E_ATTRS } = await import("../../constants/e2e/ingameE2eHooks.js")

const GAME_ID = "cm-v1-context"
const SELF_UUID = "u1"
const ROSTER = [
  { uuid: "u1", nickname: "A", themeIndex: 0 },
  { uuid: "u2", nickname: "B", themeIndex: 1 },
  { uuid: "u3", nickname: "C", themeIndex: 2 },
]

/** 소켓 전송 경계만 흉내낸다 — ack는 시험이 손에 쥐고 원할 때 정착시킨다. */
function createControlledSocket() {
  const sent = []
  const pending = []
  const socket = {
    id: "front-cm-v1-context",
    connected: true,
    on() {},
    off() {},
    emit(event, payload, callback) {
      sent.push({ event, payload })
      if (typeof callback === "function") callback({ ok: true })
    },
    timeout() { return socket },
    emitWithAck(event, payload) {
      const entry = { event, payload }
      sent.push(entry)
      return new Promise((resolve) => {
        pending.push({ event, resolve: (response) => { entry.response = response; resolve(response) } })
      })
    },
  }
  return {
    socket,
    sent,
    sentFor(event) { return sent.filter((entry) => entry.event === event) },
    settle(event, response) {
      const due = pending.filter((entry) => entry.event === event)
      for (const entry of due) {
        pending.splice(pending.indexOf(entry), 1)
        entry.resolve(response)
      }
    },
  }
}

function seedSession({ phase, dayPhase = null, role = "CITIZEN", nightTurnRole = null, tribunal = null }) {
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
        ...(tribunal ? { tribunal } : {}),
        players: ROSTER.map((player) => ({ ...player, alive: true })),
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

function findButtonIn(root, label) {
  if (!root) return null
  return [...root.querySelectorAll("button")].find((node) => node.textContent.trim() === label) ?? null
}

/**
 * 메뉴 항목은 잠겼을 때 라벨 뒤에 사유 문구를 함께 그린다("유죄전송 중입니다") — 정확 일치로
 * 찾으면 **잠긴 항목만** 못 찾아서, 잠김을 보려는 시험이 조용히 통과하거나 엉뚱하게 깨진다.
 */
function findMenuItem(menu, label) {
  if (!menu) return null
  return [...menu.querySelectorAll("button")].find((node) => node.textContent.trim().startsWith(label)) ?? null
}

async function dismissEntranceOverlays(container) {
  for (let i = 0; i < 5; i += 1) {
    const confirmButton = findButtonIn(container, "확인")
    if (!confirmButton) return
    await act(async () => { confirmButton.click() })
  }
}

async function mountInGamePage(socket) {
  currentSocket = socket
  for (const cb of [...socketSubscribers]) cb()
  const router = createMemoryRouter(
    [
      { path: "/ingame", element: React.createElement(InGamePage) },
      { path: "/multiplay", element: React.createElement("div", { "data-test-multiplay": "true" }) },
      { path: "/gameresult", element: React.createElement("div", { "data-test-game-result": "true" }) },
    ],
    { initialEntries: ["/ingame"] },
  )
  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })
  await dismissEntranceOverlays(view.container)
  return view
}

const controlPanelOf = (container) => container.querySelector('aside[aria-label="게임 조작"]')
const menuNodeOf = (container) => container.querySelector(`[${INGAME_PLAYER_CARD_MENU_ATTR}]`)

function panelTargetButton(container, uuid) {
  const panel = controlPanelOf(container)
  assert.notEqual(panel, null, "전제: 제어 패널이 떠 있어야 한다")
  const button = panel.querySelector(`[${INGAME_E2E_ATTRS.targetId}="${uuid}"]`)
  assert.notEqual(button, null, `전제: 제어 패널에 ${uuid} 대상 버튼이 있어야 한다`)
  return button
}

/** 제어 패널이 지금 **선택된 것으로 그리고 있는** 대상. 선택 상태를 DOM에서만 읽는다. */
function panelSelectedTargetId(container) {
  const panel = controlPanelOf(container)
  const selected = [...panel.querySelectorAll(`[${INGAME_E2E_ATTRS.targetId}]`)]
    .filter((node) => node.getAttribute("aria-pressed") === "true")
  assert.ok(selected.length <= 1, "제어 패널이 두 대상을 동시에 선택으로 그린다")
  return selected[0]?.getAttribute(INGAME_E2E_ATTRS.targetId) ?? null
}

function cardSlotOf(container, nickname) {
  const card = container.querySelector(`[${INGAME_E2E_ATTRS.playerNickname}="${nickname}"]`)
  assert.notEqual(card, null, `${nickname} 카드를 실제 보드에서 찾지 못했다`)
  return card.closest('[role="button"]')
}

async function openCardMenu(container, nickname) {
  const slot = cardSlotOf(container, nickname)
  await act(async () => {
    fireEvent.mouseDown(slot)
    fireEvent.click(slot)
  })
  const menu = menuNodeOf(container)
  assert.notEqual(menu, null, `${nickname} 카드 좌클릭으로 메뉴가 열리지 않았다`)
  return menu
}

// ═══════════════════════════════════════════════════════════════════════════
// 실제 소비처가 읽은 값 — 별도 Probe가 아니라 커밋된 트리의 그 컴포넌트에서 읽는다
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Probe를 끼워 넣어 두 자리의 컨텍스트 값을 비교하면 "Provider가 같은 값을 준다"까지만
 * 보인다 — 정작 **컨트롤 패널과 카드 메뉴 호스트가 그 값을 읽었는가**는 보이지 않는다(둘 중
 * 하나가 제 훅을 따로 부르고 있어도 Probe끼리는 여전히 같다). 그래서 커밋된 fiber 트리에서
 * 그 두 컴포넌트를 직접 찾아, 그들이 자기 렌더에서 실제로 읽은 컨텍스트 값을 꺼낸다.
 */
function currentFiberRoot(container) {
  const key = Object.keys(container).find((name) => name.startsWith("__reactContainer$"))
  assert.notEqual(key, undefined, "렌더 컨테이너에서 React 루트를 찾지 못했다")
  const hostRootFiber = container[key]
  return hostRootFiber.stateNode?.current ?? hostRootFiber
}

function walkFibers(rootFiber, visit) {
  const stack = [rootFiber]
  while (stack.length > 0) {
    const fiber = stack.pop()
    if (!fiber) continue
    visit(fiber)
    if (fiber.child) stack.push(fiber.child)
    // 루트의 형제는 이 트리 바깥이다 — 루트에서만 형제를 따라가지 않는다.
    if (fiber !== rootFiber && fiber.sibling) stack.push(fiber.sibling)
  }
}

function findFiberByType(rootFiber, type) {
  let found = null
  walkFibers(rootFiber, (fiber) => {
    if (found === null && fiber.type === type) found = fiber
  })
  return found
}

function countFibersByType(rootFiber, type) {
  let count = 0
  walkFibers(rootFiber, (fiber) => {
    if (fiber.type === type) count += 1
  })
  return count
}

/** 이 fiber가 **자기 렌더에서** 읽은 context 값. 읽은 기록이 없으면 시험을 실패시킨다. */
function readConsumedContext(fiber, context, where) {
  let dependency = fiber?.dependencies?.firstContext ?? null
  while (dependency) {
    if (dependency.context === context) return dependency.memoizedValue
    dependency = dependency.next
  }
  assert.fail(`${where}가 InGameActionContext를 읽은 기록이 커밋된 트리에 없다`)
}

/** 실제 컨트롤 패널·실제 카드 메뉴 호스트(보드)가 각각 읽은 조작 컨텍스트 값. */
function consumedActionContexts(container) {
  const rootFiber = currentFiberRoot(container)
  const panelFiber = findFiberByType(rootFiber, InGameActionPanel)
  const boardFiber = findFiberByType(rootFiber, InGamePlayerBoard)
  assert.notEqual(panelFiber, null, "커밋된 트리에서 컨트롤 패널을 찾지 못했다")
  assert.notEqual(boardFiber, null, "커밋된 트리에서 플레이어 보드(카드 메뉴 호스트)를 찾지 못했다")
  return {
    panel: readConsumedContext(panelFiber, InGameActionContext, "컨트롤 패널"),
    cardMenu: readConsumedContext(boardFiber, InGameActionContext, "카드 메뉴 호스트"),
  }
}

const SHARED_FUNCTION_FIELDS = [
  "setSelectedDayVoteTargetId", "setSelectedNightTargetId",
  "submitDayVote", "submitNightAction", "submitTribunalVote",
]

/** 두 실제 소비처가 같은 객체·같은 setter를 읽었는지 확인하고 그 값을 돌려준다. */
function assertSharedActionContext(container, when) {
  const consumed = consumedActionContexts(container)
  assert.notEqual(consumed.panel, null, `${when}: 컨트롤 패널이 읽은 컨텍스트 값이 없다`)
  assert.equal(consumed.panel, consumed.cardMenu,
    `${when}: 두 실제 소비처가 서로 다른 훅 인스턴스를 읽는다`)
  for (const field of SHARED_FUNCTION_FIELDS) {
    assert.equal(typeof consumed.cardMenu[field], "function", `${when}: ${field}가 함수가 아니다`)
    assert.equal(consumed.panel[field], consumed.cardMenu[field],
      `${when}: ${field}가 두 실제 소비처에서 다른 참조다`)
  }
  return consumed.cardMenu
}

/**
 * 보드 카드의 선택 강조(theme stroke). 강조는 공유 선택값(selectedDayVoteTargetId /
 * selectedNightTargetId)에서만 나오므로, 패널이 고른 대상이 **보드 쪽 DOM**에 나타났는지를
 * 이 값으로 본다.
 */
function cardStrokeTransform(container, nickname) {
  const card = container.querySelector(`[${INGAME_E2E_ATTRS.playerNickname}="${nickname}"]`)
  assert.notEqual(card, null, `${nickname} 카드를 실제 보드에서 찾지 못했다`)
  const stroke = card.querySelector("div.origin-center")
  assert.notEqual(stroke, null, `${nickname} 카드의 테마 stroke 레이어가 없다`)
  return stroke.getAttribute("style")
}

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
  useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 0 })
  currentSocket = null
  for (const cb of [...socketSubscribers]) cb()
})

// ═══════════════════════════════════════════════════════════════════════════
// (1) 단일 인스턴스 — 두 소비 위치가 같은 참조를 본다
// ═══════════════════════════════════════════════════════════════════════════

test("AC-05: InGameActionProvider가 준 값은 두 소비 위치에서 같은 객체이고 setter까지 같은 참조다", () => {
  const transport = createControlledSocket()
  currentSocket = transport.socket
  for (const cb of [...socketSubscribers]) cb()
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })

  const seen = []
  function Probe({ where }) {
    seen.push({ where, value: React.useContext(InGameActionContext) })
    return null
  }
  const view = render(React.createElement(
    InGamePlayerSessionProvider,
    null,
    React.createElement(InGameActionProvider, { interactionBlocked: false },
      React.createElement(Probe, { where: "panel" }),
      React.createElement(Probe, { where: "cardMenu" })),
  ))

  const panel = seen.find((entry) => entry.where === "panel")
  const cardMenu = seen.find((entry) => entry.where === "cardMenu")
  assert.notEqual(panel?.value, null, "컨트롤 패널 자리에 컨텍스트 값이 없다")
  assert.notEqual(cardMenu?.value, null, "카드 메뉴 자리에 컨텍스트 값이 없다")
  assert.equal(panel.value, cardMenu.value, "두 소비 위치가 서로 다른 훅 인스턴스를 본다")
  assert.equal(panel.value.setSelectedDayVoteTargetId, cardMenu.value.setSelectedDayVoteTargetId)
  assert.equal(panel.value.setSelectedNightTargetId, cardMenu.value.setSelectedNightTargetId)
  assert.equal(panel.value.submitDayVote, cardMenu.value.submitDayVote)
  assert.equal(panel.value.submitNightAction, cardMenu.value.submitNightAction)
  assert.equal(panel.value.submitTribunalVote, cardMenu.value.submitTribunalVote)
  view.unmount()
})

test("AC-05: 실제 페이지에서 조작 훅 인스턴스는 하나뿐이고, 컨트롤 패널과 카드 메뉴 호스트가 그 하나를 읽는다", async () => {
  const transport = createControlledSocket()
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })
  const view = await mountInGamePage(transport.socket)

  // 훅을 부르는 자리(Provider)가 실제 페이지 트리에 정확히 하나다 — 둘이면 선택 상태가 갈린다.
  assert.equal(countFibersByType(currentFiberRoot(view.container), InGameActionProvider), 1,
    "실제 페이지 트리에 조작 Provider가 하나가 아니다(useInGameActionPanel이 여러 번 불린다)")

  const shared = assertSharedActionContext(view.container, "마운트 직후")
  assert.equal(shared.selectedDayVoteTargetId, null, "전제: 아직 아무 대상도 고르지 않았다")
  assert.equal(transport.sentFor("cast_day_vote").length, 0, "관찰만 했는데 전송이 일어났다")
})

// ═══════════════════════════════════════════════════════════════════════════
// (a)(b) 낮 · (c)(d) 밤 — 선택 상태 한 칸을 공유한다
// ═══════════════════════════════════════════════════════════════════════════

test("AC-05(a/b): 낮 — 패널에서 고른 대상과 카드 메뉴에서 고른 대상이 한 칸을 공유한다", async () => {
  const transport = createControlledSocket()
  seedSession({ phase: "DAY", dayPhase: "DAY_VOTE" })
  const view = await mountInGamePage(transport.socket)

  const strokeBeforeB = cardStrokeTransform(view.container, "B")
  const strokeBeforeC = cardStrokeTransform(view.container, "C")

  // (a) 패널 → 메뉴: 패널이 고른 대상이 공유 선택 칸에 들어가고, **카드 메뉴 소비 경로**가
  //     그 값을 그대로 읽는다(패널 DOM만 보면 두 인스턴스가 갈린 화면도 통과한다).
  await act(async () => { fireEvent.click(panelTargetButton(view.container, "u2")) })
  assert.equal(panelSelectedTargetId(view.container), "u2", "패널 선택이 반영되지 않았다")

  const afterPanelPick = assertSharedActionContext(view.container, "패널이 낮 대상을 고른 뒤")
  assert.equal(afterPanelPick.selectedDayVoteTargetId, "u2",
    "패널이 고른 낮 대상이 카드 메뉴 소비 경로에 보이지 않는다")
  assert.notEqual(cardStrokeTransform(view.container, "B"), strokeBeforeB,
    "패널이 고른 대상이 보드 카드의 선택 강조로 나타나지 않았다")
  assert.equal(cardStrokeTransform(view.container, "C"), strokeBeforeC,
    "고르지 않은 카드까지 선택 강조가 바뀌었다")

  // (b) 메뉴 → 패널: 메뉴가 다른 대상을 고르면 **같은 칸**이 덮인다(인스턴스가 둘이면 패널은
  //     여전히 u2를 선택으로 그린다).
  const menu = await openCardMenu(view.container, "C")
  await act(async () => {
    fireEvent.mouseDown(findMenuItem(menu, INGAME_CARD_MENU_DAY_VOTE_LABEL))
    fireEvent.click(findMenuItem(menu, INGAME_CARD_MENU_DAY_VOTE_LABEL))
  })

  const sent = transport.sentFor("cast_day_vote")
  assert.equal(sent.length, 1, "(g) 낮 전송이 정확히 1회가 아니다")
  assert.deepEqual(sent[0].payload, { gameId: GAME_ID, dayIndex: 1, targetId: "u3" })
  assert.equal(panelSelectedTargetId(view.container), "u3",
    "메뉴가 고른 대상이 패널의 선택 칸에 보이지 않는다 — 두 경로가 서로 다른 상태를 쓴다")
  assert.equal(assertSharedActionContext(view.container, "메뉴가 낮 대상을 고른 뒤")
    .selectedDayVoteTargetId, "u3", "메뉴가 고른 낮 대상이 공유 선택 칸에 남지 않았다")
  await act(async () => { transport.settle("cast_day_vote", { ok: true }) })
})

test("AC-05(c/d): 밤 — 패널의 대상 선택과 카드 메뉴의 대상 선택이 한 칸을 공유한다", async () => {
  const transport = createControlledSocket()
  seedSession({ phase: "NIGHT", role: "JOKER", nightTurnRole: "JOKER" })
  const view = await mountInGamePage(transport.socket)

  const strokeBeforeB = cardStrokeTransform(view.container, "B")
  const strokeBeforeC = cardStrokeTransform(view.container, "C")

  // (c) 패널 → 메뉴
  await act(async () => { fireEvent.click(panelTargetButton(view.container, "u2")) })
  assert.equal(panelSelectedTargetId(view.container), "u2", "패널의 밤 대상 선택이 반영되지 않았다")

  const afterPanelPick = assertSharedActionContext(view.container, "패널이 밤 대상을 고른 뒤")
  assert.equal(afterPanelPick.selectedNightTargetId, "u2",
    "패널이 고른 밤 대상이 카드 메뉴 소비 경로에 보이지 않는다")
  assert.notEqual(cardStrokeTransform(view.container, "B"), strokeBeforeB,
    "패널이 고른 밤 대상이 보드 카드의 선택 강조로 나타나지 않았다")
  assert.equal(cardStrokeTransform(view.container, "C"), strokeBeforeC,
    "고르지 않은 카드까지 선택 강조가 바뀌었다")

  // (d) 메뉴 → 패널
  const menu = await openCardMenu(view.container, "C")
  await act(async () => {
    fireEvent.mouseDown(findMenuItem(menu, "암살"))
    fireEvent.click(findMenuItem(menu, "암살"))
  })

  const sent = transport.sentFor("submit_night_action")
  assert.equal(sent.length, 1, "(g) 밤 전송이 정확히 1회가 아니다")
  assert.deepEqual(sent[0].payload, { gameId: GAME_ID, targetId: "u3" })
  assert.equal(panelSelectedTargetId(view.container), "u3",
    "메뉴가 고른 밤 대상이 패널의 선택 칸에 보이지 않는다 — 두 경로가 서로 다른 상태를 쓴다")
  assert.equal(assertSharedActionContext(view.container, "메뉴가 밤 대상을 고른 뒤")
    .selectedNightTargetId, "u3", "메뉴가 고른 밤 대상이 공유 선택 칸에 남지 않았다")
  await act(async () => { transport.settle("submit_night_action", { ok: true }) })
})

// ═══════════════════════════════════════════════════════════════════════════
// (e)(f) 재판 — 제출 진행·완료 상태를 공유한다
// ═══════════════════════════════════════════════════════════════════════════

test("AC-05(e): 재판 — 카드 메뉴에서 제출하면 패널이 '제출 중'을, ACK 뒤에는 '제출함'을 그린다", async () => {
  const transport = createControlledSocket()
  seedSession({ phase: "TRIBUNAL", tribunal: { defendantUuid: "u2" } })
  const view = await mountInGamePage(transport.socket)

  const menu = await openCardMenu(view.container, "B")
  await act(async () => {
    fireEvent.mouseDown(findMenuItem(menu, "유죄"))
    fireEvent.click(findMenuItem(menu, "유죄"))
  })

  const sent = transport.sentFor("cast_tribunal_vote")
  assert.equal(sent.length, 1, "(g) 재판 전송이 정확히 1회가 아니다")
  assert.equal(sent[0].payload.vote, "GUILTY")
  assert.notEqual(findButtonIn(controlPanelOf(view.container), "제출 중..."), null,
    "메뉴의 제출 진행 상태가 패널에 보이지 않는다")

  await act(async () => {
    transport.settle("cast_tribunal_vote", { ok: true, gameId: GAME_ID, dayIndex: 1, vote: "GUILTY" })
  })
  assert.match(controlPanelOf(view.container).textContent, /제출함: 유죄/,
    "ACK 뒤 완료 상태가 패널에 보이지 않는다")
  assert.equal(transport.sentFor("cast_tribunal_vote").length, 1, "(g) 재판 전송이 늘어났다")

  // 완료 상태도 **한 칸**이다 — 카드 메뉴 소비 경로가 같은 값을 읽고, 항목이 함께 잠긴다.
  const afterAck = assertSharedActionContext(view.container, "메뉴 제출의 ACK 뒤")
  assert.equal(afterAck.tribunalVoteStatus, "submitted",
    "메뉴가 낸 제출의 완료 상태가 공유 컨텍스트에 없다")
  assert.equal(afterAck.tribunalVoteSubmittedVote, "GUILTY",
    "제출한 표가 공유 컨텍스트에 남지 않았다")
  const reopened = await openCardMenu(view.container, "B")
  const guiltyAfterAck = findMenuItem(reopened, "유죄")
  assert.equal(guiltyAfterAck.disabled, true, "ACK 뒤 완료 상태인데 메뉴 항목이 다시 열렸다")
  await act(async () => { fireEvent.click(guiltyAfterAck) })
  assert.equal(transport.sentFor("cast_tribunal_vote").length, 1,
    "완료 뒤 메뉴 항목이 재제출을 보냈다")
})

test("AC-05(f): 재판 — 패널에서 제출하면 카드 메뉴 항목이 '전송 중입니다'로 함께 잠긴다", async () => {
  const transport = createControlledSocket()
  seedSession({ phase: "TRIBUNAL", tribunal: { defendantUuid: "u2" } })
  const view = await mountInGamePage(transport.socket)

  const panel = controlPanelOf(view.container)
  await act(async () => { fireEvent.click(findButtonIn(panel, "무죄")) })
  await act(async () => { fireEvent.click(findButtonIn(controlPanelOf(view.container), "투표 제출")) })

  const sent = transport.sentFor("cast_tribunal_vote")
  assert.equal(sent.length, 1, "(g) 재판 전송이 정확히 1회가 아니다")
  assert.equal(sent[0].payload.vote, "NOT_GUILTY")

  const menu = await openCardMenu(view.container, "B")
  const guiltyItem = findMenuItem(menu, "유죄")
  assert.notEqual(guiltyItem, null, "재판 중 피고 카드 메뉴에 항목이 없다")
  assert.equal(guiltyItem.disabled, true, "패널이 제출 중인데 메뉴 항목이 잠기지 않았다")
  assert.match(menu.textContent, new RegExp(INGAME_CARD_MENU_DISABLED_REASONS.submitting),
    "패널의 제출 진행 상태가 메뉴의 사유 문구에 보이지 않는다")

  // 잠긴 항목을 눌러도 전송이 늘지 않는다.
  await act(async () => { fireEvent.click(guiltyItem) })
  assert.equal(transport.sentFor("cast_tribunal_vote").length, 1, "잠긴 메뉴 항목이 제출을 보냈다")

  const submitting = assertSharedActionContext(view.container, "패널이 제출 중인 동안")
  assert.equal(submitting.tribunalVoteStatus, "submitting",
    "패널의 제출 진행 상태가 카드 메뉴 소비 경로에 보이지 않는다")

  await act(async () => {
    transport.settle("cast_tribunal_vote", { ok: true, gameId: GAME_ID, dayIndex: 1, vote: "NOT_GUILTY" })
  })

  // ACK 뒤의 **완료** 상태도 두 경로가 같은 값으로 본다.
  const afterAck = assertSharedActionContext(view.container, "패널 제출의 ACK 뒤")
  assert.equal(afterAck.tribunalVoteStatus, "submitted",
    "패널이 낸 제출의 완료 상태가 공유 컨텍스트에 없다")
  assert.equal(afterAck.tribunalVoteSubmittedVote, "NOT_GUILTY",
    "패널이 제출한 표가 공유 컨텍스트에 남지 않았다")
  assert.match(controlPanelOf(view.container).textContent, /제출함: 무죄/,
    "ACK 뒤 완료 상태가 패널에 보이지 않는다")
  const reopened = await openCardMenu(view.container, "B")
  assert.equal(findMenuItem(reopened, "유죄").disabled, true,
    "패널 제출이 끝났는데 메뉴 항목이 다시 열렸다")
  assert.match(reopened.textContent, new RegExp(INGAME_CARD_MENU_DISABLED_REASONS.blocked),
    "완료 뒤 메뉴가 사유 문구 없이 잠겼다")
  assert.equal(transport.sentFor("cast_tribunal_vote").length, 1, "(g) 재판 전송이 늘어났다")
})
