// 밤 대기 창과 죽은 사람 채팅 시험 (사용자 규칙: 죽은 사람끼리 대화는 낮밤 상관없음, 2026-11-09)
// 실제 인게임 화면을 그려 죽은 사람은 대기 창 없이 채팅 입력칸이 잠기지 않음, 산 사람은 그대로 덮이고 잠김을 봄
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

register(new URL("../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

mock.module("../../../../src/domains/game/ingame/utils/pickInGameJobPortrait.js", {
  namedExports: { pickInGameJobPortrait: (index) => `portrait-${index}` },
})
mock.module("../../../../src/domains/game/ingame/utils/pickInGamePlayerFrame.js", {
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

const { act, render, cleanup } = await import("@testing-library/react")
const { RouterProvider, createMemoryRouter } = await import("react-router-dom")
const { default: InGamePage } = await import("../../../../src/domains/game/ingame/pages/InGamePage.jsx")
const { useInGameStore, readInGameReceiptScope } = await import("../../../../src/domains/game/ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../src/domains/auth/store/auth.store.js")

const GAME_ID = "dead-night-wait"
const SELF_UUID = "u1"
const WAIT_SELECTOR = "[data-ingame-night-presentation-wait]"

// 보낸 것만 적고 응답은 안 오는 연결 (스냅샷 요청이 대기를 지우지 않게)
function createFrontSocket() {
  const socket = {
    id: "front-dead-night-wait",
    connected: true,
    on() {},
    off() {},
    emit() {},
    timeout() { return socket },
    emitWithAck() { return new Promise(() => {}) },
  }
  return socket
}

// 2일차 밤 판 깔기 (selfAlive: 내 생존)
function seedNight(selfAlive) {
  act(() => {
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: SELF_UUID, nickname: "A" }, identityGeneration: 0 })
    useInGameStore.setState({ gameId: null, state: null, hostUuid: null, error: null, snapshotSeq: 0, nightPresentationWait: null })
    useInGameStore.getState().setGamePayload({
      gameId: GAME_ID,
      state: {
        id: GAME_ID,
        phase: "NIGHT",
        dayIndex: 2,
        dayPhase: null,
        players: [
          { uuid: SELF_UUID, nickname: "A", themeIndex: 0, alive: selfAlive },
          { uuid: "u2", nickname: "B", themeIndex: 1, alive: true },
          { uuid: "u3", nickname: "C", themeIndex: 2, alive: true },
        ],
        self: { uuid: SELF_UUID, nickname: "A", role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false },
      },
    })
  })
}

// 다른 사람 밤 연출 대기 알림 걸기 (서버 알림과 같은 범위)
function startWait() {
  act(() => {
    useInGameStore.setState({
      nightPresentationWait: Object.freeze({
        gameId: GAME_ID,
        nightDayIndex: 2,
        scope: readInGameReceiptScope({ accountId: SELF_UUID, identityGeneration: 0 }),
      }),
    })
  })
}

function findButtonIn(root, label) {
  return [...root.querySelectorAll("button")].find((node) => node.textContent.trim() === label) ?? null
}

// 화면 그리고 입장 안내·사망 선택 같은 앞 창은 닫음 (이 시험은 대기 창만 봄)
async function mountInGamePage() {
  currentSocket = createFrontSocket()
  for (const cb of [...socketSubscribers]) cb()
  const router = createMemoryRouter(
    [
      { path: "/ingame", element: React.createElement(InGamePage) },
      { path: "/multiplay", element: React.createElement("div", { "data-test-multiplay": "true" }) },
    ],
    { initialEntries: ["/ingame"] },
  )
  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })
  for (let i = 0; i < 5; i += 1) {
    const button = findButtonIn(view.container, "관전 계속하기") ?? findButtonIn(view.container, "확인")
    if (!button) break
    await act(async () => { button.click() })
  }
  return view
}

test.afterEach(() => {
  cleanup()
  useInGameStore.getState().clearGame()
  useAuthStore.setState({ user: null, isLoggedIn: false, identityGeneration: 0 })
  currentSocket = null
  for (const cb of [...socketSubscribers]) cb()
})

test("죽은 사람 + 밤 + 대기 알림: 대기 창 안 덮고 채팅 입력칸이 잠기지 않음", async () => {
  seedNight(false)
  const view = await mountInGamePage()
  const before = view.container.querySelector("textarea")
  assert.ok(before !== null, "전제: 죽은 사람 채팅 입력칸이 있음")
  assert.ok(before.closest("[inert]") === null, "전제: 대기 전엔 안 잠김")

  startWait()
  const textarea = view.container.querySelector("textarea")
  assert.ok(textarea !== null, "입력칸 없음")
  assert.ok(textarea.closest("[inert]") === null, "죽은 사람 채팅 입력칸이 대기 중 inert 안에 들어감")
  assert.ok(view.container.querySelector(WAIT_SELECTOR) === null, "죽은 사람 화면을 대기 창이 덮음")
})

test("산 사람 + 밤 + 대기 알림: 대기 창이 덮고 화면이 잠김 (지금 동작 그대로)", async () => {
  seedNight(true)
  const view = await mountInGamePage()
  assert.ok(view.container.querySelector("[inert]") === null, "전제: 대기 전엔 안 잠김")
  startWait()
  assert.ok(view.container.querySelector(WAIT_SELECTOR) !== null, "산 사람한테 대기 창이 안 뜸")
  const locked = view.container.querySelector("[inert]")
  assert.ok(locked !== null, "산 사람 화면이 대기 중 안 잠김")
  const textarea = view.container.querySelector("textarea")
  if (textarea) assert.ok(textarea.closest("[inert]") !== null, "산 사람 채팅 입력칸이 대기 중 열려 있음")
})
