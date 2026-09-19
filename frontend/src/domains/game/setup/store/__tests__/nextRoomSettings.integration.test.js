/**
 * F-24 (AC-04 / AC-05 / RESTORE-24) — "다음 게임 동일 설정 유지"의 **실제 생산자↔소비자** 연결.
 *
 * 이 시험이 보는 경로는 한 줄이다:
 *
 *   실제 backend create_room·update_room_settings·start_game
 *     → 실제 서버 game_started 방송
 *     → 실제 useMatchingRoom의 game_started 구독 → 실제 ingameStore.setGamePayload
 *     → 실제 SettingPanelContent → SettingTabPanel → SettingRoomTab → useNextRoomSettings
 *     → 실제 localStorage 레코드
 *     → 실제 게임 진행(역할 확인·낮 투표·재판) → 실제 정상 종료 방송
 *     → 실제 useGameSessionSocketEvents 구독 → 실제 결과 화면(GameResultPage)
 *     → 실제 useInGameExit → 실제 leave_game_session
 *     → 실제 GameSetupPage → useGameSetupPage → buildRoomSettingsFormState → GameSetupPanel
 *     → 실제 buildCreateRoomPayload → 실제 backend create_room
 *
 * 세 가지를 **하지 않는다**(이전 판본이 그 셋으로 경로를 대체했다):
 *   1. 시작 payload를 store에 직접 주입하지 않는다 — 실제 구독자가 받는다.
 *   2. core의 이탈 함수를 직접 부르지 않는다 — 결과 화면의 로비 버튼이 실제 요청을 보낸다.
 *   3. 한 시험 **안에서** registry를 초기화하지 않는다 — 게임이 끝난 그 서버 상태 위에서
 *      다음 방을 만든다(초기화는 시험 사이 정리에만 쓴다).
 *
 * F-20의 변환기 시험을 복사해 오지 않는다(A-06) — 여기서는 변환기를 직접 부르는 단언이 하나도
 * 없고, 모든 값은 위 경로를 실제로 통과한 뒤의 관측이다. 대역은 **소켓 전송과 바깥 경계(HTTP·
 * 전적 저장·투표 저장·업적 평가)** 뿐이고, 저장 매체는 jsdom이 주는 진짜 localStorage다.
 */
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://test:test@localhost:3306/test"

// url을 주어야 jsdom이 실제 Storage를 붙인다(origin 없는 문서에는 localStorage가 없다).
// 저장 범위(A-08)가 "같은 origin·같은 프로필"이라는 계약이 여기서부터 성립한다.
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

// 확인 대화상자·경고는 **window**의 것을 실제 화면 코드가 읽는다(globalThis만 바꾸면
// jsdom의 "not implemented" 구현이 그대로 돌아 나가기 확인이 언제나 취소로 답해진다).
const alerts = []
let confirmAnswer = false
function installWindowDialogs() {
  dom.window.alert = (message) => alerts.push(message)
  dom.window.confirm = () => confirmAnswer
}
installWindowDialogs()
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => confirmAnswer)

register(new URL("../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// ── 소켓 대역: 전송만 흉내내고 판정은 전부 실제 서버 코드가 한다 ─────────────────
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
  namedExports: { dispatchSfxEvent: () => {}, dispatchUiSfx: () => {} },
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
const { MemoryRouter, RouterProvider, createMemoryRouter } = await import("react-router-dom")
const { default: GameSetupPage } = await import("../../pages/GameSetupPage.jsx")
const { default: GameResultPage } = await import("../../../result/page/GameResultPage.jsx")
const { default: SettingPanelContent } =
  await import("../../../ingame/components/controls/ingameSetting/SettingPanelContent.jsx")
const { useInGameStore } = await import("../../../ingame/store/ingameStore.js")
const { useMatchingStore } = await import("../../../matching/store/matchingStore.js")
const { useMatchingRoom } = await import("../../../matching/hooks/useMatchingRoom.js")
const { useGameSessionSocketEvents } =
  await import("../../../ingame/hooks/useGameSessionSocketEvents.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useNextRoomSettingsStore, nextRoomSettingsStorageKey } = await import("../nextRoomSettingsStore.js")
const { SOCKET_EVENTS } = await import("../../constants/gameSetupSocket.js")

const { default: matchmaking } = await import("../../../../../../../backend/socket/matchmaking.js")
const { default: gameSessionCore } = await import("../../../../../../../backend/game-core/gameSession.js")
const { default: gameSessionSocketLayer } = await import("../../../../../../../backend/socket/gameSession.js")
const { default: gameResultRepository } =
  await import("../../../../../../../backend/repositories/gameResult.repositories.js")
const { default: matchmakingFixtures } =
  await import("../../../../../../../backend/socket/__tests__/testHelpers/matchmakingFixtures.js")

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `user-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
  getPublicProfileLoadouts: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
  getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {}])),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

/**
 * A-12: 실제 SQL 경계만 대역으로 바꾼다.
 *
 * 정상 종료는 실제 persistTerminalSession → attemptTerminalPersist → repository까지 내려가고,
 * 낮 투표는 투표 참여 저장을 기다린 뒤에야 ACK한다. 두 경계는 실제 MySQL 트랜잭션을 여는
 * 바깥 경계이므로 여기서만 기록 가능한 대역으로 바꾼다 — 그 위의 종결 판정·방송·상태 전이는
 * 전부 실제 코드가 돈다.
 */
const persistedGameResults = []
gameResultRepository.persistGameResultRecord = async (record) => {
  persistedGameResults.push(deepSnapshot(record))
  return { ok: true }
}
gameSessionSocketLayer.__testables.__setRecordVoteParticipationForTests(async () => ({ ok: true }))
gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests(async () => {})

const { createFakeSocket, createFakeIo, validSettingsPayload, readyPayload, startPayload } = matchmakingFixtures

// ── RESTORE-24: 폐기된 키 검출 ────────────────────────────────────────────────
//
// **키 이름만** 소문자로 낮춰 보고, 객체·배열을 끝까지 내려간다. 값에 그 낱말이 우연히 들어간
// 정상 데이터(닉네임 등)는 오탐하지 않는다.
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

/** 이 구조 안에 실제로 존재하는 **키 이름** 전부(중첩 포함). 값은 보지 않는다. */
function collectKeys(value) {
  if (value === null || typeof value !== "object") return []
  if (Array.isArray(value)) return value.flatMap(collectKeys)
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectKeys(child)])
}

/** 이 계정의 저장 레코드 원문(없으면 null). 저장 **매체**를 직접 본다. */
function readStoredRecord(accountId) {
  const raw = dom.window.localStorage.getItem(nextRoomSettingsStorageKey(accountId))
  return raw === null ? null : JSON.parse(raw)
}

/**
 * 한 계정의 연결 한 벌(서버 소켓 + 클라이언트 소켓).
 *
 * 클라이언트의 emit·emitWithAck은 **등록된 리스너**로만 서버에 닿는다 — 핸들러를 직접 부르면
 * 등록부가 통째로 빠져도 시험이 통과한다. 서버가 그 연결로 보낸 사건(직접 전달·방송 모두
 * socket.emit을 지난다)은 그 연결의 클라이언트 리스너로 되돌린다.
 */
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

  // 서버 → 이 클라이언트. 방송도 수신자의 socket.emit을 지나므로 같은 경로로 잡힌다.
  const originalEmit = serverSocket.emit.bind(serverSocket)
  serverSocket.emit = (event, payload) => {
    originalEmit(event, payload)
    const handlers = [...(listeners.get(event) ?? [])]
    socketState.clientReceived.push({ event, socketId, payload: deepSnapshot(payload) })
    for (const handler of handlers) handler(payload)
  }

  return { uuid, serverSocket, clientSocket }
}

/** 이 연결이 실제로 받은 사건 수. */
function clientReceiptsOf(event, connection) {
  return socketState.clientReceived.filter(
    (entry) => entry.event === event && entry.socketId === connection.clientSocket.socketId,
  )
}

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

/** 지금 registry에 살아 있는 실제 세션(읽기 전용 조회 통로를 빌린다). */
function liveSession(uuid) {
  const target = gameSessionCore.getDisconnectGraceTarget(uuid)
  assert.ok(target, `살아 있는 세션을 찾지 못했다: ${uuid}`)
  return target.session
}

/** ACK 하나를 Promise로 받는다(등록된 리스너를 지난다). */
function ack(connection, event, payload) {
  return connection.clientSocket.emitWithAck(event, payload)
}

/**
 * 실제 서버 경로로 방을 만들고, 부분 지정 설정을 커밋하고, 네 명이 준비해 **시작까지** 간다.
 *
 * 설정은 두 단계로 만든다 — 생성으로 기본 허용값을 넣고, 그 다음 실제 update_room_settings로
 * "DOCTOR만 지정한" 부분 override를 서버에 커밋한다. 그래야 복원 원본이 **부분 지정**이라는
 * 실제 상태를 담고, 그 상태가 다음 방 생성 요청까지 그대로 이어지는지 볼 수 있다.
 */
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

/**
 * 실제 게임을 **정상 승패**까지 진행한다(광대를 재판에서 처형해 시민 승리).
 *
 * 역할은 서버가 무작위로 배정하므로 누가 광대인지는 서버 상태를 **읽어서** 정한다 — 상태를
 * 바꾸는 것이 아니라, 사람이 화면에서 지목하는 것과 같은 입력을 만들기 위한 조회다.
 */
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
    // 자기 자신은 지목할 수 없다(서버 계약) — 광대 본인은 기권한다. 나머지 셋의 표만으로도
    // 최다 득표는 광대다.
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

/** 실제 인게임 설정 패널을 마운트하고 방관리 탭을 연다. */
async function mountRoomTab() {
  let container
  await act(async () => {
    ;({ container } = render(React.createElement(SettingPanelContent, { onOpenKickPlayer: () => {} })))
  })
  const roomTab = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "방관리")
  assert.ok(roomTab, "방장인데 방관리 탭이 없다")
  await act(async () => { roomTab.click() })
  return container
}

/** 회의&투표 탭으로 전환한다(낮/밤 시간 행은 그 탭에 있다). */
async function openMeetingTab(container) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "회의&투표")
  assert.ok(button, "회의&투표 탭 버튼이 없다")
  await act(async () => { button.click() })
}

/**
 * 실제 게임 사건 구독자를 화면 수명 동안 살려 두는 최소 껍데기.
 *
 * useMatchingRoom은 game_started의 실제 구독자이고, useGameSessionSocketEvents는 정상 종료
 * 방송(tribunal_vote_resolved)·game_ended의 실제 구독자다. 둘 다 production이 페이지·
 * ProtectedRoute에서 부르는 바로 그 훅이며, 여기서는 그 훅을 대역 없이 그대로 마운트한다.
 */
const roomCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }
function SessionSubscribers() {
  useGameSessionSocketEvents()
  useMatchingRoom(roomCallbacks)
  return null
}

/** 실제 생성 페이지를 마운트한다(방은 미리 만들지 않는다 — 그 요청 자체가 관측 대상이다). */
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

/**
 * 그 스테퍼 행이 **지금 화면에 보여 주는 값**(예: "6", "120초").
 *
 * 폼 상태 객체가 아니라 DOM에서 읽는다 — 복원 변환이 옳아도 패널이 그 값을 쓰지 않으면
 * 사용자가 보는 숫자는 다를 수 있다(roomSettings.integration.test.js의 같은 관례).
 */
function stepperValue(container, label) {
  const row = [...container.querySelectorAll("[data-setup-row]")]
    .find((node) => node.querySelector("p")?.textContent.trim() === label)
  assert.ok(row, `${label} 행이 화면에 없다`)
  const values = [...row.querySelectorAll("span")]
    .map((node) => node.textContent.trim()).filter(Boolean)
  assert.equal(values.length, 1, `${label} 행에서 값을 하나로 읽지 못했다: ${values.join(" / ")}`)
  return values[0]
}

/** 로그인 상태를 실제 auth store 액션으로 바꾼다(identityGeneration이 실제로 오른다). */
function loginAs(uuid) {
  act(() => { useAuthStore.getState().login({ uuid, nickname: `user-${uuid}` }) })
}
function logout() {
  act(() => { useAuthStore.getState().logout() })
}

/** 이 시험이 쓰는 서버 세계 하나. */
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
})

test.afterEach(() => {
  cleanup()
  setTestSocket(null)
  matchmaking.__resetStateForTests()
  gameSessionCore.__resetStateForTests()
  gameSessionSocketLayer.__resetStateForTests()
})

// ── AC-04 ────────────────────────────────────────────────────────────────────

test("F-24(AC-04) · 실제 시작 방송 → 유지 체크 → 정상 종료 → 결과 화면 이탈 → 다음 방 생성까지 승인된 설정값이 그대로 간다", async () => {
  const hostUuid = "f24-host-a"
  loginAs(hostUuid)

  const io = createWorld()
  const host = createConnection(io, hostUuid)
  const joiners = [1, 2, 3].map((n) => createConnection(io, `f24-join-a-${n}`))
  setTestSocket(host.clientSocket)

  // 1) 실제 서버 경로로 방을 만들고 시작 직전까지 간다.
  const { created } = await createAndStartRealRoom(host, joiners)
  // 생성 ACK의 방을 matching store에 반영하는 것이 production의 생성 성공 경로다
  // (useGameSetupPage.enterRoom). 그 소속이 있어야 아래 구독자가 이 방의 사건을 받는다.
  act(() => { useMatchingStore.getState().setRoom(created.room) })

  // 2) **실제 구독자**를 마운트한다 — 시작·종료 payload는 이 구독으로만 store에 들어온다.
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: ["/game-matching"] },
      React.createElement(SessionSubscribers)))
  })

  // 3) 실제 start_game. 서버가 참가자 각자에게 개인화된 game_started를 보내고, 호스트의
  //    그 사건은 위 useMatchingRoom 구독을 지나 ingameStore로 들어간다.
  const started = await ack(host, "start_game", startPayload({
    roomId: created.room.roomId,
    settingsVersion: liveSettingsVersion(created.room.roomId),
  }))
  assert.equal(started.ok, true, JSON.stringify(started))
  assert.equal(clientReceiptsOf("game_started", host).length, 1, "호스트가 실제 game_started를 받지 못했다")

  await waitFor(() => {
    const source = useInGameStore.getState().state?.roomSettingsSource
    assert.ok(source, "실제 구독 경로로 복원 원본이 store에 들어오지 않았다")
  })
  const inStore = useInGameStore.getState().state.roomSettingsSource
  assert.equal(inStore.accessType, "code")
  assert.deepEqual(inStore.settings.roleNightActionTimes, { DOCTOR: 120 })

  // 4) 실제 방관리 탭의 체크박스를 누른다.
  const container = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  assert.ok(keepBox, "유지 체크박스가 없다")
  await act(async () => { keepBox.click() })

  // 5) 저장 매체에 실제 레코드가 있고, 서버가 확정한 값이 그대로 들어 있다.
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
  // A-02: 이전 방의 식별자·명단·준비·결과는 하나도 저장되지 않는다. 값이 아니라 **키**를
  // 본다 — accessType의 값이 "code"인 것은 정상이고, `code`라는 **키**가 있으면 안 된다.
  const recordKeys = collectKeys(record)
  for (const forbidden of ["roomId", "gameId", "code", "roomCode", "players", "membershipId", "hostUuid", "isReady"]) {
    assert.equal(recordKeys.includes(forbidden), false, `복원 레코드에 ${forbidden} 키가 들어 있다`)
  }

  // 6) 실제 게임을 정상 승패까지 진행한다(주입 없이 실제 판정으로 ENDED가 된다).
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

  // 7) 실제 결과 화면 → 로비 버튼 → 실제 leave_game_session.
  confirmAnswer = true
  const router = createMemoryRouter(
    [{ path: "/gameresult", element: React.createElement(GameResultPage) },
      { path: "/multiplay", element: React.createElement("div", null, "lobby") }],
    { initialEntries: ["/gameresult"] },
  )
  let resultView
  await act(async () => { resultView = render(React.createElement(RouterProvider, { router })) })
  const intro = resultView.container.querySelector("video")
  assert.ok(intro, "결과 연출 영상이 없다")
  await act(async () => { intro.dispatchEvent(new dom.window.Event("ended")) })

  const lobbyButton = [...resultView.container.querySelectorAll("button")]
    .find((node) => node.textContent.includes("로비로"))
  assert.ok(lobbyButton, "결과 화면에 로비 버튼이 없다")
  await act(async () => { lobbyButton.click() })
  await waitFor(() => {
    assert.equal(useInGameStore.getState().gameId, null, "실제 이탈 뒤에도 인게임 세션이 남아 있다")
  })
  assert.equal(
    host.clientSocket.requestsOf("leave_game_session").length, 1,
    "결과 화면의 로비 버튼이 실제 이탈 요청을 보내지 않았다",
  )
  assert.equal(gameSessionCore.getRoomCodeSessionState({ roomCode: created.room.roomCode })?.gameId, gameId)
  cleanup()

  // 8) **같은 서버 상태 위에서** 다음 방을 만든다(registry를 초기화하지 않는다).
  const { view } = await mountCreationPage(host)
  assert.equal(stepperValue(view.container, "최대 플레이어 수"), "6", "정원이 복원되지 않았다")
  await openMeetingTab(view.container)
  assert.equal(stepperValue(view.container, "낮 토론 시간 조절"), "120초")
  assert.equal(stepperValue(view.container, "낮 투표 시간 조절"), "30초")
  assert.equal(stepperValue(view.container, "밤 행동 시간 조절"), "60초")
  assert.equal(stepperValue(view.container, "의사 밤 시간 조절"), "120초", "지정된 override가 사라졌다")
  assert.equal(stepperValue(view.container, "광대 밤 시간 조절"), "60초", "미지정 직업이 전체 밤 시간을 따라가지 않았다")

  // 9) 실제 생성 요청과 서버가 저장한 새 방 설정까지 같은 값이다.
  await act(async () => { view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 2))
  const request = host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[1].payload

  assert.equal(request.accessType, "code")
  assert.equal(request.maxPlayers, 6)
  assert.equal(request.dayDiscussionTime, 120)
  assert.equal(request.dayVoteTime, 30)
  assert.equal(request.nightActionTime, 60)
  assert.deepEqual(request.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
  // 부분 지정이 그대로 이어진다 — 지정하지 않은 세 직업의 override가 새로 생기지 않는다.
  assert.deepEqual(request.roleNightActionTimes, { DOCTOR: 120 })

  const rooms = new Map(matchmaking.__getStateSnapshotForTests().gameRooms)
  assert.equal(rooms.size, 1, "서버에 방이 하나가 아니다")
  const newRoom = [...rooms.values()][0]
  assert.equal(newRoom.settings.maxPlayers, 6)
  assert.deepEqual(newRoom.settings.roleNightActionTimes, { DOCTOR: 120 })
  // AC-06 보조: 새 방에는 생성자 한 명뿐이고 준비 상태도 없다(이전 멤버가 따라오지 않는다).
  // 서버의 players는 Map이고 스냅샷은 그것을 entries로 펴서 준다 — 두 모양 모두 받아 읽는다.
  const newRoomPlayers = [...newRoom.players].map((entry) => (Array.isArray(entry) ? entry[1] : entry))
  assert.deepEqual(newRoomPlayers.map((player) => player.uuid), [hostUuid])
  assert.equal(newRoomPlayers[0].isReady, false)
  assert.notEqual(newRoom.code, created.room.roomCode, "이전 방의 코드가 그대로 재사용됐다")
})

/** 지금 서버가 들고 있는 그 방의 설정 버전(시작 요청이 기대 버전으로 싣는다). */
function liveSettingsVersion(roomId) {
  const rooms = new Map(matchmaking.__getStateSnapshotForTests().gameRooms)
  const room = rooms.get(roomId)
  assert.ok(room, `서버에 그 방이 없다: ${roomId}`)
  return room.settingsVersion
}

test("F-24(AC-04) · 원본이 도착하지 않았거나 이 판의 참가자가 아니면 유지를 켤 수 없다", async () => {
  const hostUuid = "f24-host-await"
  loginAs(hostUuid)
  // 서버 원본 없이 세션만 있는 상태(구버전 payload·도착 전).
  act(() => {
    useInGameStore.setState({
      gameId: "game-await",
      hostUuid,
      state: { id: "game-await", hostUuid, players: [{ uuid: hostUuid }], self: { uuid: hostUuid } },
    })
  })

  const container = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  await act(async () => { keepBox.click() })

  assert.equal(readStoredRecord(hostUuid), null, "원본 없이 저장이 일어났다")
  assert.match(container.textContent, /불러오는 중/, "대기 상태 안내가 없다")
})

// ── AC-05 ────────────────────────────────────────────────────────────────────

test("F-24(AC-05) · 유지를 끄면 영속 레코드가 사라지고 다음 방 생성은 기본값으로 간다", async () => {
  const hostUuid = "f24-host-b"
  loginAs(hostUuid)

  const io = createWorld()
  const host = createConnection(io, hostUuid)
  const joiners = [1, 2, 3].map((n) => createConnection(io, `f24-join-b-${n}`))
  setTestSocket(host.clientSocket)

  const { created } = await createAndStartRealRoom(host, joiners)
  act(() => { useMatchingStore.getState().setRoom(created.room) })
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: ["/game-matching"] },
      React.createElement(SessionSubscribers)))
  })
  const started = await ack(host, "start_game", startPayload({
    roomId: created.room.roomId, settingsVersion: liveSettingsVersion(created.room.roomId),
  }))
  assert.equal(started.ok, true, JSON.stringify(started))
  await waitFor(() => assert.ok(useInGameStore.getState().state?.roomSettingsSource))

  const container = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  await act(async () => { keepBox.click() })
  assert.ok(readStoredRecord(hostUuid), "먼저 켜지지 않았다")

  await act(async () => { keepBox.click() })
  assert.equal(readStoredRecord(hostUuid), null, "해제했는데 레코드가 남았다")

  // 실제 종료·이탈까지 거친 뒤 생성 화면이 기본값에서 시작한다.
  await playToCitizenVictory([host, ...joiners])
  await waitFor(() => assert.equal(useInGameStore.getState().state?.phase, "ENDED"))
  await leaveFromResultScreen(host)
  cleanup()

  const { view } = await mountCreationPage(host)
  await act(async () => { view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 2))
  const request = host.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[1].payload

  // gameSetupOptions.js의 기본값이 그대로 나가야 한다(복원된 6명·120초가 아니다).
  assert.equal(request.maxPlayers, 10)
  assert.equal(request.jokerCount, 2)
  assert.equal(request.dayDiscussionTime, 60)
  assert.equal(request.dayVoteTime, 60)
  assert.equal(request.nightActionTime, 90)
  // 지정 목록 없는 기본 create는 예전 계약대로 네 직업을 명시한다.
  assert.deepEqual(request.roleNightActionTimes, { JOKER: 90, DOCTOR: 90, GUARD: 90, WITCH_HUNTER: 90 })
})

/** 실제 결과 화면을 띄워 로비 버튼으로 이탈한다(core를 직접 부르지 않는다). */
async function leaveFromResultScreen(connection) {
  confirmAnswer = true
  const router = createMemoryRouter(
    [{ path: "/gameresult", element: React.createElement(GameResultPage) },
      { path: "/multiplay", element: React.createElement("div", null, "lobby") }],
    { initialEntries: ["/gameresult"] },
  )
  let view
  await act(async () => { view = render(React.createElement(RouterProvider, { router })) })
  const intro = view.container.querySelector("video")
  if (intro) await act(async () => { intro.dispatchEvent(new dom.window.Event("ended")) })
  const lobbyButton = [...view.container.querySelectorAll("button")]
    .find((node) => node.textContent.includes("로비로"))
  assert.ok(lobbyButton, "결과 화면에 로비 버튼이 없다")
  await act(async () => { lobbyButton.click() })
  await waitFor(() => assert.equal(useInGameStore.getState().gameId, null))
  assert.ok(
    connection.clientSocket.requestsOf("leave_game_session").length >= 1,
    "결과 화면이 실제 이탈 요청을 보내지 않았다",
  )
  confirmAnswer = false
}

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

  // 매체를 "읽기는 되는데 쓰기·삭제는 실패하는" 상태로 만든다(사생활 모드·할당량 초과의 모양).
  //
  // jsdom의 Storage는 Proxy라 인스턴스에 메서드를 대입하면 **그 이름의 저장 항목**이 될 뿐
  // 메서드가 바뀌지 않는다. 그래서 store가 실제로 읽는 통로(globalThis.localStorage) 자체를
  // 같은 계약의 다른 객체로 바꾼다 — 읽기는 진짜 매체로 그대로 흘려보낸다.
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
    // 매체에는 아직 옛 레코드가 그대로 남아 있다.
    assert.ok(readStoredRecord(hostUuid)?.source, "전제: 삭제가 실패해 레코드가 남아 있어야 한다")

    // **그래도 복원하지 않는다** — 해제 의도가 더 새로운 사실이다.
    const read = useNextRoomSettingsStore.getState().readRestoreSource(hostUuid)
    assert.equal(read.source, null, "해제했는데 남은 레코드에서 과거 설정을 복원했다")
    assert.equal(read.code, "DISABLED_PERSIST_FAILED", "해제 실패 사실이 코드로 드러나지 않았다")
  } finally {
    installDomGlobal("localStorage", realStorage)
  }

  // 매체가 돌아오면 다음 읽기가 남은 레코드를 실제로 정리한다.
  const afterRecovery = useNextRoomSettingsStore.getState().readRestoreSource(hostUuid)
  assert.equal(afterRecovery.code, "DISABLED")
  assert.equal(readStoredRecord(hostUuid), null, "매체가 돌아왔는데 옛 레코드가 남아 있다")
})

test("F-24(AC-05) · 서버 원본이 없어도 유지 **해제**는 할 수 있다", async () => {
  const hostUuid = "f24-host-disable-nosource"
  loginAs(hostUuid)

  // 이전 판에서 켜 둔 레코드(원본은 이 판에 없다).
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

  // 이번 판에는 서버 원본이 없다(구버전 payload·도착 전) — 켜는 것은 막히지만 끄는 것은 된다.
  act(() => {
    useInGameStore.setState({
      gameId: "game-nosource",
      hostUuid,
      state: { id: "game-nosource", hostUuid, players: [{ uuid: hostUuid }], self: { uuid: hostUuid } },
    })
  })

  const container = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  assert.equal(keepBox.getAttribute("aria-checked"), "true", "전제: 이전 판의 유지가 켜져 있어야 한다")
  await act(async () => { keepBox.click() })

  assert.equal(readStoredRecord(hostUuid), null, "원본이 없다는 이유로 해제가 막혔다")
  assert.equal(useNextRoomSettingsStore.getState().enabled, false)
})

// ── RESTORE-24 ───────────────────────────────────────────────────────────────

test("RESTORE-24 · 실제로 생산한 레코드를 오염시켜도 저장 매체·폼·생성 요청·새 서버 방 어디에도 남지 않는다", async () => {
  const hostUuid = "f24-host-c"
  loginAs(hostUuid)

  const io = createWorld()
  const host = createConnection(io, hostUuid)
  const joiners = [1, 2, 3].map((n) => createConnection(io, `f24-join-c-${n}`))
  setTestSocket(host.clientSocket)

  const { created } = await createAndStartRealRoom(host, joiners)
  act(() => { useMatchingStore.getState().setRoom(created.room) })
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: ["/game-matching"] },
      React.createElement(SessionSubscribers)))
  })
  const started = await ack(host, "start_game", startPayload({
    roomId: created.room.roomId, settingsVersion: liveSettingsVersion(created.room.roomId),
  }))
  assert.equal(started.ok, true, JSON.stringify(started))
  await waitFor(() => assert.ok(useInGameStore.getState().state?.roomSettingsSource))

  // 서버가 폐기된 키를 실어 보내도 **store 경계에서** 이미 걸러진다(전 경로 배제).
  assertNoSpectatorKeys(useInGameStore.getState().state.roomSettingsSource, "store에 들어온 복원 원본")

  const container = await mountRoomTab()
  await act(async () => {
    container.querySelector("[aria-label='다음 게임 동일 설정 유지']").click()
  })

  // 실제로 생산된 레코드를 먼저 확보한다(직접 주입한 레코드가 아니다).
  const produced = readStoredRecord(hostUuid)
  assert.ok(produced?.source?.settings, "실제 생산 경로로 레코드가 만들어지지 않았다")
  assertNoSpectatorKeys(produced, "실제 생산된 영속 레코드")

  // 과거 오염 데이터를 흉내낸다 — **레코드 최상위**·원본 최상위·설정 최상위·중첩 역할 맵·
  // 허용 키의 값 안까지 전부 섞는다. 한 곳이라도 정제를 건너뛰면 아래에서 드러난다.
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

  // 실제 종료·이탈 뒤 생성 페이지가 그 레코드를 읽는다 — 읽기만으로 매체가 정제돼야 한다.
  await playToCitizenVictory([host, ...joiners])
  await waitFor(() => assert.equal(useInGameStore.getState().state?.phase, "ENDED"))
  await leaveFromResultScreen(host)
  cleanup()

  const { view } = await mountCreationPage(host)
  assertNoSpectatorKeys(readStoredRecord(hostUuid), "정제 재저장 뒤의 저장 매체")

  // 정상 값은 함께 지워지지 않는다.
  const cleaned = readStoredRecord(hostUuid)
  assert.ok(cleaned?.source?.settings, `정제 재저장 뒤 레코드가 비정상이다: ${JSON.stringify(cleaned)}`)
  assert.deepEqual(cleaned.source.settings.roleCounts, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 })
  assert.deepEqual(cleaned.source.settings.roleNightActionTimes, { DOCTOR: 120 })
  assert.equal(cleaned.source.settings.maxPlayers, 6)

  // 화면 초기값(폼)에도, 생성 요청에도, 서버가 저장한 새 방 설정에도 없다.
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
        // 허용 키인데 값이 객체다 — 통째 복사하던 예전 경계는 이 안의 키를 그대로 지나보냈다.
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
  // 값이 객체였던 허용 키는 **살아남지 않는다**(모양이 다르면 버린다).
  assert.equal(Object.hasOwn(read.source.settings, "voteReveal"), false)
  // 정상 값은 그대로다.
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
  await act(async () => {
    render(React.createElement(MemoryRouter, { initialEntries: ["/game-matching"] },
      React.createElement(SessionSubscribers)))
  })
  const started = await ack(hostA, "start_game", startPayload({
    roomId: created.room.roomId, settingsVersion: liveSettingsVersion(created.room.roomId),
  }))
  assert.equal(started.ok, true, JSON.stringify(started))
  await waitFor(() => assert.ok(useInGameStore.getState().state?.roomSettingsSource))

  const container = await mountRoomTab()
  await act(async () => {
    container.querySelector("[aria-label='다음 게임 동일 설정 유지']").click()
  })
  assert.ok(readStoredRecord(accountA), "A의 레코드가 저장되지 않았다")

  await playToCitizenVictory([hostA, ...joiners])
  await waitFor(() => assert.equal(useInGameStore.getState().state?.phase, "ENDED"))
  await leaveFromResultScreen(hostA)
  cleanup()

  // B로 전환 — A의 키는 그대로 남아 있어야 하고(로그아웃은 삭제 명령이 아니다),
  // B의 화면에는 A의 값이 보이면 안 된다.
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

  // A로 돌아오면 A의 값만 복원된다.
  logout()
  loginAs(accountA)
  const a = await mountCreationPage(hostA)
  assert.equal(stepperValue(a.view.container, "최대 플레이어 수"), "6", "A로 돌아왔는데 값이 복원되지 않았다")
})

test("RESTORE-24 · 키의 계정과 레코드의 계정이 다르면 복원하지 않는다", () => {
  const accountA = "f24-acct-mismatch-a"
  const accountB = "f24-acct-mismatch-b"
  // B의 키 자리에 A의 레코드를 손으로 옮겨 붙인 상황.
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
