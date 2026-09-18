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
// jsdom에는 ResizeObserver가 없다. 실제 인게임 설정 패널이 쓰는 공용 Scrollbar(useScrollbarThumb)가
// 이것을 요구하므로, 관측만 하지 않는 최소 구현을 둔다 — 이 시험이 보는 것은 방관리 행의
// 유무·조작이지 스크롤바 치수가 아니다.
installDomGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// 실제 화면 코드가 쓰는 확인 대화상자/경고는 시험에서 기록만 한다(사용자 입력을 기다리면
// 프로세스가 멈춘다). 기록해 두고 "경고가 났는가"도 함께 단언한다.
const alerts = []
// Match useMatchingPage's memoized navigation callbacks: do not restart room sync on each render.
const roomCallbacks = { onRoomDeleted: () => {}, onGameStarted: () => {} }
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

const { render, act, cleanup, renderHook, waitFor } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: GameSetupPanel } = await import("../../../setup/components/GameSetupPanel.jsx")
// AC-06: 생성 경로도 실제 페이지·실제 훅으로 검사한다 — 변환기나 훅을 대역으로 바꾸면
// "관전자 키가 없다"가 production 경로의 사실이 아니라 대역의 사실이 된다.
const { default: GameSetupPage } = await import("../../../setup/pages/GameSetupPage.jsx")
const { useMatchingStore } = await import("../../store/matchingStore.js")
// F-23(AC-01/AC-02): 인게임 방관리 탭도 실제 컴포넌트 경로로 마운트한다 — SettingPanelContent의
// SettingTabPanel이 SettingRoomTab을 마운트하고, 그 탭이 INGAME_SETTING_ROOM_ROWS를 소비한다.
// 행 정의만 단언하면 "화면에 실제로 그려지지 않는다"를 증명하지 못한다.
const { default: SettingPanelContent } =
  await import("../../../ingame/components/controls/ingameSetting/SettingPanelContent.jsx")
const { INGAME_SETTING_ROOM_ROWS } =
  await import("../../../ingame/constants/controls/ingameSetting/ingameSettingData.js")
const { useInGameStore } = await import("../../../ingame/store/ingameStore.js")
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
const { handleCreateRoom, handleUpdateRoomSettings, handleGetCurrentRoom, handleGetPublicRooms } =
  matchmaking.__testables

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
        if (event === SOCKET_EVENTS.CREATE_ROOM) {
          handleCreateRoom(io, serverSocket, uuid, payload, resolve)
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

/**
 * AC-06 생성 경로: 실제 GameSetupPage(→ useGameSetupPage → create_room)를 서버 핸들러에 잇는다.
 *
 * setupRoom과 달리 **방을 미리 만들지 않는다** — 이 시험이 검사하려는 것이 바로 그 생성
 * 요청 자체이기 때문이다. 소켓 대역은 같은 createBridgedSocket을 쓰므로 create_room도
 * 실제 handleCreateRoom으로 흘러간다.
 */
async function mountCreationPage(hostUuid) {
  matchmaking.__resetStateForTests()
  socketState.listeners = new Map()
  alerts.length = 0

  const io = createFakeIo([])
  const serverSocket = createFakeSocket(hostUuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  bridgeServerEmits(serverSocket)
  socketState.socket = createBridgedSocket(io, serverSocket, hostUuid)

  useAuthStore.setState({ user: { uuid: hostUuid }, isLoggedIn: true })
  useMatchingStore.getState().clearRoom()

  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/game-setup"] },
      React.createElement(GameSetupPage)))
  })
  // 입장 연출(requestAnimationFrame)이 끝나야 실제 버튼이 눌린다.
  await waitFor(() => {
    const button = view.container.querySelector("button[aria-label='게임 만들기']")
    assert.ok(button && button.disabled === false, "게임 만들기 버튼이 아직 활성화되지 않았다")
  })
  return { io, serverSocket, view }
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

test("F-23(AC-01/AC-02) · 실제 인게임 방관리 탭에 관전자 항목이 없고 나머지 방관리 기능은 그대로다", async () => {
  // 행 정의 자체에 관전자 행이 없다 — SettingRoomTab의 checks 초기값과 DOM 둘 다 이 목록에서
  // 만들어지므로, 여기서 0개인 것이 곧 두 소비처 모두에서 0개라는 뜻이다.
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

  // 실제 방장에게만 보이는 방관리 탭을 실제로 눌러 SettingRoomTab을 마운트한다.
  const roomTab = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "방관리")
  assert.ok(roomTab, "방장인데 방관리 탭이 없다")
  await act(async () => { roomTab.click() })

  // 관전자 문구·체크박스가 0개.
  assert.equal(container.textContent.includes("관전"), false, "방관리 탭에 관전자 문구가 있다")
  assert.equal(container.querySelector("[aria-label='관전자 허용']"), null, "관전자 체크박스가 남아 있다")

  // 나머지 정상 항목은 그대로다(제거가 옆 항목을 함께 지우지 않았다).
  for (const kept of ["플레이어 추방", "다음 게임 동일 설정 유지", "방 코드 복사"]) {
    assert.equal(container.textContent.includes(kept), true, `${kept} 항목이 사라졌다`)
  }
  // F-22에서 취소된 강제 종료는 복원되지 않는다.
  assert.equal(container.textContent.includes("강제 종료"), false, "취소된 강제 종료가 되살아났다")

  // "다음 게임 동일 설정 유지" 체크는 여전히 로컬 checks만 바꾼다(네트워크 요청 0).
  const keepBox = container.querySelector("[aria-label='다음 게임 동일 설정 유지']")
  assert.ok(keepBox, "다음 게임 유지 체크박스가 없다")
  const emittedBefore = socketState.socket ? socketState.socket.emittedToServer.length : 0
  await act(async () => { keepBox.click() })
  assert.equal(
    socketState.socket ? socketState.socket.emittedToServer.length : 0, emittedBefore,
    "로컬 체크가 서버 요청을 만들었다",
  )

  // 추방 액션 콜백은 정확히 한 번 그대로 이어진다.
  const kickButton = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === "추방하기")
  assert.ok(kickButton, "추방하기 버튼이 사라졌다")
  await act(async () => { kickButton.click() })
  assert.deepEqual(kicks, ["open"], "추방 콜백이 한 번 이어지지 않았다")

  useInGameStore.getState().clearGame()
})

test("AC-06 · 실제 생성 화면의 두 탭·요청·저장값·조회·store·공개 목록 어디에도 관전자 항목이 없다", async () => {
  const { view } = await mountCreationPage("host-create")
  const container = view.container

  // (1) 생성 화면의 두 탭 DOM — 관전자 항목 자체가 없다.
  assert.equal(container.textContent.includes("관전"), false, "일반 탭에 관전자 항목이 있다")
  assert.equal(container.textContent.includes("최대 플레이어 수"), true, "일반 탭 항목이 사라졌다")
  await clickSetupTab(container, "회의&투표")
  assert.equal(container.textContent.includes("관전"), false, "회의&투표 탭에 관전자 항목이 있다")
  // 편집 화면과 달리 생성 화면에는 D-12의 세 항목이 그대로 있어야 한다(기존 생성 계약).
  assert.equal(container.textContent.includes("투표 공개"), true, "생성 화면의 D-12 항목이 사라졌다")
  await clickSetupTab(container, "일반")

  // (2) 실제 "게임 만들기" 클릭 → production 훅이 실제로 보낸 create_room 요청.
  await act(async () => {
    container.querySelector("button[aria-label='게임 만들기']").click()
  })
  await waitFor(() => assert.ok(useMatchingStore.getState().roomId, "생성 뒤 store에 방이 들어오지 않았다"))
  assert.deepEqual(alerts, [], alerts.join(" / "))

  const created = socketState.socket.emittedToServer
    .filter((e) => e.event === SOCKET_EVENTS.CREATE_ROOM)
  assert.equal(created.length, 1, "생성 요청이 정확히 한 번 나가지 않았다")
  const sentPayload = created[0].payload
  assert.equal(JSON.stringify(sentPayload).includes("pectator"), false, "생성 요청에 관전자 키가 실렸다")
  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode"]) {
    assert.equal(Object.hasOwn(sentPayload, key), false, `생성 요청에 ${key}가 실렸다`)
  }

  // (3) 서버가 실제로 들고 있는 원본 저장 스냅샷.
  const [[storedRoomId, storedRoom]] = matchmaking.__getStateSnapshotForTests().gameRooms
  assert.equal(JSON.stringify(storedRoom.settings).includes("pectator"), false, "저장값에 관전자 키가 들어갔다")
  assert.equal(storedRoom.settings.maxPlayers, sentPayload.maxPlayers, "정상 설정 수치가 보존되지 않았다")

  // (4) ACK로 store에 들어간 방 + 현재 방 재조회 응답.
  const state = useMatchingStore.getState()
  assert.equal(storedRoomId, state.roomId)
  assert.equal(JSON.stringify(state.settings).includes("pectator"), false, "store 설정에 관전자 키가 있다")
  const current = await new Promise((resolve) => handleGetCurrentRoom("host-create", resolve))
  assert.equal(current.ok, true)
  assert.equal(JSON.stringify(current.room).includes("pectator"), false, "현재 방 조회 응답에 관전자 키가 있다")

  // (5) 공개 목록 응답.
  const list = await new Promise((resolve) => handleGetPublicRooms(resolve))
  assert.equal(list.ok, true)
  assert.equal(list.rooms.length, 1, "생성한 방이 공개 목록에 있어야 한다")
  assert.ok(list.rooms.some((room) => room.id === storedRoomId), "생성한 방의 공개 응답을 검사해야 한다")
  assert.equal(JSON.stringify(list.rooms).includes("pectator"), false, "공개 목록에 관전자 키가 있다")
})

test("AC-06 · 생성 요청에 관전자 키를 실어 보내면 서버가 거부하고 아무 방도 만들지 않는다", async () => {
  await mountCreationPage("host-reject")

  // production 화면은 이 키를 만들지 않는다(위 시험). 여기서는 그 앞단이 뚫렸다고 가정하고
  // 서버 경계 자체를 본다 — 최상위 키를 하나씩 넣어 각각 확인한다.
  //
  // 생성 검증은 최상위 미허용 키를 **읽지 않는다**(서버 권한 필드를 구조적으로 차단하는 기존
  // 계약). 그래서 요청은 통과하지만 그 키는 저장값·응답 어디에도 들어가지 않아야 한다.
  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode"]) {
    matchmaking.__resetStateForTests()
    const res = await socketState.socket.emitWithAck(
      SOCKET_EVENTS.CREATE_ROOM, { ...validSettingsPayload(), [key]: true },
    )
    assert.equal(res.ok, true, `${key}: ${res.message}`)
    const [, storedRoom] = matchmaking.__getStateSnapshotForTests().gameRooms[0]
    assert.equal(JSON.stringify(storedRoom.settings).includes("pectator"), false,
      `${key}가 저장값으로 새어 들어갔다`)
    assert.equal(storedRoom.settings.maxPlayers, 8, "정상 설정 수치가 훼손됐다")
    assert.equal(storedRoom.settings.voteReveal, true, "정상 설정 수치가 훼손됐다")
    assert.equal(JSON.stringify(res.room).includes("pectator"), false, `${key}가 생성 응답에 실렸다`)
  }
  matchmaking.__resetStateForTests()

  // 중첩 오염 키는 조용히 버려지지 않고 생성 자체가 거부돼야 한다.
  const nested = await socketState.socket.emitWithAck(SOCKET_EVENTS.CREATE_ROOM, {
    ...validSettingsPayload(), roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 },
  })
  assert.equal(nested.ok, false, "중첩 관전자 키가 거부되지 않았다")
  assert.equal(matchmaking.__getStateSnapshotForTests().gameRooms.length, 0, "거부된 요청이 방을 만들었다")
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

  // 실제 공용 변환기의 중첩 오염 제거와 정상값 보존을 함께 검증한다.
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

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
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

/**
 * F-23(AC-03): **오래된 저장 설정의 관전자 키는 어느 소비 경계에도 다시 나타나지 않는다.**
 *
 * 한 방향만 보면 증명이 되지 않는다 — 서버 응답만 정제돼도 늦게 도착한 방송이 store를
 * 되오염시킬 수 있고, store가 깨끗해도 폼 변환기가 원본을 spread하면 화면에 되살아난다.
 * 그래서 오염된 저장값에서 시작해 **실제 저장 흐름 전체**(현재 방 조회 → store → 폼 →
 * 실제 서버 저장 → 저장값 → ACK)와 그 위에 겹치는 **이전 버전 응답·계정 전이**까지 한
 * 경로로 잇고, 각 경계마다 관전자 키가 0개인지 본다.
 */
test("F-23(AC-03) · 오염된 저장 설정은 조회·store·폼·저장·방송 어느 경계에도 되살아나지 않는다", async () => {
  const { room } = await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })

  // 예전 데이터에 관전자 키가 최상위와 중첩 양쪽에 남아 있는 방을 재현한다.
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

  // ① 현재 방 조회 → store. 응답 경계(buildRoomSettingsView)가 이미 걸러야 한다.
  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true, "방 검증이 끝나지 않았다")

  const storeSettings = useMatchingStore.getState().settings
  assert.equal(JSON.stringify(storeSettings).includes("pectator"), false, "store에 관전자 키가 들어왔다")
  assert.equal(storeSettings.maxPlayers, 8, "정상 설정값이 함께 사라졌다")

  // ② store → 폼 변환기. 오염 키를 옮기지 않으면서 정상 값은 그대로 온다.
  const formState = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType,
    settings: storeSettings,
  })
  assert.equal(formState.ok, true, formState.code)
  assert.equal(JSON.stringify(formState).includes("pectator"), false, "폼 상태에 관전자 키가 생겼다")

  // ③ 실제 저장(값 하나만 바꾼다) → 서버 저장값에서 오염 키가 사라진다.
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
  assert.equal(JSON.stringify(stored).includes("pectator"), false, "저장값에 관전자 키가 남았다")
  assert.equal(Object.hasOwn(stored.roleNightActionTimes ?? {}, "SPECTATOR"), false)
  assert.equal(stored.maxPlayers, 6)

  const afterSave = useMatchingStore.getState()
  assert.equal(afterSave.settingsVersion, 2, "store가 새 설정 버전을 반영하지 않았다")
  assert.equal(afterSave.settings.maxPlayers, 6)

  // ④ **이전 버전** 방송이 늦게 도착한다 — 관전자 키를 실은 v1 스냅샷이다. 버전이 낮으므로
  //    적용되지 않아야 하고, 그래서 오염도 설정 되돌림도 일어나지 않는다.
  await act(async () => {
    emitToClient(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, {
      roomId: room.roomId,
      settingsVersion: 1,
      settings: { ...stored, maxPlayers: 8, allowSpectators: true },
      players: afterSave.players,
      hostUuid: "host-a",
      canStart: false,
    })
  })
  const afterStale = useMatchingStore.getState()
  assert.equal(afterStale.settingsVersion, 2, "이전 버전 방송이 설정 버전을 되돌렸다")
  assert.equal(afterStale.settings.maxPlayers, 6, "이전 버전 방송이 설정값을 되돌렸다")
  assert.equal(
    JSON.stringify(afterStale.settings).includes("pectator"), false,
    "이전 버전 방송이 store를 관전자 키로 되오염시켰다",
  )

  // ⑤ 계정 전이 — 계정이 바뀌면 이 화면은 이전 계정의 방을 놓는다(clearRoom). 그 뒤 도착한
  //    **더 높은 버전**의 오염 방송은 이전 계정·이전 소속의 사실이므로, 설정을 되살리지도
  //    관전자 키를 심지도 못한다. 버전만으로 판정하면 이 사건이 통과한다는 점이 핵심이다.
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
      settings: { ...stored, maxPlayers: 10, allowSpectators: true },
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
  assert.equal(
    JSON.stringify(afterAccountSwap).includes("pectator"), false,
    "계정 전이 뒤 도착한 옛 사건이 관전자 키를 store에 심었다",
  )
})

test("비방장·미검증 상태에서는 저장 요청이 서버로 나가지 않는다", async () => {
  await setupRoom("host-a", { maxPlayers: 8, jokerCount: 2 })
  // 방장이 아닌 계정으로 바꾼다 — 화면 버튼과 무관하게 요청 경계 자체가 막혀야 한다.
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
