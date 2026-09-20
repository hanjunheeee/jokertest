/**
 * F-24 (AC-01 / A-14) — **코드를 확인할 수 없을 때 화면이 무엇을 보여 주는가**.
 *
 * 두 가지를 실제 화면으로 붙잡는다.
 *
 *   1. 결과·코드를 모두 잃은 진입(새로고침 뒤 서버 참가 매핑도 이미 정리된 경우)에서
 *      GameResultPage는 **아무것도 그리지 않고 로비로 보내지 않는다**. 확인 불가 안내를 그리고,
 *      같은 모달로 "코드를 확인할 수 없음 + 복사 비활성 + 사유"를 읽어 준다. 로비 이동은
 *      사용자의 입력이다.
 *   2. RoomCodeViewModal은 **같은 코드**를 표시하는 중이라도 계정이나 연결이 갈리면 보류 중인
 *      복사 결과를 무효화한다 — 그 뒤 도착한 옛 완료가 "복사됨"을 켜면 사용자는 지금 이 계정·
 *      이 연결에서 복사됐다고 믿게 된다.
 *
 * 서버 쪽은 대역이 아니라 실제 backend 핸들러다 — "참가 자격이 없으면 스냅샷을 주지 않는다"는
 * 판정을 시험이 흉내내면 그 계약이 시험 밖에 남는다.
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test"

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
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const alerts = []
dom.window.alert = (message) => alerts.push(message)
dom.window.confirm = () => false
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => false)

/** 클립보드는 화면이 완료를 기다리는 **외부 경계**다 — 완료 시점을 시험이 쥔다. */
const clipboardCalls = []
let pendingClipboard = null
Object.defineProperty(dom.window.navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: (value) => {
      clipboardCalls.push(value)
      return new Promise((resolve, reject) => { pendingClipboard = { resolve, reject } })
    },
  },
})

register(new URL("../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const socketState = { socket: null, subscribers: new Set() }
function setTestSocket(next) {
  socketState.socket = next
  for (const notify of [...socketState.subscribers]) notify()
}

mock.module("@/shared/socket/socketClient", {
  namedExports: {
    getSocket: () => socketState.socket,
    subscribeSocket: (notify) => {
      socketState.subscribers.add(notify)
      return () => socketState.subscribers.delete(notify)
    },
  },
})
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: {
    dispatchSfxEvent: () => {}, dispatchUiSfx: () => {},
    getSfxMix: () => ({ gain: 0, muted: true }), subscribeSfxMix: () => () => {},
  },
})
mock.module("../../../../../shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
const rejectNetwork = async () => { throw new Error("이 시험에서 예기치 않은 HTTP 호출이 일어났다") }
mock.module("../../../../../shared/api/client.js", {
  namedExports: {
    api: { get: rejectNetwork, post: rejectNetwork, put: rejectNetwork, patch: rejectNetwork, delete: rejectNetwork },
    apiClient: rejectNetwork,
    refreshAccessToken: rejectNetwork,
  },
})

const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { RouterProvider, createMemoryRouter } = await import("react-router-dom")
const { default: GameResultPage } = await import("../GameResultPage.jsx")
const { default: RoomCodeViewModal } =
  await import("../../../matching/components/RoomCodeViewModal.jsx")
const { ROOM_CODE_COPY_ERRORS, ROOM_CODE_COPY_RESULTS } =
  await import("../../../matching/utils/roomCode.js")
const { useInGameStore } = await import("../../../ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")

const { default: gameSessionSocketLayer } =
  await import("../../../../../../../backend/socket/gameSession.js")
const { default: gameSessionCore } =
  await import("../../../../../../../backend/game-core/gameSession.js")
const { default: matchmakingFixtures } =
  await import("../../../../../../../backend/socket/__tests__/testHelpers/matchmakingFixtures.js")

const { createFakeSocket, createFakeIo } = matchmakingFixtures

/** createFakeSocket의 기본 규약(socket.id === `sock-${uuid}`)을 따르는 registry. */
function createConventionFollowingRegistry() {
  const overrides = new Map()
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      if (prop === "get") return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
      return Reflect.get(target, prop, receiver)
    },
  })
}

/**
 * 실제 등록부에 물린 연결 한 벌. get_session_snapshot도 **실제 핸들러**가 답한다 —
 * 세션이 없거나 참가자가 아니면 그 판정은 서버 코드의 것이다.
 */
function createConnection(io, uuid) {
  const serverSocket = createFakeSocket(uuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  gameSessionSocketLayer.registerGameHandlers(io, serverSocket, uuid)
  const clientSocket = {
    connected: true,
    id: `client-${serverSocket.id}`,
    on() {}, off() {}, emit() {},
    timeout() { return clientSocket },
    emitWithAck(event, payload) {
      return new Promise((resolve, reject) => {
        if (serverSocket.listenerCount(event) === 0) {
          reject(new Error(`등록부가 ${event} 리스너를 만들지 않았다`))
          return
        }
        serverSocket.trigger(event, payload, resolve)
      })
    },
  }
  return { serverSocket, clientSocket }
}

function loginAs(uuid) {
  act(() => { useAuthStore.getState().login({ uuid, nickname: `user-${uuid}` }) })
}

/** 복사 버튼(라벨은 상태에 따라 바뀌므로 aria-label이 아니라 data 표식으로 찾는다). */
function copyButton(container) {
  const button = container.querySelector("button[data-copy-status]")
  assert.ok(button, "복사 버튼이 없다")
  return button
}

test.beforeEach(() => {
  clipboardCalls.length = 0
  pendingClipboard = null
  alerts.length = 0
  useInGameStore.getState().clearGame()
  gameSessionCore.__resetStateForTests()
  gameSessionSocketLayer.__resetStateForTests()
  gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
})

test.afterEach(() => {
  cleanup()
  setTestSocket(null)
  gameSessionCore.__resetStateForTests()
  gameSessionSocketLayer.__resetStateForTests()
})

test("F-24(AC-01/A-14) · 결과도 코드도 잃은 진입은 로비로 쫓아내지 않고 확인 불가 상태를 그린다", async () => {
  const uuid = "f24-result-lost"
  loginAs(uuid)

  const io = createFakeIo([])
  const { clientSocket } = createConnection(io, uuid)
  setTestSocket(clientSocket)

  const router = createMemoryRouter(
    [{ path: "/gameresult", element: React.createElement(GameResultPage) },
      { path: "/multiplay", element: React.createElement("div", null, "로비 화면") }],
    { initialEntries: ["/gameresult"] },
  )
  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })

  // 서버가 "참가자가 아니다"로 답한 뒤 화면이 확인 불가로 정착한다(자동 이동은 없다).
  await waitFor(() => {
    assert.match(view.container.textContent, /게임 결과를 확인할 수 없습니다/)
  })
  assert.equal(router.state.location.pathname, "/gameresult", "안내도 없이 로비로 쫓겨났다")

  // 결과·명단을 꾸미지 않는다.
  assert.equal(view.container.querySelector("video"), null, "없는 승패를 연출로 그렸다")

  // 코드 진입은 남아 있고, 그 모달이 확인 불가와 비활성 복사를 그대로 읽어 준다.
  const entry = [...view.container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "방 코드 확인 불가")
  assert.ok(entry, "확인 불가 상태의 코드 진입이 없다")
  await act(async () => { entry.click() })

  const copy = copyButton(view.container)
  assert.equal(copy.disabled, true, "확인할 수 없는 코드인데 복사가 열려 있다")
  assert.equal(copy.getAttribute("data-copy-status"), ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE)
  assert.match(view.container.textContent, new RegExp(ROOM_CODE_COPY_ERRORS.UNAVAILABLE.slice(0, 12)))
  assert.deepEqual(clipboardCalls, [], "확인할 수 없는 코드로 클립보드를 건드렸다")

  // 로비 이동은 사용자의 입력이다.
  const lobby = [...view.container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "로비로 돌아가기")
  assert.ok(lobby, "로비로 돌아갈 방법이 없다(막다른 화면이다)")
  await act(async () => { lobby.click() })
  await waitFor(() => assert.equal(router.state.location.pathname, "/multiplay"))
})

test("F-24(AC-01) · 같은 코드라도 계정이 갈리면 보류 중인 복사 완료는 화면을 바꾸지 못한다", async () => {
  loginAs("f24-copy-a")

  let view
  await act(async () => {
    view = render(React.createElement(RoomCodeViewModal, {
      open: true, onClose: () => {}, roomCode: "AB2C3D",
    }))
  })

  await act(async () => { copyButton(view.container).click() })
  assert.deepEqual(clipboardCalls, ["AB2C3D"], "유효한 코드인데 클립보드를 부르지 않았다")
  assert.ok(pendingClipboard, "복사가 아직 보류 중이어야 한다")

  // 표시 코드는 그대로인 채 **계정만** 갈린다(로그아웃 → 다른 계정 로그인).
  act(() => { useAuthStore.getState().logout() })
  loginAs("f24-copy-b")

  // 그 뒤 옛 요청이 성공으로 완료된다.
  await act(async () => {
    pendingClipboard.resolve()
    await Promise.resolve()
  })

  const copy = copyButton(view.container)
  assert.equal(copy.textContent.includes("복사됨"), false, "다른 계정에서 옛 복사가 성공으로 표시됐다")
  assert.equal(copy.getAttribute("data-copy-status"), "", "옛 완료가 현재 상태 코드를 덮었다")
})

test("F-24(AC-01) · 같은 코드·같은 계정이라도 연결이 교체되면 보류 중인 복사 완료는 무효다", async () => {
  loginAs("f24-copy-c")
  const io = createFakeIo([])
  setTestSocket(createConnection(io, "f24-copy-c").clientSocket)

  let view
  await act(async () => {
    view = render(React.createElement(RoomCodeViewModal, {
      open: true, onClose: () => {}, roomCode: "AB2C3D",
    }))
  })

  await act(async () => { copyButton(view.container).click() })
  assert.ok(pendingClipboard, "복사가 아직 보류 중이어야 한다")

  // 연결 교체(재로그인·재연결). 코드도 계정도 그대로다.
  await act(async () => { setTestSocket(createConnection(io, "f24-copy-c").clientSocket) })

  await act(async () => {
    pendingClipboard.resolve()
    await Promise.resolve()
  })

  const copy = copyButton(view.container)
  assert.equal(copy.textContent.includes("복사됨"), false, "교체된 연결에서 옛 복사가 성공으로 표시됐다")
  assert.equal(copy.getAttribute("data-copy-status"), "", "옛 완료가 현재 상태 코드를 덮었다")
})

test("F-24(AC-01) · 전이가 없으면 실제 완료가 그대로 성공으로 표시된다(무효화가 정상 경로를 막지 않는다)", async () => {
  loginAs("f24-copy-d")

  let view
  await act(async () => {
    view = render(React.createElement(RoomCodeViewModal, {
      open: true, onClose: () => {}, roomCode: "AB2C3D",
    }))
  })

  await act(async () => { copyButton(view.container).click() })
  await act(async () => {
    pendingClipboard.resolve()
    await Promise.resolve()
  })

  const copy = copyButton(view.container)
  assert.equal(copy.textContent.includes("복사됨"), true, "정상 완료가 성공으로 표시되지 않았다")
  assert.equal(copy.getAttribute("data-copy-status"), ROOM_CODE_COPY_RESULTS.COPY_SUCCEEDED)
})
