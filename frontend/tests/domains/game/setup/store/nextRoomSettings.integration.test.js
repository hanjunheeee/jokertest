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
installDomGlobal("IntersectionObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const alerts = []
let confirmAnswer = false
function installWindowDialogs() {
  dom.window.alert = (message) => alerts.push(message)
  dom.window.confirm = () => confirmAnswer
}
installWindowDialogs()
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => confirmAnswer)

register(new URL("../../../../helpers/jsxNodeLoaderHooks.mjs", import.meta.url))

const socketState = { socket: null, subscribers: new Set(), clientReceived: [] }

function deepSnapshot(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

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
    dispatchSfxEvent: () => {}, dispatchUiSfx: () => {}, useSfxRuntime: () => {},
    getSfxMix: () => ({ gain: 0, muted: true }), subscribeSfxMix: () => () => {},
  },
})
mock.module("../../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
const rejectNetwork = async () => { throw new Error("이 시험에서 예기치 않은 HTTP 호출이 일어났다") }
mock.module("../../../../../src/shared/api/client.js", {
  namedExports: {
    api: { get: rejectNetwork, post: rejectNetwork, put: rejectNetwork, patch: rejectNetwork, delete: rejectNetwork },
    apiClient: rejectNetwork,
    refreshAccessToken: rejectNetwork,
  },
})

const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { MemoryRouter, Outlet, RouterProvider, createMemoryRouter, useNavigate } =
  await import("react-router-dom")
const { default: GameSetupPage } = await import("../../../../../src/domains/game/setup/pages/GameSetupPage.jsx")
const { default: GameResultPage } = await import("../../../../../src/domains/game/result/page/GameResultPage.jsx")
const { default: InGamePage } = await import("../../../../../src/domains/game/ingame/pages/InGamePage.jsx")
const { default: SettingPanelContent } =
  await import("../../../../../src/domains/game/ingame/components/controls/ingameSetting/SettingPanelContent.jsx")
const { useInGameStore } = await import("../../../../../src/domains/game/ingame/store/ingameStore.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { useMatchingRoom } = await import("../../../../../src/domains/game/matching/hooks/useMatchingRoom.js")
const { useGameSessionSocketEvents } =
  await import("../../../../../src/domains/game/ingame/hooks/useGameSessionSocketEvents.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { useNextRoomSettingsStore, nextRoomSettingsStorageKey } = await import("../../../../../src/domains/game/setup/store/nextRoomSettingsStore.js")
const { SOCKET_EVENTS } = await import("../../../../../src/domains/game/setup/constants/gameSetupSocket.js")

const { default: matchmaking } = await import("../../../../../../backend/socket/matchmaking.js")
const { default: gameSessionCore } = await import("../../../../../../backend/game-core/gameSession.js")
const { default: gameSessionSocketLayer } = await import("../../../../../../backend/socket/gameSession.js")
const { default: gameResultRepository } =
  await import("../../../../../../backend/repositories/game/result.js")
const { default: matchmakingFixtures } =
  await import("../../../../../../backend/tests/helpers/matchmakingFixtures.js")

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `user-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
  getPublicProfileLoadouts: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
  getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {}])),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const persistedGameResults = []
gameResultRepository.persistGameResultRecord = async (record) => {
  persistedGameResults.push(deepSnapshot(record))
  return { ok: true }
}
gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests(async () => ({ ok: true }))
gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async () => {})

const { createFakeSocket, createFakeIo, validSettingsPayload, readyPayload, startPayload } = matchmakingFixtures

function findSpectatorKeys(value, path = "$") {
  if (value === null || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap((item, i) => findSpectatorKeys(item, `${path}[${i}]`))
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
  assert.deepEqual(found, [], `${where}에 폐기된 키가 남아 있다: ${found.join(", ")}`)
}

function collectKeys(value) {
  if (value === null || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(collectKeys)
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectKeys(child)])
}

function readStoredRecord(accountId) {
  const raw = dom.window.localStorage.getItem(nextRoomSettingsStorageKey(accountId))
  return raw === null ? null : JSON.parse(raw)
}

function createConnection(io, uuid) {
  const serverSocket = createFakeSocket(uuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  matchmaking.registerMatchmakingHandlers(io, serverSocket, uuid)
  gameSessionSocketLayer.registerGameHandlers(io, serverSocket, uuid)

  const listeners = new Map()
  const requests = []
  const socketId = `client-${serverSocket.id}`
  const clientSocket = {
    connected: true,
    id: socketId,
    socketId,
    listeners,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    emit(event, payload, ack) {
      requests.push({ event, payload: deepSnapshot(payload) })
      assert.ok(
        serverSocket.listenerCount(event) > 0,
        `등록부가 ${event} 리스너를 만들지 않았다 — 실제 클라이언트도 이 요청을 보낼 수 없다`,
      )
      serverSocket.trigger(event, payload, ack)
    },
    timeout() { return clientSocket },
    emitWithAck(event, payload) {
      requests.push({ event, payload: deepSnapshot(payload) })
      return new Promise((resolve, reject) => {
        if (serverSocket.listenerCount(event) === 0) {
          reject(new Error(`등록부가 ${event} 리스너를 만들지 않았다`))
          return
        }
        serverSocket.trigger(event, payload, resolve)
      })
    },
    requestsOf: (event) => requests.filter((entry) => entry.event === event),
  }

  const originalEmit = serverSocket.emit.bind(serverSocket)
  serverSocket.emit = (event, payload) => {
    originalEmit(event, payload)
    const handlers = [...(listeners.get(event) ?? [])]
    socketState.clientReceived.push({ event, socketId, payload: deepSnapshot(payload) })
    for (const handler of handlers) handler(payload)
  }

  return { uuid, serverSocket, clientSocket }
}

function clientReceiptsOf(event, connection) {
  return socketState.clientReceived.filter(
    (entry) => entry.event === event && entry.socketId === connection.clientSocket.socketId,
  )
}

function createConventionFollowingRegistry() {
  const overrides = new Map()
  return new Proxy(overrides, {
    get(target, prop, receiver) {
      if (prop === "get") return (uuid) => (target.has(uuid) ? target.get(uuid) : `sock-${uuid}`)
      return Reflect.get(target, prop, receiver)
    },
  })
}

function liveSession(uuid) {
  const target = gameSessionCore.getDisconnectGraceTarget(uuid)
  assert.ok(target, `살아 있는 세션을 찾지 못했다: ${uuid}`)
  return target.session
}

async function ack(connection, event, payload) {
  let response
  await act(async () => { response = await connection.clientSocket.emitWithAck(event, payload) })
  return response
}

async function createAndStartRealRoom(host, joiners) {
  const created = await ack(host, SOCKET_EVENTS.CREATE_ROOM, validSettingsPayload({
    accessType: "code",
    maxPlayers: 6,
    jokerCount: 1,
    roleCompositionMode: "custom",
    roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    dayDiscussionTime: 120,
    dayVoteTime: 30,
    nightActionTime: 60,
  }))
  assert.equal(created.ok, true, JSON.stringify(created))

  const updated = await ack(host, SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, {
    roomId: created.room.roomId,
    requestId: "f24-partial-override",
    expectedSettingsVersion: created.room.settingsVersion,
    accessType: "code",
    maxPlayers: 6,
    jokerCount: 1,
    roleCompositionMode: "custom",
    roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    dayDiscussionTime: 120,
    dayVoteTime: 30,
    nightActionTime: 60,
    roleNightActionTimes: { DOCTOR: 120 },
  })
  assert.equal(updated.ok, true, JSON.stringify(updated))

  for (const joiner of joiners) {
    joiner.clientSocket.emit("join_room_by_code", { roomCode: created.room.roomCode })
    await new Promise((resolve) => setImmediate(resolve))
  }

  const room = { roomId: created.room.roomId, settingsVersion: updated.settingsVersion }
  for (const connection of [host, ...joiners]) {
    const readied = await ack(connection, "set_ready", readyPayload(room))
    assert.equal(readied.ok, true, JSON.stringify(readied))
  }
  return { created, room }
}

async function playToCitizenVictory(connections) {
  const session = liveSession(connections[0].uuid)
  const gameId = session.id
  const jokerUuid = [...session.players.values()].find((player) => player.role === "JOKER")?.uuid
  assert.ok(jokerUuid, "광대가 배정되지 않았다")

  for (const connection of connections) {
    const acked = await ack(connection, "acknowledge_role_reveal", { gameId })
    assert.equal(acked.ok, true, JSON.stringify(acked))
  }
  assert.equal(liveSession(connections[0].uuid).phase, "DAY", "역할 확인 뒤 낮으로 넘어가지 않았다")

  for (const connection of connections) {
    const ready = await ack(connection, "ready_for_day_vote", { gameId })
    assert.equal(ready.ok, true, JSON.stringify(ready))
  }

  const dayIndex = liveSession(connections[0].uuid).dayIndex
  for (const connection of connections) {
    const targetId = connection.uuid === jokerUuid ? null : jokerUuid
    const voted = await ack(connection, "cast_day_vote", { gameId, targetId })
    assert.equal(voted.ok, true, JSON.stringify(voted))
  }
  const dayResolved = await ack(connections[0], "resolve_day_vote", { gameId, dayIndex })
  assert.equal(dayResolved.ok, true, JSON.stringify(dayResolved))
  assert.equal(liveSession(connections[0].uuid).phase, "TRIBUNAL", "재판으로 넘어가지 않았다")

  for (const connection of connections.filter((entry) => entry.uuid !== jokerUuid)) {
    const cast = await ack(connection, "cast_tribunal_vote", { gameId, dayIndex, vote: "GUILTY" })
    assert.equal(cast.ok, true, JSON.stringify(cast))
  }
  const tribunalResolved = await ack(connections[0], "resolve_tribunal_vote", { gameId, dayIndex })
  assert.equal(tribunalResolved.ok, true, JSON.stringify(tribunalResolved))

  return { gameId, jokerUuid }
}

async function mountRoomTab() {
  let view
  await act(async () => {
    view = render(React.createElement(SettingPanelContent, { onOpenKickPlayer: () => {} }))
  })
  const roomTab = [...view.container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "방관리")
  assert.ok(roomTab, "방장인데 방관리 탭이 없다")
  await act(async () => { roomTab.click() })
  return view
}

async function openMeetingTab(container) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "회의&투표")
  assert.ok(button, "회의&투표 탭 버튼이 없다")
  await act(async () => { button.click() })
}

function SessionEventsLayout() {
  useGameSessionSocketEvents()
  return React.createElement(Outlet)
}

function MatchingRoomRoute() {
  const navigate = useNavigate()
  const onGameStarted = React.useCallback(() => { navigate("/ingame") }, [navigate])
  const onRoomDeleted = React.useCallback(() => {}, [])
  useMatchingRoom({ onRoomDeleted, onGameStarted })
  return React.createElement("div", null, "matching")
}

const userNavigations = []

async function navigateAsUser(router, path) {
  userNavigations.push(path)
  await act(async () => { await router.navigate(path) })
}

function createAppRouter() {
  return createMemoryRouter(
    [
      {
        element: React.createElement(SessionEventsLayout),
        children: [
          { path: "/game-matching", element: React.createElement(MatchingRoomRoute) },
          { path: "/ingame", element: React.createElement(InGamePage) },
          { path: "/gameresult", element: React.createElement(GameResultPage) },
          { path: "/game-setup", element: React.createElement(GameSetupPage) },
          { path: "/multiplay", element: React.createElement("div", null, "lobby") },
        ],
      },
    ],
    { initialEntries: ["/game-matching"] },
  )
}

async function mountApp(connection) {
  setTestSocket(connection.clientSocket)
  const router = createAppRouter()
  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })
  return { router, view }
}

async function dismissParchmentOverlays(container) {
  for (let i = 0; i < 5; i += 1) {
    const confirmButton = [...container.querySelectorAll("button")]
      .find((node) => node.textContent.trim() === "확인")
    if (!confirmButton) return
    await act(async () => { confirmButton.click() })
  }
}

async function startGameFromMatchingRoom({ host, created, router, view }) {
  const started = await ack(host, "start_game", startPayload({
    roomId: created.room.roomId,
    settingsVersion: liveSettingsVersion(created.room.roomId),
  }))
  assert.equal(started.ok, true, JSON.stringify(started))
  assert.equal(clientReceiptsOf("game_started", host).length, 1, "호스트가 실제 game_started를 받지 못했다")
  await waitFor(() => {
    assert.equal(router.state.location.pathname, "/ingame", "시작 방송이 인게임 화면으로 옮기지 못했다")
  })
  await dismissParchmentOverlays(view.container)
  return started
}

async function enterResultScreen({ router, view }) {
  if (router.state.location.pathname === "/ingame") {
    await dismissParchmentOverlays(view.container)
    await waitFor(() => {
      assert.equal(
        router.state.location.pathname, "/gameresult",
        "생산 훅(InGamePage → useInGameResultNavigation)이 결과 화면으로 옮기지 않았다",
      )
    })
  } else {
    assert.equal(
      router.state.location.pathname, "/gameresult",
      "종료가 반영됐는데 결과 화면이 아니다",
    )
  }
  assert.equal(
    userNavigations.includes("/gameresult"), false,
    "시험이 결과 경로로 직접 이동했다 — 그러면 실제 진입 연결을 우회한다",
  )

  const intro = view.container.querySelector("video")
  assert.ok(intro, "결과 연출 영상이 없다")
  await act(async () => { intro.dispatchEvent(new dom.window.Event("ended")) })
}

async function leaveFromResultScreen({ router, view, connection }) {
  confirmAnswer = true
  const lobbyButton = [...view.container.querySelectorAll("button")]
    .find((node) => node.textContent.includes("로비로"))
  assert.ok(lobbyButton, "결과 화면에 로비 버튼이 없다")
  await act(async () => { lobbyButton.click() })
  await waitFor(() => {
    assert.equal(useInGameStore.getState().gameId, null, "실제 이탈 뒤에도 인게임 세션이 남아 있다")
  })
  assert.ok(
    connection.clientSocket.requestsOf("leave_game_session").length >= 1,
    "결과 화면의 로비 버튼이 실제 이탈 요청을 보내지 않았다",
  )
  await waitFor(() => {
    assert.equal(router.state.location.pathname, "/multiplay", "이탈이 로비로 옮기지 않았다")
  })
  confirmAnswer = false
}

async function goToCreationPage({ router, view }) {
  await navigateAsUser(router, "/game-setup")
  await waitFor(() => {
    const button = view.container.querySelector("button[aria-label='게임 만들기']")
    assert.ok(button && button.disabled === false, "게임 만들기 버튼이 아직 활성화되지 않았다")
  })
}

async function mountCreationPage(connection) {
  setTestSocket(connection.clientSocket)
  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/game-setup"] },
      React.createElement(GameSetupPage)))
  })
  await waitFor(() => {
    const button = view.container.querySelector("button[aria-label='게임 만들기']")
    assert.ok(button && button.disabled === false, "게임 만들기 버튼이 아직 활성화되지 않았다")
  })
  return { view }
}

function stepperValue(container, label) {
  const row = [...container.querySelectorAll("[data-setup-row]")]
    .find((node) => node.querySelector("p")?.textContent.trim() === label)
  assert.ok(row, `${label} 행이 화면에 없다`)
  const values = [...row.querySelectorAll("span")]
    .map((node) => node.textContent.trim()).filter(Boolean)
  assert.equal(values.length, 1, `${label} 행에서 값을 하나로 읽지 못했다: ${values.join(" / ")}`)
  return values[0]
}

function loginAs(uuid) {
  act(() => { useAuthStore.getState().login({ uuid, nickname: `user-${uuid}` }) })
}
function logout() {
  act(() => { useAuthStore.getState().logout() })
}

function createWorld() {
  const io = createFakeIo([])
  gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry())
  return io
}

test.beforeEach(() => {
  dom.window.localStorage.clear()
  installWindowDialogs()
  confirmAnswer = false
  useNextRoomSettingsStore.getState().__resetForTests()
  useInGameStore.getState().clearGame()
  useMatchingStore.getState().clearRoom()
  socketState.clientReceived = []
  persistedGameResults.length = 0
  alerts.length = 0
  userNavigations.length = 0
})

test.afterEach(() => {
  cleanup()
  setTestSocket(null)
  matchmaking.__resetStateForTests()
  gameSessionCore.__resetStateForTests()
  gameSessionSocketLayer.__resetStateForTests()
})

test("F-24(AC-04) · 실제 시작 방송 → 유지 체크 → 정상 종료 → 결과 화면 이탈 → 다음 방 생성까지 승인된 설정값이 그대로 간다", async () => {
  const hostUuid = "f24-host-a"
  loginAs(hostUuid)

  const io = createWorld()
  const host = createConnection(io, hostUuid)
  const joiners = [1, 2, 3].map((n) => createConnection(io, `f24-join-a-${n}`))
  setTestSocket(host.clientSocket)

  const { created } = await createAndStartRealRoom(host, joiners)
  act(() => { useMatchingStore.getState().setRoom(created.room) })

  const { router, view: app } = await mountApp(host)

  await startGameFromMatchingRoom({ host, created, router, view: app })

  await waitFor(() => {
    const source = useInGameStore.getState().state?.roomSettingsSource
    assert.ok(source, "실제 구독 경로로 복원 원본이 store에 들어오지 않았다")
  })
  const inStore = useInGameStore.getState().state.roomSettingsSource
  assert.equal(inStore.accessType, "code")
  assert.deepEqual(inStore.settings.roleNightActionTimes, { DOCTOR: 120 })

  const roomTab = await mountRoomTab()
  const container = roomTab.container
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  assert.ok(keepBox, "유지 체크박스가 없다")
  await act(async () => { keepBox.click() })

  const record = readStoredRecord(hostUuid)
  assert.ok(record, "유지를 켰는데 저장 레코드가 없다")
  assert.equal(record.accountId, hostUuid)
  assert.equal(record.enabled, true)
  assert.equal(record.source.settings.maxPlayers, 6)
  assert.equal(record.source.settings.dayDiscussionTime, 120)
  assert.equal(record.source.settings.dayVoteTime, 30)
  assert.equal(record.source.settings.nightActionTime, 60)
  assert.deepEqual(record.source.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
  assert.deepEqual(record.source.settings.roleNightActionTimes, { DOCTOR: 120 })
  const recordKeys = collectKeys(record)
  for (const forbidden of ["roomId", "gameId", "code", "roomCode", "players", "membershipId", "hostUuid", "isReady"]) {
    assert.equal(recordKeys.includes(forbidden), false, `복원 레코드에 ${forbidden} 키가 들어 있다`)
  }

  const { gameId } = await playToCitizenVictory([host, ...joiners])
  assert.equal(
    clientReceiptsOf("tribunal_vote_resolved", host).length, 1,
    "호스트가 실제 종결 방송을 받지 못했다",
  )
  await waitFor(() => {
    assert.equal(useInGameStore.getState().state?.phase, "ENDED", "실제 방송이 store를 종료로 옮기지 않았다")
    assert.ok(useInGameStore.getState().state?.winResult, "승패 결과가 store에 없다")
  })
  assert.equal(persistedGameResults.length, 1, "정상 종료의 전적 저장이 실제로 시작되지 않았다")

  await enterResultScreen({ router, view: app })

  await leaveFromResultScreen({ router, view: app, connection: host })
  assert.equal(
    host.clientSocket.requestsOf("leave_game_session").length, 1,
    "이탈 요청이 정확히 한 번이 아니다",
  )
  assert.equal(gameSessionCore.getRoomCodeSessionState({ roomCode: created.room.roomCode })?.gameId, gameId)
  roomTab.unmount()

  const view = app
  await goToCreationPage({ router, view })
  assert.equal(stepperValue(view.container, "최대 플레이어 수"), "6", "정원이 복원되지 않았다")
  await openMeetingTab(view.container)
  assert.equal(stepperValue(view.container, "낮 토론 시간 조절"), "120초")
  assert.equal(stepperValue(view.container, "낮 투표 시간 조절"), "30초")
  assert.equal(stepperValue(view.container, "밤 행동 시간 조절"), "60초")
  assert.equal(stepperValue(view.container, "의사 밤 시간 조절"), "120초", "지정된 override가 사라졌다")
  assert.equal(stepperValue(view.container, "광대 밤 시간 조절"), "60초", "미지정 직업이 전체 밤 시간을 따라가지 않았다")

  await act(async () => { view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 2))
  const request = host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[1].payload

  assert.equal(request.accessType, "code")
  assert.equal(request.maxPlayers, 6)
  assert.equal(request.dayDiscussionTime, 120)
  assert.equal(request.dayVoteTime, 30)
  assert.equal(request.nightActionTime, 60)
  assert.deepEqual(request.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
  assert.deepEqual(request.roleNightActionTimes, { DOCTOR: 120 })

  const rooms = new Map(matchmaking.__getStateSnapshotForTests().gameRooms)
  assert.equal(rooms.size, 1, "서버에 방이 하나가 아니다")
  const newRoom = [...rooms.values()][0]
  assert.equal(newRoom.settings.maxPlayers, 6)
  assert.deepEqual(newRoom.settings.roleNightActionTimes, { DOCTOR: 120 })
  const newRoomPlayers = [...newRoom.players].map((entry) => (Array.isArray(entry) ? entry[1] : entry))
  assert.deepEqual(newRoomPlayers.map((player) => player.uuid), [hostUuid])
  assert.equal(newRoomPlayers[0].isReady, false)
  assert.notEqual(newRoom.code, created.room.roomCode, "이전 방의 코드가 그대로 재사용됐다")
})

function liveSettingsVersion(roomId) {
  const rooms = new Map(matchmaking.__getStateSnapshotForTests().gameRooms)
  const room = rooms.get(roomId)
  assert.ok(room, `서버에 그 방이 없다: ${roomId}`)
  return room.settingsVersion
}

test("F-24(AC-04) · 원본이 도착하지 않았거나 이 판의 참가자가 아니면 유지를 켤 수 없다", async () => {
  const hostUuid = "f24-host-await"
  loginAs(hostUuid)
  act(() => {
    useInGameStore.setState({
      gameId: "game-await",
      hostUuid,
      state: { id: "game-await", hostUuid, players: [{ uuid: hostUuid }], self: { uuid: hostUuid } },
    })
  })

  const { container } = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  await act(async () => { keepBox.click() })

  assert.equal(readStoredRecord(hostUuid), null, "원본 없이 저장이 일어났다")
  assert.match(container.textContent, /불러오는 중/, "대기 상태 안내가 없다")
})

test("F-24(AC-05) · 유지를 끄면 영속 레코드가 사라지고 다음 방 생성은 기본값으로 간다", async () => {
  const hostUuid = "f24-host-b"
  loginAs(hostUuid)

  const io = createWorld()
  const host = createConnection(io, hostUuid)
  const joiners = [1, 2, 3].map((n) => createConnection(io, `f24-join-b-${n}`))
  setTestSocket(host.clientSocket)

  const { created } = await createAndStartRealRoom(host, joiners)
  act(() => { useMatchingStore.getState().setRoom(created.room) })
  const { router, view } = await mountApp(host)
  await startGameFromMatchingRoom({ host, created, router, view })
  await waitFor(() => assert.ok(useInGameStore.getState().state?.roomSettingsSource))

  const roomTab = await mountRoomTab()
  const keepBox = roomTab.container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  await act(async () => { keepBox.click() })
  assert.ok(readStoredRecord(hostUuid), "먼저 켜지지 않았다")

  await act(async () => { keepBox.click() })
  assert.equal(readStoredRecord(hostUuid), null, "해제했는데 레코드가 남았다")

  await playToCitizenVictory([host, ...joiners])
  await waitFor(() => assert.equal(useInGameStore.getState().state?.phase, "ENDED"))
  await enterResultScreen({ router, view })
  await leaveFromResultScreen({ router, view, connection: host })
  roomTab.unmount()

  await goToCreationPage({ router, view })
  await act(async () => { view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 2))
  const request = host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[1].payload

  assert.equal(request.maxPlayers, 10)
  assert.equal(request.jokerCount, 2)
  assert.equal(request.dayDiscussionTime, 60)
  assert.equal(request.dayVoteTime, 60)
  assert.equal(request.nightActionTime, 90)
  assert.deepEqual(request.roleNightActionTimes, { JOKER: 90, DOCTOR: 90, GUARD: 90, WITCH_HUNTER: 90 })
})

test("F-24(AC-05) · 비활성 레코드는 복원 원본으로 쓰이지 않고 source도 남기지 않는다", async () => {
  const hostUuid = "f24-host-disabled"
  loginAs(hostUuid)
  dom.window.localStorage.setItem(nextRoomSettingsStorageKey(hostUuid), JSON.stringify({
    schemaVersion: 1,
    accountId: hostUuid,
    enabled: false,
    source: { accessType: "code", settingsVersion: 9, settings: { maxPlayers: 6 } },
  }))

  const read = useNextRoomSettingsStore.getState().readRestoreSource(hostUuid)
  assert.equal(read.code, "DISABLED")
  assert.equal(read.source, null, "비활성 레코드에서 원본을 꺼냈다")
})

test("F-24(AC-05) · 삭제도 비활성 쓰기도 실패하면 해제 의도가 남은 레코드보다 우선한다", () => {
  const hostUuid = "f24-host-clearfail"
  loginAs(hostUuid)
  const store = useNextRoomSettingsStore.getState()
  store.setAccount(hostUuid)

  const source = {
    accessType: "code",
    settingsVersion: 3,
    settings: {
      maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 120, dayVoteTime: 30, nightActionTime: 60,
      roleCompositionMode: "custom", roleCounts: { JOKER: 1 }, roleNightActionTimes: { DOCTOR: 120 },
    },
  }
  assert.equal(useNextRoomSettingsStore.getState().keepSettings({ accountId: hostUuid, source }).ok, true)
  assert.ok(readStoredRecord(hostUuid), "전제: 먼저 저장돼 있어야 한다")

  const realStorage = dom.window.localStorage
  installDomGlobal("localStorage", {
    getItem: (key) => realStorage.getItem(key),
    setItem: () => { throw new Error("setItem 실패(시험 주입)") },
    removeItem: () => { throw new Error("removeItem 실패(시험 주입)") },
  })
  try {
    const cleared = useNextRoomSettingsStore.getState().clearSettings({ accountId: hostUuid })
    assert.equal(cleared.ok, false, "저장이 모두 실패했는데 해제 성공으로 표시했다")
    assert.equal(cleared.status, "CLEAR_FAILED")
    assert.ok(readStoredRecord(hostUuid)?.source, "전제: 삭제가 실패해 레코드가 남아 있어야 한다")

    const read = useNextRoomSettingsStore.getState().readRestoreSource(hostUuid)
    assert.equal(read.source, null, "해제했는데 남은 레코드에서 과거 설정을 복원했다")
    assert.equal(read.code, "DISABLED_PERSIST_FAILED", "해제 실패 사실이 코드로 드러나지 않았다")
  } finally {
    installDomGlobal("localStorage", realStorage)
  }

  const afterRecovery = useNextRoomSettingsStore.getState().readRestoreSource(hostUuid)
  assert.equal(afterRecovery.code, "DISABLED")
  assert.equal(readStoredRecord(hostUuid), null, "매체가 돌아왔는데 옛 레코드가 남아 있다")
})

test("F-24(AC-05) · 서버 원본이 없어도 유지 **해제**는 할 수 있다", async () => {
  const hostUuid = "f24-host-disable-nosource"
  loginAs(hostUuid)

  const store = useNextRoomSettingsStore.getState()
  store.setAccount(hostUuid)
  assert.equal(useNextRoomSettingsStore.getState().keepSettings({
    accountId: hostUuid,
    source: {
      accessType: "open",
      settingsVersion: 1,
      settings: {
        maxPlayers: 8, jokerCount: 2, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
      },
    },
  }).ok, true)

  act(() => {
    useInGameStore.setState({
      gameId: "game-nosource",
      hostUuid,
      state: { id: "game-nosource", hostUuid, players: [{ uuid: hostUuid }], self: { uuid: hostUuid } },
    })
  })

  const { container } = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  assert.equal(keepBox.getAttribute("aria-checked"), "true", "전제: 이전 판의 유지가 켜져 있어야 한다")
  await act(async () => { keepBox.click() })

  assert.equal(readStoredRecord(hostUuid), null, "원본이 없다는 이유로 해제가 막혔다")
  assert.equal(useNextRoomSettingsStore.getState().enabled, false)
})

test("RESTORE-24 · 실제로 생산한 레코드를 오염시켜도 저장 매체·폼·생성 요청·새 서버 방 어디에도 남지 않는다", async () => {
  const hostUuid = "f24-host-c"
  loginAs(hostUuid)

  const io = createWorld()
  const host = createConnection(io, hostUuid)
  const joiners = [1, 2, 3].map((n) => createConnection(io, `f24-join-c-${n}`))
  setTestSocket(host.clientSocket)

  const { created } = await createAndStartRealRoom(host, joiners)
  act(() => { useMatchingStore.getState().setRoom(created.room) })
  const { router, view } = await mountApp(host)
  await startGameFromMatchingRoom({ host, created, router, view })
  await waitFor(() => assert.ok(useInGameStore.getState().state?.roomSettingsSource))

  assertNoSpectatorKeys(useInGameStore.getState().state.roomSettingsSource, "store에 들어온 복원 원본")

  const roomTab = await mountRoomTab()
  await act(async () => {
    roomTab.container.querySelector("[aria-label='다음 게임 동일 설정 유지']").click()
  })

  const produced = readStoredRecord(hostUuid)
  assert.ok(produced?.source?.settings, "실제 생산 경로로 레코드가 만들어지지 않았다")
  assertNoSpectatorKeys(produced, "실제 생산된 영속 레코드")

  const contaminated = JSON.parse(JSON.stringify(produced))
  contaminated.spectatorMode = "open"
  contaminated.source.spectatorSeats = 3
  contaminated.source.settings.allowSpectators = true
  contaminated.source.settings["allow-spectators"] = true
  contaminated.source.settings.roleCounts.SPECTATOR = 3
  contaminated.source.settings.roleNightActionTimes.SPECTATOR = 45
  contaminated.source.settings.lightsOut = { allowSpectators: true }
  dom.window.localStorage.setItem(nextRoomSettingsStorageKey(hostUuid), JSON.stringify(contaminated))
  assert.notDeepEqual(findSpectatorKeys(readStoredRecord(hostUuid)), [], "오염 자체가 실패했다")

  await playToCitizenVictory([host, ...joiners])
  await waitFor(() => assert.equal(useInGameStore.getState().state?.phase, "ENDED"))
  await enterResultScreen({ router, view })
  await leaveFromResultScreen({ router, view, connection: host })
  roomTab.unmount()

  await goToCreationPage({ router, view })
  assertNoSpectatorKeys(readStoredRecord(hostUuid), "정제 재저장 뒤의 저장 매체")

  const cleaned = readStoredRecord(hostUuid)
  assert.ok(cleaned?.source?.settings, `정제 재저장 뒤 레코드가 비정상이다: ${JSON.stringify(cleaned)}`)
  assert.deepEqual(cleaned.source.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
  assert.deepEqual(cleaned.source.settings.roleNightActionTimes, { DOCTOR: 120 })
  assert.equal(cleaned.source.settings.maxPlayers, 6)

  assert.equal(/spectator|관전/i.test(view.container.textContent), false, "생성 화면에 폐기 항목이 그려졌다")
  await act(async () => { view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 2))

  const request = host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[1].payload
  assertNoSpectatorKeys(request, "실제 create_room 요청")
  assert.deepEqual(request.roleNightActionTimes, { DOCTOR: 120 }, "정제가 정상 override까지 지웠다")

  const rooms = new Map(matchmaking.__getStateSnapshotForTests().gameRooms)
  assertNoSpectatorKeys([...rooms.values()][0].settings, "서버가 저장한 새 방 설정")
})

test("RESTORE-24 · 허용된 설정 키의 값 안에 숨긴 오염도 통과하지 못한다", () => {
  const hostUuid = "f24-host-nested"
  loginAs(hostUuid)
  dom.window.localStorage.setItem(nextRoomSettingsStorageKey(hostUuid), JSON.stringify({
    schemaVersion: 1,
    accountId: hostUuid,
    enabled: true,
    spectatorMode: "open",
    source: {
      accessType: "open",
      settingsVersion: 2,
      spectatorSeats: 2,
      settings: {
        maxPlayers: 8, jokerCount: 2, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
        voteReveal: { allowSpectators: true },
        roleCounts: { JOKER: 2, SPECTATOR: 1 },
        roleNightActionTimes: { DOCTOR: 90, SPECTATOR: 30 },
      },
    },
  }))

  const read = useNextRoomSettingsStore.getState().readRestoreSource(hostUuid)
  assert.equal(read.code, "RESTORED", JSON.stringify(read))
  assertNoSpectatorKeys(read.source, "복원된 원본")
  assertNoSpectatorKeys(readStoredRecord(hostUuid), "정제 재저장 뒤의 저장 매체")
  assert.equal(Object.hasOwn(read.source.settings, "voteReveal"), false)
  assert.deepEqual(read.source.settings.roleCounts, { JOKER: 2 })
  assert.deepEqual(read.source.settings.roleNightActionTimes, { DOCTOR: 90 })
  assert.equal(read.source.settings.maxPlayers, 8)
})

test("RESTORE-24 · 계정 간 복원값이 섞이지 않는다(A 저장 → B 기본값 → A 복귀)", async () => {
  const accountA = "f24-acct-a"
  const accountB = "f24-acct-b"

  loginAs(accountA)
  const io = createWorld()
  const hostA = createConnection(io, accountA)
  const joiners = [1, 2, 3].map((n) => createConnection(io, `f24-acct-a-join-${n}`))
  setTestSocket(hostA.clientSocket)

  const { created } = await createAndStartRealRoom(hostA, joiners)
  act(() => { useMatchingStore.getState().setRoom(created.room) })
  const { router, view } = await mountApp(hostA)
  await startGameFromMatchingRoom({ host: hostA, created, router, view })
  await waitFor(() => assert.ok(useInGameStore.getState().state?.roomSettingsSource))

  const roomTab = await mountRoomTab()
  await act(async () => {
    roomTab.container.querySelector("[aria-label='다음 게임 동일 설정 유지']").click()
  })
  assert.ok(readStoredRecord(accountA), "A의 레코드가 저장되지 않았다")

  await playToCitizenVictory([hostA, ...joiners])
  await waitFor(() => assert.equal(useInGameStore.getState().state?.phase, "ENDED"))
  await enterResultScreen({ router, view })
  await leaveFromResultScreen({ router, view, connection: hostA })
  cleanup()

  logout()
  loginAs(accountB)
  const hostB = createConnection(io, accountB)
  const b = await mountCreationPage(hostB)
  assert.equal(stepperValue(b.view.container, "최대 플레이어 수"), "10", "B에게 A의 정원이 보인다")
  assert.ok(readStoredRecord(accountA), "B 로그인이 A의 저장값을 지웠다")
  assert.equal(readStoredRecord(accountB), null, "B의 키가 임의로 만들어졌다")
  await act(async () => { b.view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(hostB.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 1))
  assert.equal(hostB.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[0].payload.maxPlayers, 10)
  cleanup()

  logout()
  loginAs(accountA)
  const a = await mountCreationPage(hostA)
  assert.equal(stepperValue(a.view.container, "최대 플레이어 수"), "6", "A로 돌아왔는데 값이 복원되지 않았다")
})

test("RESTORE-24 · 키의 계정과 레코드의 계정이 다르면 복원하지 않는다", () => {
  const accountA = "f24-acct-mismatch-a"
  const accountB = "f24-acct-mismatch-b"
  dom.window.localStorage.setItem(nextRoomSettingsStorageKey(accountB), JSON.stringify({
    schemaVersion: 1,
    accountId: accountA,
    enabled: true,
    source: { accessType: "code", settingsVersion: 1, settings: { maxPlayers: 6, jokerCount: 1 } },
  }))

  const read = useNextRoomSettingsStore.getState().readRestoreSource(accountB)
  assert.equal(read.code, "CORRUPTED")
  assert.equal(read.source, null)
})

test("RESTORE-24 · 손상된 레코드는 조용히 기본값으로 바뀌지 않고 실패를 알린다", async () => {
  const hostUuid = "f24-host-corrupt"
  loginAs(hostUuid)
  dom.window.localStorage.setItem(nextRoomSettingsStorageKey(hostUuid), "{not json")

  const io = createWorld()
  const host = createConnection(io, hostUuid)
  const { view } = await mountCreationPage(host)
  assert.match(
    view.container.textContent, /불러오지 못해 기본값/,
    "손상된 레코드가 아무 안내 없이 기본값으로 바뀌었다",
  )
})
