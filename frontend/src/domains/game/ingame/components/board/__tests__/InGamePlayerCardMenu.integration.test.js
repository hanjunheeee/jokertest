/**
 * CM V-1 AC-04 — 플레이어 카드 좌클릭 메뉴의 **보드 통합** 계약.
 *
 * 실제 InGamePage를 그대로 마운트한다(실제 store·실제 조작 훅·실제 보드).
 * 대역은 바깥 경계뿐이다 — 소켓 전송, HTTP, 효과음 런타임, 자산 선택.
 *
 * V-2(AC-05): 비교 대상이던 컨트롤 패널(InGameActionPanel)이 삭제됐다. 같은 페이로드 계약을
 * 패널 경로와의 대조가 아니라 **고정 리터럴**로 못박아 그대로 지킨다.
 *
 *   · 카드 좌클릭 → 메뉴 열림 → "투표" → cast_day_vote가 **정확히 그 페이로드**로 한 번 나간다
 *   · 카드 우클릭(contextmenu)으로는 메뉴가 열리지 않는다
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

register(new URL("../../../__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

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
const { RouterProvider, createMemoryRouter } = await import("react-router-dom")
const { default: InGamePage } = await import("../../../pages/InGamePage.jsx")
const { useInGameStore } = await import("../../../store/ingameStore.js")
const { useAuthStore } = await import("../../../../../auth/store/auth.store.js")
const { INGAME_PLAYER_CARD_MENU_ATTR } = await import("../InGamePlayerCardMenu.jsx")
const { INGAME_CARD_MENU_DAY_VOTE_LABEL } = await import("../../../hooks/useInGamePlayerCardMenu.js")
const { INGAME_E2E_ATTRS } = await import("../../../constants/e2e/ingameE2eHooks.js")

const GAME_ID = "cm-v1-board"
const SELF_UUID = "u1"
const ROSTER = [
  { uuid: "u1", nickname: "A", themeIndex: 0 },
  { uuid: "u2", nickname: "B", themeIndex: 1 },
  { uuid: "u3", nickname: "C", themeIndex: 2 },
]

/** 소켓 **전송 경계**만 흉내낸다. ack가 필요한 요청만 즉시 정착시킨다. */
function createFrontSocket() {
  const sent = []
  const socket = {
    id: "front-cm-v1",
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
      if (event === "cast_day_vote") return Promise.resolve({ ok: true })
      if (event === "submit_night_action") return Promise.resolve({ ok: true })
      // 재접속 스냅샷 조회처럼 이 시험이 답하지 않는 요청은 미정착으로 남긴다
      // (실제 화면도 응답이 올 때까지 그대로 기다린다).
      return new Promise(() => {})
    },
  }
  return {
    socket,
    sent,
    sentFor(event) { return sent.filter((entry) => entry.event === event) },
  }
}

function seedDayVoteSession() {
  act(() => {
    useAuthStore.setState({
      isLoggedIn: true, user: { uuid: SELF_UUID, nickname: "A" }, identityGeneration: 0,
    })
    useInGameStore.setState({ gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0 })
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase: "DAY",
        dayIndex: 1,
        dayPhase: "DAY_VOTE",
        players: ROSTER.map((player) => ({ ...player, alive: true })),
        self: { uuid: SELF_UUID, nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      },
    })
  })
}

function findButtonIn(root, label) {
  if (!root) return null
  return [...root.querySelectorAll("button")].find((node) => node.textContent.trim() === label) ?? null
}

/** 마운트 직후 자동으로 뜨는 진입·역할 공개 창을 실제 확인 버튼으로 닫는다. */
async function dismissEntranceOverlays(container) {
  for (let i = 0; i < 5; i += 1) {
    const confirmButton = findButtonIn(container, "확인")
    if (!confirmButton) return
    await act(async () => { confirmButton.click() })
  }
}

/** 실제 InGamePage를 data router 위에 마운트한다(useInGameExit의 useBlocker가 그것을 요구한다). */
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

const menuNodeOf = (container) => container.querySelector(`[${INGAME_PLAYER_CARD_MENU_ATTR}]`)
const menuIsOpen = (container) => menuNodeOf(container) !== null

function cardSlotOf(container, nickname) {
  const card = container.querySelector(`[${INGAME_E2E_ATTRS.playerNickname}="${nickname}"]`)
  assert.notEqual(card, null, `${nickname} 카드를 실제 보드에서 찾지 못했다`)
  return card.closest('[role="button"]')
}

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
  useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 0 })
  currentSocket = null
  for (const cb of [...socketSubscribers]) cb()
})

test("AC-04: 카드 좌클릭 메뉴의 투표가 계약된 cast_day_vote 페이로드를 정확히 한 번 보낸다", async () => {
  // V-2(AC-05): 제어 패널(aside[aria-label="게임 조작"])은 삭제됐다 — 예전 (1)단계의 "기존
  // 경로와 비교"는 비교 대상 자체가 없어졌다. 페이로드 계약은 그대로이므로 아래 고정
  // 리터럴이 그 계약을 직접 잠근다(패널 DOM에 의존하지 않는 더 강한 단언이다).
  const menuRun = createFrontSocket()
  seedDayVoteSession()
  const view = await mountInGamePage(menuRun.socket)

  const slot = cardSlotOf(view.container, "B")
  await act(async () => {
    fireEvent.mouseDown(slot)
    fireEvent.click(slot)
  })
  assert.equal(menuIsOpen(view.container), true, "카드 좌클릭으로 메뉴가 열리지 않았다")

  const voteItem = findButtonIn(menuNodeOf(view.container), INGAME_CARD_MENU_DAY_VOTE_LABEL)
  assert.notEqual(voteItem, null, "메뉴에 투표 항목이 없다")
  await act(async () => {
    // 정상 클릭의 mousedown이 "바깥 클릭 취소"로 처리되면 이 제출 자체가 사라진다.
    fireEvent.mouseDown(voteItem)
    fireEvent.click(voteItem)
  })

  const menuSent = menuRun.sentFor("cast_day_vote")
  assert.equal(menuSent.length, 1, "카드 메뉴 경로가 정확히 한 번 보내지 않았다")
  assert.deepEqual(menuSent[0].payload, { gameId: GAME_ID, dayIndex: 1, targetId: "u2" })
  assert.equal(menuIsOpen(view.container), false, "제출 뒤 메뉴가 닫히지 않았다")
})

test("AC-04: 카드 우클릭(contextmenu)으로는 메뉴가 열리지 않는다", async () => {
  const run = createFrontSocket()
  seedDayVoteSession()
  const view = await mountInGamePage(run.socket)

  const slot = cardSlotOf(view.container, "B")
  await act(async () => { fireEvent.contextMenu(slot) })
  assert.equal(menuIsOpen(view.container), false, "우클릭으로 메뉴가 열렸다")
  assert.equal(run.sentFor("cast_day_vote").length, 0, "우클릭이 무언가를 전송했다")

  // 같은 카드의 좌클릭은 그대로 열린다(우클릭 무시가 좌클릭까지 막지 않는다).
  await act(async () => {
    fireEvent.mouseDown(slot)
    fireEvent.click(slot)
  })
  assert.equal(menuIsOpen(view.container), true, "우클릭 뒤 좌클릭이 막혔다")
})
