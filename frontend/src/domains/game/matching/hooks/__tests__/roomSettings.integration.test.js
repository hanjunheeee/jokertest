import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

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
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const alerts = []
const roomCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => false)

register(new URL(
  "../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const socketState = { socket: null, subscribers: new Set(), clientReceived: [] }

function deepSnapshot(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function setTestSocket(next) {
  socketState.socket = next
  for (const notify of [...socketState.subscribers]) notify()
}

function emitToClient(event, payload, target = socketState.socket) {
  assert.ok(target, "전달할 클라이언트 소켓이 없다")
  const handlers = [...(target.listeners.get(event) ?? [])]
  socketState.clientReceived.push({
    event, socketId: target.socketId, payload: deepSnapshot(payload), handlers: handlers.length,
  })
  for (const handler of handlers) handler(payload)
}

function clientReceiptsOf(event, target = null) {
  return socketState.clientReceived.filter((entry) =>
    entry.event === event && (target === null || entry.socketId === target.socketId))
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

const { render, act, cleanup, renderHook, waitFor } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: GameSetupPanel } = await import("../../../setup/components/GameSetupPanel.jsx")
const { default: GameSetupPage } = await import("../../../setup/pages/GameSetupPage.jsx")
const { default: GameMatchingPage } = await import("../../pages/GameMatchingPage.jsx")
const { useMatchingStore } = await import("../../store/matchingStore.js")
const { default: SettingPanelContent } =
  await import("../../../ingame/components/controls/ingameSetting/SettingPanelContent.jsx")
const { INGAME_SETTING_ROOM_ROWS } =
  await import("../../../ingame/constants/controls/ingameSetting/ingameSettingData.js")
const { useInGameStore } = await import("../../../ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useMatchingRoom } = await import("../useMatchingRoom.js")
const { buildRoomSettingsFormState, buildUpdateRoomSettingsPayload } =
  await import("../../../setup/utils/roomSettingsForm.js")
const { SOCKET_EVENTS, ROOM_SETTINGS_ERROR_CODES, ROOM_SETTINGS_ERROR_MESSAGES } =
  await import("../../../setup/constants/gameSetupSocket.js")

const { default: matchmaking } = await import("../../../../../../../backend/socket/matchmaking.js")
const { default: gameSessionSocketLayer } = await import("../../../../../../../backend/socket/gameSession.js")
const { default: matchmakingFixtures } =
  await import("../../../../../../../backend/socket/__tests__/testHelpers/matchmakingFixtures.js")

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
  getPublicProfileLoadouts: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
  getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {}])),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const { createFakeSocket, createFakeIo, validSettingsPayload, readyPayload } = matchmakingFixtures
const {
  handleCreateRoom, handleUpdateRoomSettings, handleGetCurrentRoom, handleGetPublicRooms,
  handleJoinRoomByCode, handleSetReady, handleGetRoomSettingsUpdateResult,
} = matchmaking.__testables

function findSpectatorKeys(value, path = "$") {
  if (value === null || typeof value !== "object") return []
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSpectatorKeys(item, `${path}[${index}]`))
  }
  const found = []
  for (const [key, child] of Object.entries(value)) {
    const here = `${path}.${key}`
    if (key.toLowerCase().includes("spectator")) found.push(here)
    found.push(...findSpectatorKeys(child, here))
  }
  return found
}

function assertNoSpectatorKeys(value, where) {
  const found = findSpectatorKeys(value)
  assert.deepEqual(found, [], `${where}에 폐기된 관전 키가 남아 있다: ${found.join(", ")}`)
}

const NORMAL_ROLE_KEYS = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]

const PLAYER_READY_CHANGED = "player_ready_changed"

let bridgedSocketSeq = 0
function createBridgedSocket(io, serverSocket, uuid) {
  matchmaking.registerMatchmakingHandlers(io, serverSocket, uuid)
  gameSessionSocketLayer.registerGameHandlers(io, serverSocket, uuid)
  const emittedToServer = []
  const listeners = new Map()
  bridgedSocketSeq += 1
  const socketId = `client-sock-${bridgedSocketSeq}`
  const requests = []
  const responses = []
  const droppedAcks = new Set()
  const socket = {
    connected: true,
    socketId,
    listeners,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    handlerCountOf: (event) => listeners.get(event)?.size ?? 0,
    emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      emittedToServer.push({ event, payload })
      requests.push({ event, payload: deepSnapshot(payload) })
      return new Promise((resolve, reject) => {
        const settle = (response) => {
          responses.push({ event, response: deepSnapshot(response) })
          if (droppedAcks.has(event)) {
            reject(new Error("operation has timed out"))
            return
          }
          resolve(response)
        }
        const BRIDGED_EVENTS = [
          SOCKET_EVENTS.GET_CURRENT_ROOM,
          SOCKET_EVENTS.UPDATE_ROOM_SETTINGS,
          SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT,
          SOCKET_EVENTS.CREATE_ROOM,
        ]
        if (BRIDGED_EVENTS.includes(event)) {
          assert.ok(
            serverSocket.listenerCount(event) > 0,
            `등록부가 ${event} 리스너를 만들지 않았다 — 실제 클라이언트도 이 요청을 보낼 수 없다`,
          )
          serverSocket.trigger(event, payload, settle)
          return
        }
        reject(new Error(`시험 대역이 알지 못하는 이벤트: ${event}`))
      })
    },
    emittedToServer,
    requests,
    responses,
    requestsOf: (event) => requests.filter((entry) => entry.event === event),
    responsesOf: (event) => responses.filter((entry) => entry.event === event),
    dropAcksFor: (event) => droppedAcks.add(event),
    restoreAcksFor: (event) => droppedAcks.delete(event),
  }
  return socket
}

function bridgeServerEmits(serverSocket, clientSocket) {
  assert.ok(clientSocket, "bridgeServerEmits에는 이 서버 연결과 짝지을 클라이언트 연결이 필요하다")
  const original = serverSocket.emit.bind(serverSocket)
  serverSocket.emit = (event, payload) => {
    original(event, payload)
    emitToClient(event, payload, clientSocket)
  }
}

let reconnectSeq = 0
function reconnectPair(io, uuid, previousServerSocket) {
  reconnectSeq += 1
  const nextServerSocket = createFakeSocket(uuid, { id: `${previousServerSocket.id}-r${reconnectSeq}` })
  io.sockets.sockets.set(nextServerSocket.id, nextServerSocket)
  for (const channel of previousServerSocket.rooms) nextServerSocket.rooms.add(channel)
  nextServerSocket.data.activeRoomId = previousServerSocket.data.activeRoomId

  io.sockets.sockets.delete(previousServerSocket.id)
  previousServerSocket.rooms.clear()
  previousServerSocket.connected = false

  const nextClientSocket = createBridgedSocket(io, nextServerSocket, uuid)
  bridgeServerEmits(nextServerSocket, nextClientSocket)
  return { serverSocket: nextServerSocket, clientSocket: nextClientSocket }
}

async function setupRoom(hostUuid, payloadOverrides = {}) {
  matchmaking.__resetStateForTests()
  socketState.clientReceived = []
  alerts.length = 0

  const io = createFakeIo([])
  const serverSocket = createFakeSocket(hostUuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  const created = await new Promise((resolve) =>
    handleCreateRoom(io, serverSocket, hostUuid, validSettingsPayload(payloadOverrides), resolve))
  assert.equal(created.ok, true, created.message)

  const clientSocket = createBridgedSocket(io, serverSocket, hostUuid)
  bridgeServerEmits(serverSocket, clientSocket)
  setTestSocket(clientSocket)

  useAuthStore.setState({ user: { uuid: hostUuid }, isLoggedIn: true })
  useMatchingStore.getState().setRoom(created.room)
  return { io, serverSocket, clientSocket, room: created.room }
}

async function mountCreationPage(hostUuid) {
  matchmaking.__resetStateForTests()
  socketState.clientReceived = []
  alerts.length = 0

  const io = createFakeIo([])
  const serverSocket = createFakeSocket(hostUuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  const clientSocket = createBridgedSocket(io, serverSocket, hostUuid)
  bridgeServerEmits(serverSocket, clientSocket)
  setTestSocket(clientSocket)

  useAuthStore.setState({ user: { uuid: hostUuid }, isLoggedIn: true })
  useMatchingStore.getState().clearRoom()

  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/game-setup"] },
      React.createElement(GameSetupPage)))
  })
  await waitFor(() => {
    const button = view.container.querySelector("button[aria-label='게임 만들기']")
    assert.ok(button && button.disabled === false, "게임 만들기 버튼이 아직 활성화되지 않았다")
  })
  return { io, serverSocket, view }
}

function setupRow(container, label) {
  return [...container.querySelectorAll("[data-setup-row]")]
    .find((node) => node.querySelector("p")?.textContent.trim() === label) ?? null
}

function stepperValue(container, label) {
  const row = setupRow(container, label)
  assert.ok(row, `${label} 행이 화면에 없다`)
  assert.ok(row.querySelector(`button[aria-label='${label} 감소']`), `${label}가 스테퍼 행이 아니다`)
  const values = [...row.querySelectorAll("span")]
    .map((node) => node.textContent.trim()).filter(Boolean)
  assert.equal(values.length, 1, `${label} 행에서 값을 하나로 읽지 못했다: ${values.join(" / ")}`)
  return values[0]
}

function roleCompositionRowLabels(container) {
  const section = container.querySelector("[data-setup-role-composition]")
  assert.ok(section, "역할 구성 구역이 화면에 없다")
  return [...section.querySelectorAll("[data-setup-row]")]
    .map((node) => node.querySelector("p")?.textContent.trim())
    .filter((label) => label?.endsWith(" 인원"))
}

async function clickSetupTab(container, label) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label)
  assert.ok(button, `${label} 탭 버튼이 없다`)
  await act(async () => { button.click() })
}

test.afterEach(() => {
  cleanup()
  useMatchingStore.getState().clearRoom()
})

test("F-23(SPLIT-2) · 폐기 키 검출기는 중첩·대문자 SPECTATOR까지 각각 단독 주입에서 검출한다", () => {
  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode", "SPECTATOR"]) {
    assert.deepEqual(
      findSpectatorKeys({ maxPlayers: 8, [key]: true }), [`$.${key}`],
      `최상위 ${key}를 검출하지 못했다`,
    )
  }

  assert.deepEqual(
    findSpectatorKeys({ roleCounts: { JOKER: 2, DOCTOR: 1, SPECTATOR: 1 } }),
    ["$.roleCounts.SPECTATOR"], "roleCounts.SPECTATOR를 검출하지 못했다",
  )
  assert.deepEqual(
    findSpectatorKeys({ roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 } }),
    ["$.roleNightActionTimes.SPECTATOR"], "roleNightActionTimes.SPECTATOR를 검출하지 못했다",
  )
  assert.deepEqual(
    findSpectatorKeys({ players: [{ uuid: "a" }, { uuid: "b", allowSpectators: true }] }),
    ["$.players[1].allowSpectators"], "배열 안의 폐기 키를 검출하지 못했다",
  )

  assert.deepEqual(findSpectatorKeys({
    maxPlayers: 8, jokerCount: 2, voteReveal: true,
    roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    roleNightActionTimes: { JOKER: 30 },
  }), [])
  assert.deepEqual(findSpectatorKeys({ nickname: "spectator-fan", title: "SPECTATOR" }), [])
})

test("F-23(AC-01/AC-02) · 실제 인게임 방관리 탭에 관전자 항목이 없고 나머지 방관리 기능은 그대로다", async () => {
  assert.equal(
    INGAME_SETTING_ROOM_ROWS.filter((row) => /spectator|관전/i.test(`${row.id}${row.title ?? ""}`)).length,
    0, "행 정의에 관전자 항목이 남아 있다",
  )

  useAuthStore.setState({ user: { uuid: "host-ingame" }, isLoggedIn: true })
  useInGameStore.setState({ gameId: "game-ingame", hostUuid: "host-ingame" })

  const kicks = []
  let container
  await act(async () => {
    ;({ container } = render(React.createElement(SettingPanelContent, {
      onOpenKickPlayer: () => kicks.push("open"),
    })))
  })

  const roomTab = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "방관리")
  assert.ok(roomTab, "방장인데 방관리 탭이 없다")
  await act(async () => { roomTab.click() })

  assert.equal(container.textContent.includes("관전"), false, "방관리 탭에 관전자 문구가 있다")
  assert.equal(container.querySelector("[aria-label='관전자 허용']"), null, "관전자 체크박스가 남아 있다")

  for (const kept of ["플레이어 추방", "다음 게임 동일 설정 유지", "방 코드 복사"]) {
    assert.equal(container.textContent.includes(kept), true, `${kept} 항목이 사라졌다`)
  }
  assert.equal(container.textContent.includes("강제 종료"), false, "취소된 강제 종료가 되살아났다")

  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  assert.ok(keepBox, "다음 게임 유지 체크박스가 없다")
  const emittedBefore = socketState.socket ? socketState.socket.emittedToServer.length : 0
  await act(async () => { keepBox.click() })
  assert.equal(
    socketState.socket ? socketState.socket.emittedToServer.length : 0, emittedBefore,
    "로컬 체크가 서버 요청을 만들었다",
  )

  const kickButton = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "추방하기")
  assert.ok(kickButton, "추방하기 버튼이 사라졌다")
  await act(async () => { kickButton.click() })
  assert.deepEqual(kicks, ["open"], "추방 콜백이 한 번 이어지지 않았다")

  useInGameStore.getState().clearGame()
})

test("F-23(AC-02) · 설정 항목 정의·폼/요청 키·store 상태 키가 전수로 고정된다", async () => {
  const { GAME_SETUP_TABS, GENERAL_GAME_SETUP, MEETING_GAME_SETUP } =
    await import("../../../setup/constants/gameSetupOptions.js")
  const { INGAME_SETTING_TABS } =
    await import("../../../ingame/constants/controls/ingameSetting/ingameSettingData.js")

  assert.deepEqual(INGAME_SETTING_TABS.map((tab) => tab.id), ["chat", "sound", "room"],
    "인게임 설정 탭 목록이 바뀌었다")
  assert.deepEqual(
    INGAME_SETTING_ROOM_ROWS.map((row) => `${row.kind}:${row.id}`),
    ["action:kick-player", "checkbox:keep-settings-next-game", "action:view-room-code"],
    "인게임 방관리 항목 정의가 바뀌었다",
  )
  assert.deepEqual(
    INGAME_SETTING_ROOM_ROWS.map((row) => row.title),
    ["플레이어 추방", "다음 게임 동일 설정 유지", "방 코드 복사"],
    "인게임 방관리 항목 문구가 바뀌었다",
  )

  assert.deepEqual(GAME_SETUP_TABS.map((tab) => tab.id), ["general", "meeting"])
  assert.deepEqual(GENERAL_GAME_SETUP.map((item) => item.id),
    ["private-lobby", "max-players", "joker-count", "lights-out", "soul-betting"],
    "일반 탭 설정 항목 정의가 바뀌었다")
  assert.deepEqual(MEETING_GAME_SETUP.map((item) => item.id), [
    "day-discussion-time", "day-vote-time", "night-action-time",
    "night-action-time-joker", "night-action-time-doctor",
    "night-action-time-guard", "night-action-time-witch-hunter",
    "vote-reveal",
  ], "회의&투표 탭 설정 항목 정의가 바뀌었다")

  const definitionText = [
    ...INGAME_SETTING_TABS, ...INGAME_SETTING_ROOM_ROWS,
    ...GAME_SETUP_TABS, ...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP,
  ].map((item) => `${item.id}|${item.label ?? ""}|${item.title ?? ""}|${item.description ?? ""}`)
  assert.deepEqual(definitionText.filter((text) => /spectat|관전/i.test(text)), [],
    "설정 항목 정의에 관전 항목이 있다")
  assert.deepEqual(["max-players||최대 플레이어 수|", "allow-spectators||관전자 허용|"]
    .filter((text) => /spectat|관전/i.test(text)), ["allow-spectators||관전자 허용|"])

  useMatchingStore.getState().clearRoom()
  const state = useMatchingStore.getState()
  const dataKeys = Object.keys(state).filter((key) => typeof state[key] !== "function")
  assert.deepEqual(dataKeys.sort(), [
    "accessType", "bootEpoch", "canStart", "hostUuid", "isInRoom", "isSearching",
    "players", "roomCode", "roomId", "roomInstanceId", "roomRevision",
    "settings", "settingsVersion",
  ], "matchingStore의 상태 키가 바뀌었다")
  assert.deepEqual(Object.keys(state).filter((key) => /spectat|관전/i.test(key)), [],
    "store에 관전 관련 키가 있다")

  const serverSettings = {
    maxPlayers: 8, jokerCount: 2, roleCompositionMode: "auto",
    dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
    lightsOut: false, soulBetting: false, voteReveal: true,
  }
  const form = buildRoomSettingsFormState({ accessType: "open", settings: serverSettings })
  assert.equal(form.ok, true, "정상 설정이 폼으로 변환되지 않았다")
  assertNoSpectatorKeys(form, "공용 폼 변환 결과")
  const payload = buildUpdateRoomSettingsPayload({
    ...form, roomId: "room-keys", requestId: "req-keys", expectedSettingsVersion: 1,
  })
  assert.deepEqual(Object.keys(payload).sort(), [
    "accessType", "dayDiscussionTime", "dayVoteTime", "expectedSettingsVersion",
    "jokerCount", "maxPlayers", "nightActionTime", "roleCompositionMode",
    "requestId", "roomId",
  ].sort(), "저장 요청의 키 집합이 바뀌었다")
  assertNoSpectatorKeys(payload, "저장 요청 payload")
})

test("AC-06 · 실제 생성 화면의 두 탭·요청·저장값·조회·store·공개 목록 어디에도 관전자 항목이 없다", async () => {
  const { view } = await mountCreationPage("host-create")
  const container = view.container

  assert.equal(container.textContent.includes("관전"), false, "일반 탭에 관전자 항목이 있다")
  assert.equal(container.textContent.includes("최대 플레이어 수"), true, "일반 탭 항목이 사라졌다")
  await clickSetupTab(container, "회의&투표")
  assert.equal(container.textContent.includes("관전"), false, "회의&투표 탭에 관전자 항목이 있다")
  assert.equal(container.textContent.includes("투표 공개"), true, "생성 화면의 D-12 항목이 사라졌다")
  await clickSetupTab(container, "일반")

  await act(async () => {
    container.querySelector("button[aria-label='게임 만들기']").click()
  })
  await waitFor(() => assert.ok(useMatchingStore.getState().roomId, "생성 뒤 store에 방이 들어오지 않았다"))
  assert.deepEqual(alerts, [], alerts.join(" / "))

  const created = socketState.socket.emittedToServer
    .filter((e) => e.event === SOCKET_EVENTS.CREATE_ROOM)
  assert.equal(created.length, 1, "생성 요청이 정확히 한 번 나가지 않았다")
  const sentPayload = created[0].payload
  assertNoSpectatorKeys(sentPayload, "생성 요청")
  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode"]) {
    assert.equal(Object.hasOwn(sentPayload, key), false, `생성 요청에 ${key}가 실렸다`)
  }

  const [[storedRoomId, storedRoom]] = matchmaking.__getStateSnapshotForTests().gameRooms
  assertNoSpectatorKeys(storedRoom.settings, "서버 저장값")
  assert.equal(storedRoom.settings.maxPlayers, sentPayload.maxPlayers, "정상 설정 수치가 보존되지 않았다")

  const state = useMatchingStore.getState()
  assert.equal(storedRoomId, state.roomId)
  assertNoSpectatorKeys(state.settings, "store 설정")
  const current = await new Promise((resolve) => handleGetCurrentRoom("host-create", resolve))
  assert.equal(current.ok, true)
  assertNoSpectatorKeys(current.room, "현재 방 조회 응답")

  const list = await new Promise((resolve) => handleGetPublicRooms(resolve))
  assert.equal(list.ok, true)
  assert.equal(list.rooms.length, 1, "생성한 방이 공개 목록에 있어야 한다")
  assert.ok(list.rooms.some((room) => room.id === storedRoomId), "생성한 방의 공개 응답을 검사해야 한다")
  assertNoSpectatorKeys(list.rooms, "공개 목록 응답")
})

test("AC-06 · 생성 요청의 최상위 관전자 키는 무시돼 정상 생성되고, 중첩 역할 키는 생성 자체가 거부된다", async () => {
  await mountCreationPage("host-reject")

  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode", "SPECTATOR"]) {
    matchmaking.__resetStateForTests()
    const res = await socketState.socket.emitWithAck(
      SOCKET_EVENTS.CREATE_ROOM, { ...validSettingsPayload(), [key]: true },
    )
    assert.equal(res.ok, true, `${key}: ${res.message}`)
    const rooms = matchmaking.__getStateSnapshotForTests().gameRooms
    assert.equal(rooms.length, 1, `${key}: 정상 생성이 방을 정확히 하나 만들지 않았다`)
    const [, storedRoom] = rooms[0]
    assertNoSpectatorKeys(storedRoom.settings, `${key}를 실은 생성의 저장값`)
    assert.equal(storedRoom.settings.maxPlayers, 8, "정상 설정 수치가 훼손됐다")
    assert.equal(storedRoom.settings.voteReveal, true, "정상 설정 수치가 훼손됐다")
    assertNoSpectatorKeys(res.room, `${key}를 실은 생성의 응답`)
  }

  for (const nestedSettings of [
    { roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 } },
    { roleCompositionMode: "custom", roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, SPECTATOR: 1 } },
  ]) {
    matchmaking.__resetStateForTests()
    const nested = await socketState.socket.emitWithAck(SOCKET_EVENTS.CREATE_ROOM, {
      ...validSettingsPayload(), ...nestedSettings,
    })
    const where = Object.keys(nestedSettings).join("+")
    assert.equal(nested.ok, false, `중첩 관전자 키(${where})가 거부되지 않았다`)
    assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.length, 0,
      `거부된 요청(${where})이 방을 만들었다`)
  }
  matchmaking.__resetStateForTests()
})

test("편집 패널은 서버 확정 설정에서 시작하고, D-12·관전자 항목을 어디에도 그리지 않는다", async () => {
  const { room } = await setupRoom("host-a", {
    maxPlayers: 6, jokerCount: 2, dayDiscussionTime: 90, dayVoteTime: 30, nightActionTime: 60,
  })

  const formState = buildRoomSettingsFormState({
    accessType: room.accessType,
    settings: { ...room.settings, allowSpectators: true, "allow-spectators": true },
  })
  assert.equal(formState.ok, true, formState.code)
  assert.equal(Object.hasOwn(formState.checks, "allow-spectators"), false)
  assert.equal(Object.hasOwn(formState.ranges, "allow-spectators"), false)
  assert.equal(JSON.stringify(formState).includes("pectator"), false)

  const nestedForm = buildRoomSettingsFormState({
    accessType: room.accessType,
    settings: { ...room.settings, roleCompositionMode: "custom",
      roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, SPECTATOR: 1 },
      roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 },
    },
  })
  assert.equal(nestedForm.ok, true, nestedForm.code)
  assert.deepEqual(nestedForm.roleComposition.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(nestedForm.specifiedRoleNightActionTimes, ["JOKER"])
  assert.equal(JSON.stringify(nestedForm).includes("SPECTATOR"), false)
  const nestedPayload = buildUpdateRoomSettingsPayload({ ...nestedForm,
    roomId: room.roomId, requestId: "nested-form-proof", expectedSettingsVersion: room.settingsVersion,
  })
  assert.equal(nestedPayload.roleNightActionTimes.JOKER, 30)
  assert.equal(nestedPayload.roleCounts.DOCTOR, 1)
  assert.equal(JSON.stringify(nestedPayload).includes("SPECTATOR"), false)

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

  const payload = buildUpdateRoomSettingsPayload({
    ...submitted,
    roomId: room.roomId,
    requestId: "req-ui-1",
    expectedSettingsVersion: room.settingsVersion,
    ranges: { ...submitted.ranges, "max-players": 5, "day-discussion-time": 120 },
    checks: { ...submitted.checks, "private-lobby": true },
  })
  assert.equal(Object.hasOwn(payload, "lightsOut"), false, "편집 대상이 아닌 값이 요청에 실렸다")
  assert.equal(Object.hasOwn(payload, "voteReveal"), false)
  assert.equal(JSON.stringify(payload).includes("pectator"), false)

  const response = await new Promise((resolve) =>
    handleUpdateRoomSettings(io, serverSocket, "host-a", payload, resolve))
  assert.equal(response.ok, true, response.message)
  assert.equal(response.changed, true)

  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.equal(current.room.accessType, "code")
  assert.equal(current.room.settings.maxPlayers, 5)
  assert.equal(current.room.settings.dayDiscussionTime, 120)
  assert.equal(current.room.settings.voteReveal, true)
})

test("useMatchingRoom 저장은 서버를 거쳐 store의 설정·버전·준비 상태를 갱신한다", async () => {
  const { room } = await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
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

test("F-23(AC-03) · 오염된 저장 설정은 조회·store·폼·저장·방송 어느 경계에도 되살아나지 않는다", async () => {
  const { room } = await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })

  const snapshot = matchmaking.__getStateSnapshotForTests().gameRooms
    .find(([id]) => id === room.roomId)[1]
  const legacy = { ...snapshot, players: new Map(snapshot.players) }
  legacy.settings = {
    ...legacy.settings,
    allowSpectators: true,
    "allow-spectators": true,
    spectatorMode: "all",
    roleNightActionTimes: { ...(legacy.settings.roleNightActionTimes ?? {}), SPECTATOR: 30 },
  }
  matchmaking.__seedRoomForTests(legacy)
  assert.equal(
    Object.hasOwn(matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings, "allowSpectators"),
    true, "이 시험의 전제는 오염된 저장값이다",
  )

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true, "방 검증이 끝나지 않았다")

  const storeSettings = useMatchingStore.getState().settings
  assertNoSpectatorKeys(storeSettings, "조회 뒤 store 설정")
  assert.equal(storeSettings.maxPlayers, 8, "정상 설정값이 함께 사라졌다")

  const formState = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType,
    settings: storeSettings,
  })
  assert.equal(formState.ok, true, formState.code)
  assertNoSpectatorKeys(formState, "폼 상태")

  let saveResult
  await act(async () => {
    saveResult = await result.current.saveRoomSettings({
      ...formState,
      ranges: { ...formState.ranges, "max-players": 6 },
    })
  })
  assert.equal(saveResult.ok, true, JSON.stringify(saveResult))
  assert.equal(saveResult.changed, true)

  const stored = matchmaking.__getStateSnapshotForTests().gameRooms[0][1].settings
  assertNoSpectatorKeys(stored, "저장 뒤 서버 저장값")
  assert.equal(Object.hasOwn(stored.roleNightActionTimes ?? {}, "SPECTATOR"), false)
  assert.equal(stored.maxPlayers, 6)

  const afterSave = useMatchingStore.getState()
  assert.equal(afterSave.settingsVersion, 2, "store가 새 설정 버전을 반영하지 않았다")
  assert.equal(afterSave.settings.maxPlayers, 6)

  await act(async () => {
    emitToClient(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: room.roomId,
      settingsVersion: 1,
      settings: {
        ...stored,
        maxPlayers: 8,
        allowSpectators: true,
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, SPECTATOR: 1 },
        roleNightActionTimes: { ...(stored.roleNightActionTimes ?? {}), SPECTATOR: 30 },
      },
      players: afterSave.players,
      hostUuid: "host-a",
      canStart: false,
    })
  })
  const afterStale = useMatchingStore.getState()
  assert.equal(afterStale.settingsVersion, 2, "이전 버전 방송이 설정 버전을 되돌렸다")
  assert.equal(afterStale.settings.maxPlayers, 6, "이전 버전 방송이 설정값을 되돌렸다")
  assertNoSpectatorKeys(afterStale.settings, "이전 버전 방송을 받은 뒤의 store 설정")

  await act(async () => {
    useAuthStore.setState({ user: { uuid: "other-account" }, isLoggedIn: true })
  })
  assert.equal(
    useMatchingStore.getState().settings, null,
    "전제: 계정이 바뀌면 이전 계정의 방 설정을 놓아야 한다",
  )

  await act(async () => {
    emitToClient(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: room.roomId,
      settingsVersion: 99,
      settings: {
        ...stored,
        maxPlayers: 10,
        allowSpectators: true,
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, SPECTATOR: 1 },
        roleNightActionTimes: { ...(stored.roleNightActionTimes ?? {}), SPECTATOR: 30 },
      },
      players: afterStale.players,
      hostUuid: "host-a",
      canStart: false,
    })
  })
  const afterAccountSwap = useMatchingStore.getState()
  assert.equal(
    afterAccountSwap.settings, null,
    "계정 전이 뒤 도착한 옛 사건이 이전 계정의 설정을 되살렸다",
  )
  assertNoSpectatorKeys(
    { accessType: afterAccountSwap.accessType, settings: afterAccountSwap.settings, players: afterAccountSwap.players },
    "계정 전이 뒤 도착한 옛 사건을 받은 store",
  )
})

test("비방장·미검증 상태에서는 저장 요청이 서버로 나가지 않는다", async () => {
  await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })
  useAuthStore.setState({ user: { uuid: "not-host" }, isLoggedIn: true })

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
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

async function setupCustomRoomWithReadyJoiner(hostUuid = "host-custom", joinerUuid = "guest-custom") {
  const { io, serverSocket, room } = await setupRoom(hostUuid, { maxPlayers: 8, jokerCount: 2 })

  const joinerSocket = createFakeSocket(joinerUuid)
  io.sockets.sockets.set(joinerSocket.id, joinerSocket)
  await handleJoinRoomByCode(io, joinerSocket, joinerUuid, room.roomCode)

  const toCustom = await new Promise((resolve) => handleUpdateRoomSettings(io, serverSocket, hostUuid, {
    roomId: room.roomId, requestId: "custom-setup", expectedSettingsVersion: 1,
    accessType: "open", maxPlayers: 8, jokerCount: 2,
    roleCompositionMode: "custom",
    roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
    roleNightActionTimes: { JOKER: 30 },
  }, resolve))
  assert.equal(toCustom.ok, true, toCustom.message)
  assert.equal(toCustom.changed, true, "전제: CUSTOM 전환은 실제 변경이어야 한다")

  for (const [socket, uuid] of [[serverSocket, hostUuid], [joinerSocket, joinerUuid]]) {
    const ready = await new Promise((resolve) =>
      handleSetReady(io, socket, uuid, readyPayload(room, true, { settingsVersion: 2 }), resolve))
    assert.equal(ready.ok, true, `${uuid} 준비 실패: ${ready.message}`)
  }

  return { io, serverSocket, joinerSocket, room, hostUuid, joinerUuid }
}

function rawStoredRoom(roomId) {
  const [, room] = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === roomId)
  return { ...room, players: new Map(room.players) }
}

function seedContaminatedSettings(roomId) {
  const legacy = rawStoredRoom(roomId)
  legacy.settings = {
    ...legacy.settings,
    allowSpectators: true,
    "allow-spectators": true,
    spectator: "x",
    spectatorMode: "all",
    SPECTATOR: true,
    roleCounts: { ...(legacy.settings.roleCounts ?? {}), SPECTATOR: 1 },
    roleNightActionTimes: { ...(legacy.settings.roleNightActionTimes ?? {}), SPECTATOR: 30 },
  }
  matchmaking.__seedRoomForTests(legacy)

  const seeded = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === roomId)[1].settings
  const found = findSpectatorKeys(seeded)
  assert.ok(found.includes("$.roleCounts.SPECTATOR"), "전제: 중첩 roleCounts 오염이 심어져야 한다")
  assert.ok(found.includes("$.roleNightActionTimes.SPECTATOR"), "전제: 중첩 밤 시간 오염이 심어져야 한다")
  assert.ok(found.includes("$.allowSpectators"), "전제: 최상위 오염이 심어져야 한다")
}

test("F-23(SPLIT-2) · 동일값 저장은 중첩 오염만 걷어내고 버전·준비·방송·수신을 전부 보존한다", async () => {
  const { room, joinerSocket } = await setupCustomRoomWithReadyJoiner()
  seedContaminatedSettings(room.roomId)

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true, "방 검증이 끝나지 않았다")

  const storeSettings = useMatchingStore.getState().settings
  assertNoSpectatorKeys(storeSettings, "오염된 CUSTOM 방의 조회 뒤 store 설정")
  assert.deepEqual(Object.keys(storeSettings.roleCounts).sort(), [...NORMAL_ROLE_KEYS].sort(),
    "정제가 roleCounts의 정상 역할 키를 함께 지웠다")
  assert.deepEqual(storeSettings.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(storeSettings.roleNightActionTimes, { JOKER: 30 })
  assert.equal(useMatchingStore.getState().settingsVersion, 2)

  const formState = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType, settings: storeSettings,
  })
  assert.equal(formState.ok, true, formState.code)
  assertNoSpectatorKeys(formState, "오염된 CUSTOM 방의 폼 상태")
  assert.deepEqual(Object.keys(formState.roleComposition.roleCounts).sort(), [...NORMAL_ROLE_KEYS].sort())
  assert.deepEqual(formState.specifiedRoleNightActionTimes, ["JOKER"],
    "지정된 밤 시간 목록이 정상 역할만 담고 있지 않다")

  const versionBefore = useMatchingStore.getState().settingsVersion
  const readyBefore = [...rawStoredRoom(room.roomId).players]
    .map(([uuid, p]) => [uuid, p.isReady, p.readyRevision])
  assert.ok(readyBefore.every(([, isReady]) => isReady === true), "전제: 전원이 준비 상태여야 한다")
  const receiptsBefore = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).length
  const joinerReceiptsBefore = joinerSocket.countReceived(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED)

  let saveResult
  await act(async () => { saveResult = await result.current.saveRoomSettings(formState) })
  assert.equal(saveResult.ok, true, JSON.stringify(saveResult))
  assert.equal(saveResult.changed, false, "값이 같은 저장이 변경으로 처리됐다")

  const sent = socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).at(-1).payload
  assertNoSpectatorKeys(sent, "동일값 저장 요청")
  assert.deepEqual(sent.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(sent.roleNightActionTimes, { JOKER: 30 })

  const stored = rawStoredRoom(room.roomId)
  assertNoSpectatorKeys(stored.settings, "동일값 저장 뒤 서버 저장값")
  assert.equal(stored.settings.maxPlayers, 8)
  assert.equal(stored.settings.jokerCount, 2)
  assert.equal(stored.settings.dayDiscussionTime, 60)
  assert.equal(stored.settings.dayVoteTime, 60)
  assert.equal(stored.settings.nightActionTime, 90)
  assert.deepEqual(stored.settings.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(stored.settings.roleNightActionTimes, { JOKER: 30 })
  assert.equal(stored.settings.lightsOut, false)
  assert.equal(stored.settings.soulBetting, false)
  assert.equal(stored.settings.voteReveal, true)

  assert.equal(stored.settingsVersion, versionBefore, "정제만으로 설정 버전이 올랐다")
  assert.equal(useMatchingStore.getState().settingsVersion, versionBefore)
  assert.deepEqual(
    [...stored.players].map(([uuid, p]) => [uuid, p.isReady, p.readyRevision]), readyBefore,
    "동일값 저장이 준비 상태나 readyRevision을 건드렸다",
  )
  assert.equal(
    clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).length, receiptsBefore,
    "동일값 저장이 설정 변경 사건을 방장 화면에 전달했다",
  )
  assert.equal(
    joinerSocket.countReceived(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED), joinerReceiptsBefore,
    "동일값 저장이 설정 변경 사건을 참가자에게 전달했다",
  )

  let changedSave
  await act(async () => {
    changedSave = await result.current.saveRoomSettings({
      ...formState, ranges: { ...formState.ranges, "max-players": 6 },
    })
  })
  assert.equal(changedSave.ok, true, JSON.stringify(changedSave))
  assert.equal(changedSave.changed, true)

  const afterChange = rawStoredRoom(room.roomId)
  assert.equal(afterChange.settingsVersion, versionBefore + 1, "실제 변경이 버전을 올리지 않았다")
  assert.ok([...afterChange.players].every(([, p]) => p.isReady !== true), "실제 변경이 준비를 풀지 않았다")
  for (const [uuid, , revisionBefore] of readyBefore) {
    const seated = afterChange.players.get(uuid)
    assert.equal(seated.readyRevision, revisionBefore + 1, `${uuid}의 readyRevision이 오르지 않았다`)
  }
  assert.equal(
    clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).length, receiptsBefore + 1,
    "실제 변경 저장의 설정 사건이 방장 화면에 전달되지 않았다",
  )
  assert.equal(
    joinerSocket.countReceived(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED), joinerReceiptsBefore + 1,
    "실제 변경 저장의 설정 사건이 참가자에게 전달되지 않았다",
  )
  const delivered = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).at(-1)
  assertNoSpectatorKeys(delivered.payload, "실제로 전달된 설정 변경 사건")
  assert.equal(delivered.payload.settings.maxPlayers, 6)
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 6, "store가 최신값을 반영하지 않았다")
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "변경 저장 수신 뒤 store 설정")
})

test("F-23(SPLIT-2) · 저장 ACK가 유실되면 훅이 미확인으로 잠기고 같은 요청 식별자의 결과 조회로만 정착한다", async () => {
  const { room } = await setupCustomRoomWithReadyJoiner("host-ack", "guest-ack")
  seedContaminatedSettings(room.roomId)

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true)

  const formState = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType,
    settings: useMatchingStore.getState().settings,
  })
  assert.equal(formState.ok, true, formState.code)

  socketState.socket.dropAcksFor(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  let lost
  await act(async () => {
    lost = await result.current.saveRoomSettings({
      ...formState, ranges: { ...formState.ranges, "max-players": 6 },
    })
  })
  socketState.socket.restoreAcksFor(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  assert.equal(lost.ok, false, "유실된 ACK가 성공으로 처리됐다")
  assert.equal(lost.code, ROOM_SETTINGS_ERROR_CODES.UNKNOWN, "응답 유실이 '실패'로 단정됐다")
  assert.equal(result.current.hasPendingSettingsResult, true, "ACK 유실이 미확인으로 남지 않았다")
  assert.equal(result.current.settingsError?.code, ROOM_SETTINGS_ERROR_CODES.UNKNOWN)

  const committed = rawStoredRoom(room.roomId)
  assert.equal(committed.settings.maxPlayers, 6, "전제: 서버는 이미 커밋했어야 한다")
  assertNoSpectatorKeys(committed.settings, "ACK 유실 저장 뒤 서버 저장값")
  const versionAfterCommit = committed.settingsVersion
  const saveRequests = socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  assert.equal(saveRequests.length, 1, "ACK 유실이 자동 재저장을 만들었다")
  const lostRequestId = saveRequests[0].payload.requestId

  alerts.length = 0
  let blocked
  await act(async () => { blocked = await result.current.saveRoomSettings(formState) })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.code, ROOM_SETTINGS_ERROR_CODES.UNKNOWN)
  assert.deepEqual(alerts, [ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN])
  assert.equal(
    socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length, 1,
    "미확인 상태에서 새 저장 요청이 서버로 나갔다",
  )

  let verified
  await act(async () => { verified = await result.current.verifyRoomSettingsResult() })
  assert.equal(verified.ok, true, JSON.stringify(verified))
  assert.equal(verified.status, "APPLIED", "서버가 그 요청의 정착을 알려주지 않았다")
  assert.equal(verified.settingsVersion, versionAfterCommit)

  const lookups = socketState.socket.requestsOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT)
  assert.equal(lookups.length, 1, "결과 조회가 한 번 나가지 않았다")
  assert.deepEqual(lookups[0].payload, { roomId: room.roomId, requestId: lostRequestId },
    "결과 조회가 유실된 그 요청 식별자로 나가지 않았다")
  const lookupResponse = socketState.socket
    .responsesOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT).at(-1).response
  assertNoSpectatorKeys(lookupResponse, "결과 조회 응답")

  assert.equal(result.current.hasPendingSettingsResult, false, "정착한 뒤에도 미확인으로 남았다")
  assert.equal(
    socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length, 1,
    "결과 확인이 새 저장 요청을 만들었다",
  )
  const afterLookup = rawStoredRoom(room.roomId)
  assert.equal(afterLookup.settingsVersion, versionAfterCommit, "결과 확인이 저장을 다시 커밋했다")
  assert.equal(afterLookup.settings.maxPlayers, 6)
  let reopened
  await act(async () => {
    reopened = await result.current.saveRoomSettings({
      ...buildRoomSettingsFormState({
        accessType: useMatchingStore.getState().accessType,
        settings: useMatchingStore.getState().settings,
      }),
      ranges: { ...formState.ranges, "max-players": 7 },
    })
  })
  assert.equal(reopened.ok, true, JSON.stringify(reopened))
  assert.equal(rawStoredRoom(room.roomId).settings.maxPlayers, 7)
})

async function mountMatchingPage() {
  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/game-matching"] },
      React.createElement(GameMatchingPage)))
  })
  await waitFor(() => {
    assert.ok(view.container.querySelector("button[aria-label='방 설정 변경']"),
      "방장에게 설정 편집 진입이 열리지 않았다")
    assert.equal(useMatchingStore.getState().settingsVersion, 2, "최신 설정이 아직 도착하지 않았다")
  })
  return view
}

async function assertEditPanelShowsCleanSettings(container, where) {
  assert.equal(container.textContent.includes("관전"), false, `${where}: 편집 화면에 관전자 문구가 있다`)
  assert.equal(container.querySelector("[aria-label='관전자 허용']"), null,
    `${where}: 관전자 허용 체크박스가 남아 있다`)
  assert.equal(stepperValue(container, "최대 플레이어 수"), "8", `${where}: 정원이 서버값과 다르다`)
  const privateLobby = container.querySelector("button[role='checkbox'][aria-label='코드로만 참가']")
  assert.ok(privateLobby, `${where}: 코드로만 참가 항목이 사라졌다`)
  assert.equal(privateLobby.getAttribute("aria-checked"), "false")
  for (const hidden of ["불이 꺼진 무도회", "영혼의 베팅 활성화", "투표 공개 여부"]) {
    assert.equal(setupRow(container, hidden), null, `${where}: 편집 화면에 ${hidden}가 남아 있다`)
  }

  assert.deepEqual(
    roleCompositionRowLabels(container),
    ["광대 인원", "의사 인원", "경비원 인원", "마녀사냥꾼 인원"],
    `${where}: 역할 구성 행 목록이 정상 4역할과 다르다`,
  )
  assert.equal(stepperValue(container, "광대 인원"), "2명")
  assert.equal(stepperValue(container, "의사 인원"), "1명")
  assert.equal(stepperValue(container, "경비원 인원"), "0명")
  assert.equal(stepperValue(container, "마녀사냥꾼 인원"), "0명")

  await clickSetupTab(container, "회의&투표")
  assert.equal(container.textContent.includes("관전"), false,
    `${where}: 회의&투표 탭에 관전자 문구가 있다`)
  assert.equal(stepperValue(container, "낮 토론 시간 조절"), "60초")
  assert.equal(stepperValue(container, "낮 투표 시간 조절"), "60초")
  assert.equal(stepperValue(container, "밤 행동 시간 조절"), "90초")
  assert.equal(stepperValue(container, "광대 밤 시간 조절"), "30초", `${where}: 지정된 override가 사라졌다`)
  assert.equal(stepperValue(container, "의사 밤 시간 조절"), "90초", `${where}: 폴백이 전체 밤 시간과 다르다`)
  await clickSetupTab(container, "일반")
}

test("F-23(AC-01/AC-03) · 실제 대기방 화면의 설정 열기·저장·재열기 어디에도 관전자 항목이 없다", async () => {
  const { room, joinerSocket } = await setupCustomRoomWithReadyJoiner("host-page", "guest-page")
  seedContaminatedSettings(room.roomId)

  const { container } = await mountMatchingPage()

  assert.equal(container.textContent.includes("관전"), false, "대기방 화면에 관전 문구가 있다")
  assert.equal(container.querySelector("button[aria-label='설정 저장']"), null,
    "전제: 편집 패널은 아직 닫혀 있어야 한다")
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "조회 뒤 store 설정")

  await act(async () => { container.querySelector("button[aria-label='방 설정 변경']").click() })
  assert.ok(container.querySelector("button[aria-label='설정 저장']"), "설정 패널이 열리지 않았다")
  await assertEditPanelShowsCleanSettings(container, "처음 열기")

  const versionBefore = useMatchingStore.getState().settingsVersion
  const readyBefore = [...rawStoredRoom(room.roomId).players]
    .map(([uuid, player]) => [uuid, player.isReady, player.readyRevision])
  assert.ok(readyBefore.every(([, isReady]) => isReady === true), "전제: 전원이 준비 상태여야 한다")
  const receiptsBefore = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).length
  const joinerReceiptsBefore = joinerSocket.countReceived(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED)

  await act(async () => { container.querySelector("button[aria-label='설정 저장']").click() })
  assert.deepEqual(alerts, [], alerts.join(" / "))

  const sent = socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  assert.equal(sent.length, 1, "저장 클릭이 요청을 한 번 보내지 않았다")
  assertNoSpectatorKeys(sent[0].payload, "화면에서 보낸 저장 요청")
  assert.deepEqual(sent[0].payload.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(sent[0].payload.roleNightActionTimes, { JOKER: 30 })

  const stored = rawStoredRoom(room.roomId)
  assertNoSpectatorKeys(stored.settings, "화면 저장 뒤 서버 저장값")
  assert.equal(stored.settings.maxPlayers, 8)
  assert.deepEqual(stored.settings.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(stored.settings.roleNightActionTimes, { JOKER: 30 })
  assert.equal(stored.settingsVersion, versionBefore, "정제만으로 설정 버전이 올랐다")
  assert.deepEqual(
    [...stored.players].map(([uuid, player]) => [uuid, player.isReady, player.readyRevision]),
    readyBefore, "화면에서 연 동일값 저장이 준비 상태를 건드렸다",
  )
  assert.equal(clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).length, receiptsBefore,
    "동일값 저장이 설정 변경 사건을 방장 화면에 전달했다")
  assert.equal(joinerSocket.countReceived(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED), joinerReceiptsBefore,
    "동일값 저장이 설정 변경 사건을 참가자에게 전달했다")

  await waitFor(() => assert.equal(container.querySelector("button[aria-label='설정 저장']"), null,
    "저장 성공인데 편집 패널이 닫히지 않았다"))
  assert.equal(container.textContent.includes("관전"), false, "저장 뒤 대기방 화면에 관전 문구가 생겼다")

  await act(async () => { container.querySelector("button[aria-label='방 설정 변경']").click() })
  assert.ok(container.querySelector("button[aria-label='설정 저장']"), "설정 패널이 다시 열리지 않았다")
  await assertEditPanelShowsCleanSettings(container, "재열기")
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "재열기 시점의 store 설정")
})

test("F-23(SPLIT-2) · 연결이 교체되면 옛 소켓의 오염된 설정 사건은 화면에 닿지 않고 새 연결만 동작한다", async () => {
  const { io, serverSocket, joinerSocket, room, joinerUuid } =
    await setupCustomRoomWithReadyJoiner("host-swap", "guest-swap")
  const firstSocket = socketState.socket

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true, "방 검증이 끝나지 않았다")
  assert.ok(firstSocket.handlerCountOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED) > 0,
    "전제: 첫 연결에 설정 사건 구독이 붙어야 한다")

  const { serverSocket: nextServerSocket, clientSocket: secondSocket } =
    reconnectPair(io, "host-swap", serverSocket)
  await act(async () => {
    setTestSocket(secondSocket)
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(firstSocket.handlerCountOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED), 0,
    "옛 연결의 구독이 해제되지 않았다")
  assert.ok(secondSocket.handlerCountOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED) > 0,
    "새 연결에 구독이 붙지 않았다")

  const versionBefore = useMatchingStore.getState().settingsVersion

  await act(async () => {
    emitToClient(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: room.roomId,
      settingsVersion: 99,
      accessType: "open",
      settings: {
        ...useMatchingStore.getState().settings,
        maxPlayers: 4,
        allowSpectators: true,
        roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, SPECTATOR: 1 },
        roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 },
      },
      players: useMatchingStore.getState().players,
      hostUuid: "host-swap",
      canStart: false,
    }, firstSocket)
  })
  const oldReceipt = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, firstSocket).at(-1)
  assert.equal(oldReceipt.handlers, 0, "옛 연결에 아직 이 화면의 구독이 남아 있다")
  assert.equal(useMatchingStore.getState().settingsVersion, versionBefore,
    "옛 소켓 사건이 새 연결의 설정 버전을 바꿨다")
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 8, "옛 소켓 사건이 설정값을 바꿨다")
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "옛 소켓 사건을 받은 뒤의 store 설정")

  const beforeOnOldSocket = firstSocket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length
  const receiptsBefore = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, secondSocket).length
  seedContaminatedSettings(room.roomId)
  const currentForm = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType,
    settings: useMatchingStore.getState().settings,
  })
  assert.equal(currentForm.ok, true, currentForm.code)
  let saved
  await act(async () => {
    saved = await result.current.saveRoomSettings({
      ...currentForm,
      ranges: { ...currentForm.ranges, "max-players": 7 },
    })
  })
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(firstSocket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length, beforeOnOldSocket,
    "저장 요청이 옛 연결로 나갔다")
  assert.equal(secondSocket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length, 1)

  const delivered = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, secondSocket)
  assert.equal(delivered.length, receiptsBefore + 1, "새 연결이 실제 설정 방송을 받지 못했다")
  assert.ok(delivered.at(-1).handlers > 0, "새 연결의 구독이 그 방송을 처리하지 못했다")
  assertNoSpectatorKeys(delivered.at(-1).payload, "새 연결로 전달된 실제 설정 방송")
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 7, "새 연결의 방송이 store에 닿지 않았다")
  assert.equal(useMatchingStore.getState().settingsVersion, versionBefore + 1)
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "새 연결의 방송을 받은 뒤의 store 설정")
  assertNoSpectatorKeys(rawStoredRoom(room.roomId).settings, "새 연결로 보낸 저장 뒤 서버 저장값")
  assert.equal(rawStoredRoom(room.roomId).settings.maxPlayers, 7)
  const readyOnNewBefore = clientReceiptsOf(PLAYER_READY_CHANGED, secondSocket).length
  const readyOnOldBefore = clientReceiptsOf(PLAYER_READY_CHANGED, firstSocket).length
  let readyAck
  await act(async () => {
    readyAck = await new Promise((resolve) => handleSetReady(
      io, joinerSocket, joinerUuid,
      readyPayload(room, true, { settingsVersion: useMatchingStore.getState().settingsVersion }),
      resolve,
    ))
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(readyAck.ok, true, `상대 준비 전환 실패: ${readyAck.message}`)

  const readyReceipts = clientReceiptsOf(PLAYER_READY_CHANGED, secondSocket)
  assert.equal(readyReceipts.length, readyOnNewBefore + 1,
    "실제 서버 방송이 교체된 연결에 정확히 한 번 닿지 않았다")
  assert.ok(readyReceipts.at(-1).handlers > 0, "새 연결의 구독이 그 방송을 처리하지 못했다")
  assert.equal(readyReceipts.at(-1).payload.uuid, joinerUuid)
  assert.equal(clientReceiptsOf(PLAYER_READY_CHANGED, firstSocket).length, readyOnOldBefore,
    "옛 연결이 교체 후의 실제 방송을 함께 받았다")
  assert.equal(
    useMatchingStore.getState().players.find((player) => player.uuid === joinerUuid)?.isReady, true,
    "교체된 연결로 온 실제 방송이 store까지 닿지 않았다",
  )

  const strayBefore = clientReceiptsOf(PLAYER_READY_CHANGED, secondSocket).length
  serverSocket.emit(PLAYER_READY_CHANGED, { uuid: "guest-swap", isReady: false })
  assert.equal(clientReceiptsOf(PLAYER_READY_CHANGED, secondSocket).length, strayBefore,
    "옛 서버 소켓의 사건이 새 클라이언트 연결로 전달됐다")
  assert.equal(
    useMatchingStore.getState().players.find((player) => player.uuid === joinerUuid)?.isReady, true,
    "옛 서버 소켓의 사건이 새 연결의 store를 바꿨다",
  )
  assert.ok(nextServerSocket)
})

test("F-23(SPLIT-1) · 상대의 실제 준비 변경 방송이 방장 화면의 store까지 정확히 한 번 닿는다", async () => {
  const { io, joinerSocket, room, joinerUuid } =
    await setupCustomRoomWithReadyJoiner("host-ready", "guest-ready")

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true, "방 검증이 끝나지 않았다")

  const hostClient = socketState.socket
  assert.ok(hostClient.handlerCountOf(PLAYER_READY_CHANGED) > 0,
    "전제: 화면이 준비 변경 사건을 구독해야 한다")

  const readyStateOf = (uuid) =>
    useMatchingStore.getState().players.find((player) => player.uuid === uuid)?.isReady

  for (const nextIsReady of [false, true]) {
    const before = clientReceiptsOf(PLAYER_READY_CHANGED, hostClient).length
    let ack
    await act(async () => {
      ack = await new Promise((resolve) => handleSetReady(
        io, joinerSocket, joinerUuid,
        readyPayload(room, nextIsReady, { settingsVersion: useMatchingStore.getState().settingsVersion }),
        resolve,
      ))
      await Promise.resolve(); await Promise.resolve()
    })
    assert.equal(ack.ok, true, `${nextIsReady} 준비 전환 실패: ${ack.message}`)

    const receipts = clientReceiptsOf(PLAYER_READY_CHANGED, hostClient)
    assert.equal(receipts.length, before + 1,
      `실제 방송이 클라이언트 연결에 정확히 한 번 닿지 않았다(isReady=${nextIsReady})`)
    assert.ok(receipts.at(-1).handlers > 0, "도착한 방송을 처리할 구독이 없다")
    assert.equal(receipts.at(-1).payload.uuid, joinerUuid)
    assert.equal(readyStateOf(joinerUuid), nextIsReady,
      `store가 준비 상태를 반영하지 않았다(isReady=${nextIsReady})`)
  }
})
