/**
 * F-24 (AC-04 / AC-05 / RESTORE-24) — "다음 게임 동일 설정 유지"의 **실제 생산자↔소비자** 연결.
 *
 * 이 시험이 보는 경로는 한 줄이다:
 *
 *   실제 backend create_room·update_room_settings·start_game
 *     → 실제 buildGameStartedPayload(state.roomSettingsSource)
 *     → 실제 ingameStore.setGamePayload
 *     → 실제 SettingPanelContent → SettingTabPanel → SettingRoomTab → useNextRoomSettings
 *     → 실제 localStorage 레코드
 *     → 실제 GameSetupPage → useGameSetupPage → buildRoomSettingsFormState → GameSetupPanel
 *     → 실제 buildCreateRoomPayload → 실제 backend handleCreateRoom
 *
 * F-20의 변환기 시험을 복사해 오지 않는다(A-06) — 여기서는 변환기를 직접 부르는 단언이 하나도
 * 없고, 모든 값은 위 경로를 실제로 통과한 뒤의 관측이다. 대역은 **소켓 전송과 바깥 HTTP 경계**
 * 뿐이고, 저장 매체는 jsdom이 주는 진짜 localStorage다.
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
const alerts = []
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => false)

register(new URL("../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

// ── 소켓 대역: emit을 실제 백엔드 핸들러로 흘려보낸다 ───────────────────────────
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
const { MemoryRouter } = await import("react-router-dom")
const { default: GameSetupPage } = await import("../../pages/GameSetupPage.jsx")
const { default: SettingPanelContent } =
  await import("../../../ingame/components/controls/ingameSetting/SettingPanelContent.jsx")
const { useInGameStore } = await import("../../../ingame/store/ingameStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useNextRoomSettingsStore, nextRoomSettingsStorageKey } = await import("../nextRoomSettingsStore.js")
const { SOCKET_EVENTS } = await import("../../constants/gameSetupSocket.js")

const { default: matchmaking } = await import("../../../../../../../backend/socket/matchmaking.js")
const { default: gameSessionCore } = await import("../../../../../../../backend/game-core/gameSession.js")
const { default: matchmakingFixtures } =
  await import("../../../../../../../backend/socket/__tests__/testHelpers/matchmakingFixtures.js")

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `user-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
  getPublicProfileLoadouts: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
  getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {}])),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const { createFakeSocket, createFakeIo, validSettingsPayload, readyPayload, startPayload } = matchmakingFixtures
const {
  handleCreateRoom, handleUpdateRoomSettings, handleJoinRoomByCode, handleSetReady, handleStartGame,
  handleGetCurrentRoom,
} = matchmaking.__testables

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

/** 프런트가 쓰는 소켓 대역. create_room·get_current_room만 실제 핸들러로 흘려보낸다. */
function createBridgedSocket(io, serverSocket, uuid) {
  const requests = []
  const socket = {
    connected: true,
    id: `client-${serverSocket.id}`,
    on() {}, off() {}, emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      requests.push({ event, payload: JSON.parse(JSON.stringify(payload ?? null)) })
      return new Promise((resolve, reject) => {
        if (event === SOCKET_EVENTS.CREATE_ROOM) {
          handleCreateRoom(io, serverSocket, uuid, payload, resolve)
          return
        }
        if (event === SOCKET_EVENTS.GET_CURRENT_ROOM) {
          handleGetCurrentRoom(uuid, resolve)
          return
        }
        reject(new Error(`시험 대역이 알지 못하는 이벤트: ${event}`))
      })
    },
    requestsOf: (event) => requests.filter((entry) => entry.event === event),
  }
  return socket
}

/**
 * 실제 서버 경로로 한 판을 **시작**하고, 그 시작이 호스트에게 보낸 진짜 game_started를 돌려준다.
 *
 * 설정은 두 단계로 만든다 — 생성으로 기본 허용값을 넣고, 그 다음 실제 update_room_settings로
 * "DOCTOR만 지정한" 부분 override를 서버에 커밋한다. 그래야 복원 원본이 **부분 지정**이라는
 * 실제 상태를 담고, 그 상태가 다음 방 생성 요청까지 그대로 이어지는지 볼 수 있다.
 */
async function startRealGame(hostUuid, joinerPrefix) {
  matchmaking.__resetStateForTests()
  gameSessionCore.__resetStateForTests()

  const io = createFakeIo([])
  const hostServer = createFakeSocket(hostUuid)
  io.sockets.sockets.set(hostServer.id, hostServer)

  const created = await new Promise((resolve) => handleCreateRoom(
    io, hostServer, hostUuid,
    validSettingsPayload({
      accessType: "code",
      maxPlayers: 6,
      jokerCount: 1,
      roleCompositionMode: "custom",
      roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
      dayDiscussionTime: 120,
      dayVoteTime: 30,
      nightActionTime: 60,
    }),
    resolve,
  ))
  assert.equal(created.ok, true, JSON.stringify(created))

  // 부분 지정을 **실제 서버 검증·버전 증가**를 거쳐 커밋한다(레코드를 주입하지 않는다).
  const updated = await new Promise((resolve) => handleUpdateRoomSettings(
    io, hostServer, hostUuid,
    {
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
    },
    resolve,
  ))
  assert.equal(updated.ok, true, JSON.stringify(updated))

  // 고정 역할 네 개(JOKER·DOCTOR·GUARD·WITCH_HUNTER 각 1)를 배정하려면 실제 참가자가 넷
  // 있어야 한다 — 서버의 역할 구성 검증(resolveRoleComposition)이 시작 시점의 **실제 인원**으로
  // 다시 판정하기 때문이다. 정원 6과 실제 4의 차이는 그대로 둔다.
  const joiners = [1, 2, 3].map((n) => {
    const uuid = `${joinerPrefix}-${n}`
    const socket = createFakeSocket(uuid)
    io.sockets.sockets.set(socket.id, socket)
    return { uuid, socket }
  })
  for (const joiner of joiners) {
    await handleJoinRoomByCode(io, joiner.socket, joiner.uuid, created.room.roomCode)
  }

  const room = { roomId: created.room.roomId, settingsVersion: updated.settingsVersion }
  await new Promise((resolve) => handleSetReady(io, hostServer, hostUuid, readyPayload(room), resolve))
  for (const joiner of joiners) {
    await new Promise((resolve) =>
      handleSetReady(io, joiner.socket, joiner.uuid, readyPayload(room), resolve))
  }

  const started = await new Promise((resolve) =>
    handleStartGame(io, hostServer, hostUuid, startPayload(room), resolve))
  assert.equal(started.ok, true, JSON.stringify(started))

  const gameStarted = hostServer.emitted.find((entry) => entry.event === "game_started")
  assert.ok(gameStarted, "호스트가 실제 game_started를 받지 못했다")
  return { io, hostServer, payload: gameStarted.payload, room: created.room }
}

/** 실제 인게임 설정 패널을 방장으로 마운트하고 방관리 탭을 연다. */
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

/**
 * 그 판을 실제로 떠난다.
 *
 * 다음 방을 만들려면 이 계정이 더 이상 활성 세션의 참가자가 아니어야 한다 — 서버의
 * create_room은 인게임 소속이 남아 있으면 ALREADY_IN_GAME으로 거부한다(AC-06과 같은 계약).
 * registry를 손으로 지우지 않고 실제 이탈 진입점을 쓴다.
 */
function leaveGame(uuid) {
  const outcome = gameSessionCore.endGameSessionForPlayer(uuid, "PARTICIPANT_LEFT")
  assert.ok(
    outcome.ok || outcome.code === "NOT_IN_SESSION",
    `이탈이 실패했다: ${JSON.stringify(outcome)}`,
  )
}

/** 회의&투표 탭으로 전환한다(낮/밤 시간 행은 그 탭에 있다). */
async function openMeetingTab(container) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "회의&투표")
  assert.ok(button, "회의&투표 탭 버튼이 없다")
  await act(async () => { button.click() })
}

/** 실제 생성 페이지를 마운트한다(방은 미리 만들지 않는다 — 그 요청 자체가 관측 대상이다). */
async function mountCreationPage(accountUuid) {
  matchmaking.__resetStateForTests()
  const io = createFakeIo([])
  const serverSocket = createFakeSocket(accountUuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  const clientSocket = createBridgedSocket(io, serverSocket, accountUuid)
  setTestSocket(clientSocket)

  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/game-setup"] },
      React.createElement(GameSetupPage)))
  })
  await waitFor(() => {
    const button = view.container.querySelector("button[aria-label='게임 만들기']")
    assert.ok(button && button.disabled === false, "게임 만들기 버튼이 아직 활성화되지 않았다")
  })
  return { io, clientSocket, view }
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

test.beforeEach(() => {
  dom.window.localStorage.clear()
  useNextRoomSettingsStore.getState().__resetForTests()
  useInGameStore.getState().clearGame()
  alerts.length = 0
})

test.afterEach(() => {
  cleanup()
  setTestSocket(null)
  matchmaking.__resetStateForTests()
  gameSessionCore.__resetStateForTests()
})

// ── AC-04 ────────────────────────────────────────────────────────────────────

test("F-24(AC-04) · 실제 시작 payload → 유지 체크 → 영속 레코드 → 다음 방 생성 요청까지 승인된 설정값이 그대로 간다", async () => {
  const hostUuid = "f24-host-a"
  loginAs(hostUuid)

  // 1) 실제 서버가 시작에 쓴 설정이 game_started에 실려 온다.
  const { payload } = await startRealGame(hostUuid, "f24-join-a")
  assert.equal(payload.state.roomSettingsSource.accessType, "code")
  assert.deepEqual(payload.state.roomSettingsSource.settings.roleNightActionTimes, { DOCTOR: 120 })

  // 2) 실제 store에 그대로 싣는다(useMatchingRoom의 game_started 핸들러가 하는 일).
  act(() => { useInGameStore.getState().setGamePayload(payload) })

  // 3) 실제 방관리 탭의 체크박스를 누른다.
  const container = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  assert.ok(keepBox, "유지 체크박스가 없다")
  await act(async () => { keepBox.click() })

  // 4) 저장 매체에 실제 레코드가 있고, 서버가 확정한 값이 그대로 들어 있다.
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

  // 5) 그 판을 실제로 떠난 뒤, 생성 페이지가 그 값을 **화면 초기값**으로 쓴다
  //    (폼 객체가 아니라 DOM에서 읽는다).
  leaveGame(hostUuid)
  const { clientSocket, view } = await mountCreationPage(hostUuid)
  assert.equal(stepperValue(view.container, "최대 플레이어 수"), "6", "정원이 복원되지 않았다")
  await openMeetingTab(view.container)
  assert.equal(stepperValue(view.container, "낮 토론 시간 조절"), "120초")
  assert.equal(stepperValue(view.container, "낮 투표 시간 조절"), "30초")
  assert.equal(stepperValue(view.container, "밤 행동 시간 조절"), "60초")
  assert.equal(stepperValue(view.container, "의사 밤 시간 조절"), "120초", "지정된 override가 사라졌다")
  assert.equal(stepperValue(view.container, "광대 밤 시간 조절"), "60초", "미지정 직업이 전체 밤 시간을 따라가지 않았다")

  // 6) 실제 생성 요청과 서버가 저장한 새 방 설정까지 같은 값이다.
  await act(async () => { view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 1))
  const request = clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[0].payload

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
  const savedSettings = [...rooms.values()][0].settings
  assert.equal(savedSettings.maxPlayers, 6)
  assert.deepEqual(savedSettings.roleNightActionTimes, { DOCTOR: 120 })
})

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
  const { payload } = await startRealGame(hostUuid, "f24-join-b")
  act(() => { useInGameStore.getState().setGamePayload(payload) })

  const container = await mountRoomTab()
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  await act(async () => { keepBox.click() })
  assert.ok(readStoredRecord(hostUuid), "먼저 켜지지 않았다")

  await act(async () => { keepBox.click() })
  assert.equal(readStoredRecord(hostUuid), null, "해제했는데 레코드가 남았다")

  // 메모리 캐시를 비운 뒤(새로고침과 같다) 실제 생성 페이지가 기본값에서 시작한다.
  useNextRoomSettingsStore.getState().__resetForTests()
  leaveGame(hostUuid)
  const { clientSocket, view } = await mountCreationPage(hostUuid)
  await act(async () => { view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 1))
  const request = clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[0].payload

  // gameSetupOptions.js의 기본값이 그대로 나가야 한다(복원된 6명·120초가 아니다).
  assert.equal(request.maxPlayers, 10)
  assert.equal(request.jokerCount, 2)
  assert.equal(request.dayDiscussionTime, 60)
  assert.equal(request.dayVoteTime, 60)
  assert.equal(request.nightActionTime, 90)
  // 지정 목록 없는 기본 create는 예전 계약대로 네 직업을 명시한다.
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

// ── RESTORE-24 ───────────────────────────────────────────────────────────────

test("RESTORE-24 · 실제로 생산한 레코드를 오염시켜도 저장 매체·폼·생성 요청·새 서버 방 어디에도 남지 않는다", async () => {
  const hostUuid = "f24-host-c"
  loginAs(hostUuid)
  const { payload } = await startRealGame(hostUuid, "f24-join-c")
  act(() => { useInGameStore.getState().setGamePayload(payload) })

  const container = await mountRoomTab()
  await act(async () => {
    container.querySelector("[aria-label='다음 게임 동일 설정 유지']").click()
  })

  // 실제로 생산된 레코드를 먼저 확보한다(직접 주입한 레코드가 아니다).
  const produced = readStoredRecord(hostUuid)
  assert.ok(produced?.source?.settings, "실제 생산 경로로 레코드가 만들어지지 않았다")
  assertNoSpectatorKeys(produced, "실제 생산된 영속 레코드")

  // 과거 오염 데이터를 흉내낸다 — 최상위·중첩·화면 id 표기를 모두 섞는다.
  const contaminated = JSON.parse(JSON.stringify(produced))
  contaminated.source.settings.allowSpectators = true
  contaminated.source.settings["allow-spectators"] = true
  contaminated.source.settings.roleCounts.SPECTATOR = 3
  contaminated.source.settings.roleNightActionTimes.SPECTATOR = 45
  contaminated.source.spectatorMode = "open"
  dom.window.localStorage.setItem(nextRoomSettingsStorageKey(hostUuid), JSON.stringify(contaminated))
  assert.notDeepEqual(findSpectatorKeys(readStoredRecord(hostUuid)), [], "오염 자체가 실패했다")

  // 실제 생성 페이지가 그 레코드를 읽는다 — 읽기만으로 매체가 정제돼야 한다.
  leaveGame(hostUuid)
  const { clientSocket, view } = await mountCreationPage(hostUuid)
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
  await waitFor(() => assert.equal(clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 1))

  const request = clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[0].payload
  assertNoSpectatorKeys(request, "실제 create_room 요청")
  assert.deepEqual(request.roleNightActionTimes, { DOCTOR: 120 }, "정제가 정상 override까지 지웠다")

  const rooms = new Map(matchmaking.__getStateSnapshotForTests().gameRooms)
  assertNoSpectatorKeys([...rooms.values()][0].settings, "서버가 저장한 새 방 설정")
})

test("RESTORE-24 · 계정 간 복원값이 섞이지 않는다(A 저장 → B 기본값 → A 복귀)", async () => {
  const accountA = "f24-acct-a"
  const accountB = "f24-acct-b"

  loginAs(accountA)
  const { payload } = await startRealGame(accountA, "f24-acct-a-join")
  act(() => { useInGameStore.getState().setGamePayload(payload) })
  const container = await mountRoomTab()
  await act(async () => {
    container.querySelector("[aria-label='다음 게임 동일 설정 유지']").click()
  })
  assert.ok(readStoredRecord(accountA), "A의 레코드가 저장되지 않았다")
  leaveGame(accountA)
  cleanup()

  // B로 전환 — A의 키는 그대로 남아 있어야 하고(로그아웃은 삭제 명령이 아니다),
  // B의 화면에는 A의 값이 보이면 안 된다.
  logout()
  loginAs(accountB)
  act(() => { useInGameStore.getState().clearGame() })

  const b = await mountCreationPage(accountB)
  assert.equal(stepperValue(b.view.container, "최대 플레이어 수"), "10", "B에게 A의 정원이 보인다")
  assert.ok(readStoredRecord(accountA), "B 로그인이 A의 저장값을 지웠다")
  assert.equal(readStoredRecord(accountB), null, "B의 키가 임의로 만들어졌다")
  await act(async () => { b.view.container.querySelector("button[aria-label='게임 만들기']").click() })
  await waitFor(() => assert.equal(b.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM).length, 1))
  assert.equal(b.clientSocket.requestsOf(SOCKET_EVENTS.CREATE_ROOM)[0].payload.maxPlayers, 10)
  cleanup()

  // A로 돌아오면 A의 값만 복원된다.
  logout()
  loginAs(accountA)
  const a = await mountCreationPage(accountA)
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

  const { view } = await mountCreationPage(hostUuid)
  assert.match(
    view.container.textContent, /불러오지 못해 기본값/,
    "손상된 레코드가 아무 안내 없이 기본값으로 바뀌었다",
  )
})
