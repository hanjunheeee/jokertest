/**
 * F-20: 편집 화면 ↔ 서버 ↔ 상태 동기화의 통합 계약.
 *
 * 실제 GameSetupPanel(.jsx)을 jsdom에 마운트하고, 실제 useMatchingRoom·matchingStore·
 * roomSettingsForm을 그대로 쓴다. 소켓만 대역이며 그 대역은 **실제 백엔드 핸들러**
 * (backend/socket/matchmaking.js)로 요청을 흘려보낸다 — 계약을 문자열로 흉내내지 않고
 * 양쪽 실제 코드를 한 경로로 잇는다.
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// backend/socket/matchmaking.js가 require 시점에 끌고 오는 repositories/models가 파싱
// 가능한 DATABASE_URL을 요구한다(이 저장소 backend 테스트의 공통 관례 — 실제 연결은 없다).
process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}
installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// 실제 화면 코드가 쓰는 확인 대화상자/경고는 시험에서 기록만 한다(사용자 입력을 기다리면
// 프로세스가 멈춘다). 기록해 두고 "경고가 났는가"도 함께 단언한다.
const alerts = []
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => false)

register(new URL(
  "../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

// ── 소켓 대역: emit을 실제 백엔드 핸들러로 흘려보낸다 ──────────────────────
//
// 여기서 흉내내는 것은 "전송"뿐이다. 검증·권한·버전·점유·커밋 판정은 전부 실제 서버 코드가
// 한다. 그래서 프런트가 만든 payload가 서버 계약과 어긋나면 이 시험이 곧바로 깨진다.
const socketState = { socket: null, listeners: new Map() }

function emitToClient(event, payload) {
  for (const handler of socketState.listeners.get(event) ?? []) handler(payload)
}

mock.module("@/shared/socket/socketClient", {
  namedExports: {
    getSocket: () => socketState.socket,
    subscribeSocket: () => () => {},
  },
})
mock.module("@/shared/hooks/useSfxRuntime.js", {
  namedExports: { dispatchSfxEvent: () => {}, dispatchUiSfx: () => {} },
})

const { render, act, cleanup, renderHook } = await import("@testing-library/react")
const { default: GameSetupPanel } = await import("../../../setup/components/GameSetupPanel.jsx")
const { useMatchingStore } = await import("../../store/matchingStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useMatchingRoom } = await import("../useMatchingRoom.js")
const { buildRoomSettingsFormState, buildUpdateRoomSettingsPayload } =
  await import("../../../setup/utils/roomSettingsForm.js")
const { SOCKET_EVENTS } = await import("../../../setup/constants/gameSetupSocket.js")

const { default: matchmaking } = await import("../../../../../../../backend/socket/matchmaking.js")
const { default: matchmakingFixtures } =
  await import("../../../../../../../backend/socket/__tests__/testHelpers/matchmakingFixtures.js")

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
  getPublicProfileLoadouts: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
  getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {}])),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const { createFakeSocket, createFakeIo, validSettingsPayload } = matchmakingFixtures
const { handleCreateRoom, handleUpdateRoomSettings, handleGetCurrentRoom } = matchmaking.__testables

/**
 * 프런트가 쓰는 소켓 대역을 만든다.
 *
 * emitWithAck으로 들어온 이벤트를 실제 서버 핸들러로 보내고, 서버가 그 계정의 소켓에 보낸
 * room_settings_updated는 클라이언트 리스너로 되돌린다.
 */
function createBridgedSocket(io, serverSocket, uuid) {
  const emittedToServer = []
  const socket = {
    connected: true,
    on(event, handler) {
      if (!socketState.listeners.has(event)) socketState.listeners.set(event, new Set())
      socketState.listeners.get(event).add(handler)
    },
    off(event, handler) { socketState.listeners.get(event)?.delete(handler) },
    emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      emittedToServer.push({ event, payload })
      return new Promise((resolve, reject) => {
        if (event === SOCKET_EVENTS.GET_CURRENT_ROOM) {
          handleGetCurrentRoom(uuid, resolve)
          return
        }
        if (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS) {
          // 서버가 방송한 사건을 클라이언트 리스너로 되돌리기 위해 서버 소켓의 emit을 감싼다.
          handleUpdateRoomSettings(io, serverSocket, uuid, payload, resolve)
          return
        }
        reject(new Error(`시험 대역이 알지 못하는 이벤트: ${event}`))
      })
    },
    emittedToServer,
  }
  return socket
}

/** 서버 fake socket이 이 계정에게 보낸 사건을 클라이언트 리스너로 전달한다. */
function bridgeServerEmits(serverSocket) {
  const original = serverSocket.emit.bind(serverSocket)
  serverSocket.emit = (event, payload) => {
    original(event, payload)
    emitToClient(event, payload)
  }
}

async function setupRoom(hostUuid, payloadOverrides = {}) {
  matchmaking.__resetStateForTests()
  socketState.listeners = new Map()
  alerts.length = 0

  const io = createFakeIo([])
  const serverSocket = createFakeSocket(hostUuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  const created = await new Promise((resolve) =>
    handleCreateRoom(io, serverSocket, hostUuid, validSettingsPayload(payloadOverrides), resolve))
  assert.equal(created.ok, true, created.message)

  bridgeServerEmits(serverSocket)
  socketState.socket = createBridgedSocket(io, serverSocket, hostUuid)

  useAuthStore.setState({ user: { uuid: hostUuid }, isLoggedIn: true })
  useMatchingStore.getState().setRoom(created.room)
  return { io, serverSocket, room: created.room }
}

test.afterEach(() => {
  cleanup()
  useMatchingStore.getState().clearRoom()
})

test("편집 패널은 서버 확정 설정에서 시작하고, D-12·관전자 항목을 어디에도 그리지 않는다", async () => {
  const { room } = await setupRoom("host-a", {
    maxPlayers: 6, jokerCount: 2, dayDiscussionTime: 90, dayVoteTime: 30, nightActionTime: 60,
  })

  // 서버 응답에 예전 관전자 키가 섞여 있어도 폼 상태로 옮겨지지 않아야 한다.
  const formState = buildRoomSettingsFormState({
    accessType: room.accessType,
    settings: { ...room.settings, allowSpectators: true, "allow-spectators": true },
  })
  assert.equal(formState.ok, true, formState.code)
  assert.equal(Object.hasOwn(formState.checks, "allow-spectators"), false)
  assert.equal(Object.hasOwn(formState.ranges, "allow-spectators"), false)
  assert.equal(JSON.stringify(formState).includes("pectator"), false)

  // 서버 값이 그대로 폼 값이 됐는가.
  assert.equal(formState.ranges["max-players"], 6)
  assert.equal(formState.ranges["day-discussion-time"], 90)
  assert.equal(formState.ranges["day-vote-time"], 30)
  assert.equal(formState.ranges["night-action-time"], 60)
  assert.equal(formState.checks["private-lobby"], false)

  let container
  await act(async () => {
    ;({ container } = render(React.createElement(GameSetupPanel, {
      visible: true, mode: "edit", initialFormState: formState, formResetKey: "r1",
      isCreating: false, onCreateGame: () => {},
    })))
  })

  const text = container.textContent
  assert.equal(text.includes("관전"), false, "편집 화면에 관전자 항목이 있다")
  for (const hidden of ["불이 꺼진 무도회", "영혼의 베팅", "투표 공개"]) {
    assert.equal(text.includes(hidden), false, `편집 화면에 ${hidden}가 남아 있다`)
  }
  assert.equal(text.includes("최대 플레이어 수"), true, "편집 대상 항목이 사라졌다")
  // 버튼 라벨·aria-label이 편집 모드의 것이어야 한다.
  const submit = container.querySelector("button[aria-label='설정 저장']")
  assert.ok(submit, "설정 저장 버튼이 없다")
  assert.equal(submit.textContent.includes("게임 만들기"), false)
})

test("편집 화면의 제출은 실제 서버 계약을 통과해 저장되고 참가자 응답에 반영된다", async () => {
  const { io, serverSocket, room } = await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })
  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })
  assert.equal(formState.ok, true)

  let submitted = null
  await act(async () => {
    render(React.createElement(GameSetupPanel, {
      visible: true, mode: "edit", initialFormState: formState, formResetKey: "r1",
      isCreating: false, onCreateGame: (state) => { submitted = state },
    }))
  })

  const submit = document.querySelector("button[aria-label='설정 저장']")
  await act(async () => { submit.click() })
  assert.ok(submitted, "제출 콜백이 폼 상태를 넘기지 않았다")

  // 폼 상태 → 요청 payload → 실제 서버 핸들러.
  const payload = buildUpdateRoomSettingsPayload({
    ...submitted,
    // 실제 화면에서는 useMatchingRoom이 채우는 값이다.
    roomId: room.roomId,
    requestId: "req-ui-1",
    expectedSettingsVersion: room.settingsVersion,
    ranges: { ...submitted.ranges, "max-players": 5, "day-discussion-time": 120 },
    checks: { ...submitted.checks, "private-lobby": true },
  })
  assert.equal(Object.hasOwn(payload, "lightsOut"), false, "편집 대상이 아닌 값이 요청에 실렸다")
  assert.equal(Object.hasOwn(payload, "voteReveal"), false)
  assert.equal(JSON.stringify(payload).includes("pectator"), false)

  // 방을 실제로 만든 그 소켓·그 io를 그대로 쓴다(권한·소속 판정이 진짜 상태 위에서 돈다).
  const response = await new Promise((resolve) =>
    handleUpdateRoomSettings(io, serverSocket, "host-a", payload, resolve))
  assert.equal(response.ok, true, response.message)
  assert.equal(response.changed, true)

  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.equal(current.room.accessType, "code")
  assert.equal(current.room.settings.maxPlayers, 5)
  assert.equal(current.room.settings.dayDiscussionTime, 120)
  // 서버가 보존하는 D-12 값은 그대로다(편집에서 보내지 않았는데 사라지면 안 된다).
  assert.equal(current.room.settings.voteReveal, true)
})

test("useMatchingRoom 저장은 서버를 거쳐 store의 설정·버전·준비 상태를 갱신한다", async () => {
  const { room } = await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })

  const { result } = renderHook(() => useMatchingRoom({ onRoomDeleted: () => {}, onGameStarted: () => {} }))
  // 화면 진입 시 get_current_room으로 검증 상태가 된다.
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true, "방 검증이 끝나지 않았다")

  const formState = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType,
    settings: useMatchingStore.getState().settings,
  })
  assert.equal(formState.ok, true, formState.code)

  let saveResult
  await act(async () => {
    saveResult = await result.current.saveRoomSettings({
      ...formState,
      ranges: { ...formState.ranges, "max-players": 6, "day-vote-time": 30 },
    })
  })
  assert.equal(saveResult.ok, true, JSON.stringify(saveResult))
  assert.equal(saveResult.changed, true)

  const state = useMatchingStore.getState()
  assert.equal(state.settingsVersion, 2, "store가 새 설정 버전을 반영하지 않았다")
  assert.equal(state.settings.maxPlayers, 6)
  assert.equal(state.settings.dayVoteTime, 30)
  assert.ok(state.players.every((p) => p.isReady !== true), "저장 후 준비 표시가 해제되지 않았다")
  assert.equal(room.settingsVersion, 1, "최초 응답 객체가 나중에 변형됐다")
})

test("비방장·미검증 상태에서는 저장 요청이 서버로 나가지 않는다", async () => {
  await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })
  // 방장이 아닌 계정으로 바꾼다 — 화면 버튼과 무관하게 요청 경계 자체가 막혀야 한다.
  useAuthStore.setState({ user: { uuid: "not-host" }, isLoggedIn: true })

  const { result } = renderHook(() => useMatchingRoom({ onRoomDeleted: () => {}, onGameStarted: () => {} }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })

  const before = socketState.socket.emittedToServer.filter(
    (e) => e.event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length

  let saveResult
  await act(async () => {
    saveResult = await result.current.saveRoomSettings({
      checks: { "private-lobby": false },
      ranges: { "max-players": 6, "joker-count": 1, "day-discussion-time": 60, "day-vote-time": 60, "night-action-time": 90 },
      roleComposition: { mode: "auto", roleCounts: null },
      specifiedRoleNightActionTimes: [],
    })
  })
  assert.equal(saveResult.ok, false)

  const after = socketState.socket.emittedToServer.filter(
    (e) => e.event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length
  assert.equal(after, before, "권한 없는 계정의 저장 요청이 서버로 나갔다")
})
