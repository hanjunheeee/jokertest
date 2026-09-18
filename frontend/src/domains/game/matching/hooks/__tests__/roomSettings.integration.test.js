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
const socketState = { socket: null, subscribers: new Set(), clientReceived: [] }

/** 참조 공유 때문에 나중 변형이 과거 기록을 바꾸지 못하게 깊은 사본을 뜬다. */
function deepSnapshot(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * 현재 연결을 교체하고 **구독자에게 알린다**(실제 socketClient.setSocket과 같은 모양).
 *
 * F-23(SPLIT-2): 예전 대역의 subscribeSocket은 아무 일도 하지 않는 함수였다. 그러면
 * useSyncExternalStore가 소켓 교체를 영영 알지 못해 훅은 계속 옛 소켓을 들고 있고,
 * "옛 연결의 사건이 새 연결로 둔갑하지 않는다"는 계약을 시험으로 재현할 수 없다.
 */
function setTestSocket(next) {
  socketState.socket = next
  for (const notify of [...socketState.subscribers]) notify()
}

/**
 * 서버가 보낸 사건을 **그 소켓에 실제로 등록된 클라이언트 listener**로 흘려보낸다.
 *
 * F-23(SPLIT-2): listener를 소켓별로 나눠 둔다. 전역 Map 하나에 모으면 연결이 교체된 뒤에도
 * 옛 소켓으로 도착한 사건이 새 연결의 구독자에게 그대로 배달돼, 훅이 옛 연결을 제대로
 * 떼어냈는지 구별할 수 없다.
 *
 * 전달된 사건은 clientReceived에 따로 적는다. 서버의 전송 시도(serverSocket.emitted)와
 * 클라이언트의 실제 수신은 다른 사실이라, 한 배열로 세면 "방송이 나갔다"와 "화면이 받았다"를
 * 구별할 수 없다.
 */
function emitToClient(event, payload, target = socketState.socket) {
  assert.ok(target, "전달할 클라이언트 소켓이 없다")
  const handlers = [...(target.listeners.get(event) ?? [])]
  socketState.clientReceived.push({
    event, socketId: target.socketId, payload: deepSnapshot(payload), handlers: handlers.length,
  })
  for (const handler of handlers) handler(payload)
}

/** 클라이언트가 그 사건을 실제로 몇 번 받았는가(소켓을 주면 그 연결의 수신만 센다). */
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
  namedExports: { dispatchSfxEvent: () => {}, dispatchUiSfx: () => {} },
})
// 실제 대기방 페이지는 친구 패널을 함께 들고 온다 — 그 경로가 Vite 전용 import.meta.env
// (shared/env.js)와 HTTP client를 거친다. 바깥 경계만 대역으로 두고 페이지·훅·store는 실제
// 코드 그대로 쓴다(같은 디렉터리의 roomSettingsEditRecovery.test.js와 같은 관례).
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
// AC-06: 생성 경로도 실제 페이지·실제 훅으로 검사한다 — 변환기나 훅을 대역으로 바꾸면
// "관전자 키가 없다"가 production 경로의 사실이 아니라 대역의 사실이 된다.
const { default: GameSetupPage } = await import("../../../setup/pages/GameSetupPage.jsx")
// F-23(AC-01/AC-03): 대기방 편집도 실제 페이지 경로로 본다 — GameMatchingPage가
// useMatchingPage를 부르고, 그 훅의 settingsForm이 실제 GameSetupPanel의 initialFormState가
// 된다. 변환기만 직접 부르면 "화면이 그 값을 쓴다"는 사실이 시험 바깥에 남는다.
const { default: GameMatchingPage } = await import("../../pages/GameMatchingPage.jsx")
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
const { SOCKET_EVENTS, ROOM_SETTINGS_ERROR_CODES, ROOM_SETTINGS_ERROR_MESSAGES } =
  await import("../../../setup/constants/gameSetupSocket.js")

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

const { createFakeSocket, createFakeIo, validSettingsPayload, readyPayload } = matchmakingFixtures
const {
  handleCreateRoom, handleUpdateRoomSettings, handleGetCurrentRoom, handleGetPublicRooms,
  handleJoinRoomByCode, handleSetReady, handleGetRoomSettingsUpdateResult,
} = matchmaking.__testables

/**
 * F-23(SPLIT-2): **폐기된 관전 키를 대소문자 무시·중첩 포함으로** 찾아 그 경로 목록을 돌려준다.
 *
 * 이 파일의 원래 검사는 `JSON.stringify(x).includes("pectator")` 하나였다. 그 술어는
 * 대소문자를 구분하므로 `SPECTATOR`(중첩 역할 키가 실제로 쓰는 표기)를 그대로 통과시킨다 —
 * roleCounts.SPECTATOR나 roleNightActionTimes.SPECTATOR만 남은 응답은 "관전자 키 0개"로
 * 판정됐다. 여기서는 **키 이름만** 소문자로 낮춰 보고(값에 든 문자열은 키가 아니다),
 * 객체와 배열을 끝까지 내려가며 검사한다.
 *
 * @returns {string[]} 검출된 키의 경로(예: "$.roleCounts.SPECTATOR"). 깨끗하면 빈 배열.
 */
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

/** 이 경계에 폐기 관전 키가 하나도 없어야 한다. 검출되면 경로를 그대로 실패 메시지에 싣는다. */
function assertNoSpectatorKeys(value, where) {
  const found = findSpectatorKeys(value)
  assert.deepEqual(found, [], `${where}에 폐기된 관전 키가 남아 있다: ${found.join(", ")}`)
}

/** 정상 역할 키 집합 — 정제가 폐기 키만 걷어내고 정상 키를 함께 지우지 않았는지 대조한다. */
const NORMAL_ROLE_KEYS = ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]

/**
 * 프런트가 쓰는 소켓 대역을 만든다.
 *
 * emitWithAck으로 들어온 이벤트를 실제 서버 핸들러로 보내고, 서버가 그 계정의 소켓에 보낸
 * room_settings_updated는 클라이언트 리스너로 되돌린다.
 */
let bridgedSocketSeq = 0
function createBridgedSocket(io, serverSocket, uuid) {
  const emittedToServer = []
  // 이 연결만의 구독 목록이다(전역 공유 아님) — 교체된 뒤 옛 연결에 남은 구독을 관측할 수 있다.
  const listeners = new Map()
  bridgedSocketSeq += 1
  const socketId = `client-sock-${bridgedSocketSeq}`
  // F-23(SPLIT-2): 요청과 응답을 **각각 깊은 사본으로** 따로 적는다. emittedToServer에 실린
  // payload는 프로덕션 코드가 그대로 들고 있는 객체라, 나중에 그 참조가 변형되면 과거 요청
  // 기록까지 함께 바뀌어 "그때 무엇을 보냈는가"를 더 이상 검사할 수 없다.
  const requests = []
  const responses = []
  // ACK를 유실시킬 이벤트 집합. 서버는 정상적으로 처리·커밋하고, 그 응답만 클라이언트에
  // 도달하지 못한다(실제 유실과 같은 모양 — "실패"가 아니라 "결과를 모른다").
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
    /** 이 연결에 지금 남아 있는 구독 수(교체 뒤 해제 여부를 본다). */
    handlerCountOf: (event) => listeners.get(event)?.size ?? 0,
    emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      emittedToServer.push({ event, payload })
      requests.push({ event, payload: deepSnapshot(payload) })
      return new Promise((resolve, reject) => {
        // ACK를 클라이언트 Promise로 넘기기 **직전에** 응답을 포착한다 — 서버가 무엇을
        // 답했는지와 화면이 무엇을 받았는지를 따로 볼 수 있어야 한다.
        const settle = (response) => {
          responses.push({ event, response: deepSnapshot(response) })
          if (droppedAcks.has(event)) {
            // 유실: 서버는 이미 처리·커밋했고 응답만 도착하지 않는다. 실제 클라이언트가 그
            // 상황에서 보는 것은 **socket.timeout()의 거부**다(응답이 영영 오지 않는 Promise가
            // 아니다) — 프로덕션 훅의 catch 경로가 실제로 돌도록 같은 모양으로 끝낸다.
            // 시간만 시험이 앞당긴다(8초를 실제로 기다리지 않는다).
            reject(new Error("operation has timed out"))
            return
          }
          resolve(response)
        }
        if (event === SOCKET_EVENTS.GET_CURRENT_ROOM) {
          handleGetCurrentRoom(uuid, settle)
          return
        }
        if (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS) {
          // 서버가 방송한 사건을 클라이언트 리스너로 되돌리기 위해 서버 소켓의 emit을 감싼다.
          handleUpdateRoomSettings(io, serverSocket, uuid, payload, settle)
          return
        }
        if (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT) {
          // ACK를 잃은 저장의 결과를 **같은 requestId로** 다시 묻는 실제 서버 경로다.
          handleGetRoomSettingsUpdateResult(uuid, payload, settle)
          return
        }
        if (event === SOCKET_EVENTS.CREATE_ROOM) {
          handleCreateRoom(io, serverSocket, uuid, payload, settle)
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
  socketState.clientReceived = []
  alerts.length = 0

  const io = createFakeIo([])
  const serverSocket = createFakeSocket(hostUuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  const created = await new Promise((resolve) =>
    handleCreateRoom(io, serverSocket, hostUuid, validSettingsPayload(payloadOverrides), resolve))
  assert.equal(created.ok, true, created.message)

  bridgeServerEmits(serverSocket)
  setTestSocket(createBridgedSocket(io, serverSocket, hostUuid))

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
  socketState.clientReceived = []
  alerts.length = 0

  const io = createFakeIo([])
  const serverSocket = createFakeSocket(hostUuid)
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  bridgeServerEmits(serverSocket)
  setTestSocket(createBridgedSocket(io, serverSocket, hostUuid))

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

/** 설정 패널의 한 행(제목이 정확히 label인 [data-setup-row]). 없으면 null. */
function setupRow(container, label) {
  return [...container.querySelectorAll("[data-setup-row]")]
    .find((node) => node.querySelector("p")?.textContent.trim() === label) ?? null
}

/**
 * 그 행의 스테퍼가 **지금 화면에 보여 주는 값**(예: "8", "60초").
 *
 * 폼 상태 객체가 아니라 DOM에서 읽는다 — 변환기가 옳아도 패널이 그 값을 쓰지 않으면
 * 방장이 보는 숫자는 다를 수 있다.
 */
function stepperValue(container, label) {
  const row = setupRow(container, label)
  assert.ok(row, `${label} 행이 화면에 없다`)
  assert.ok(row.querySelector(`button[aria-label='${label} 감소']`), `${label}가 스테퍼 행이 아니다`)
  const values = [...row.querySelectorAll("span")]
    .map((node) => node.textContent.trim()).filter(Boolean)
  assert.equal(values.length, 1, `${label} 행에서 값을 하나로 읽지 못했다: ${values.join(" / ")}`)
  return values[0]
}

/** 역할 구성 구역이 지금 그리고 있는 인원 행의 제목들(관전자 행이 끼어들면 여기서 드러난다). */
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

/**
 * F-23(SPLIT-2): **검출기 자신의 양성 대조.**
 *
 * 아래 시험들은 전부 "폐기 키가 0개"라는 부재 단언이다. 검출기가 무엇도 찾지 못하는
 * 구현으로 퇴화하면 그 단언은 전부 조용히 통과한다 — 깨끗한 객체만 넣어 보는 것으로는
 * 그것을 구별할 수 없다. 그래서 폐기 키를 **하나씩 단독으로** 주입해 반드시 검출되는지
 * 먼저 고정한다. 이 시험이 깨지지 않는 한 아래의 0개 단언들은 의미를 갖는다.
 */
test("F-23(SPLIT-2) · 폐기 키 검출기는 중첩·대문자 SPECTATOR까지 각각 단독 주입에서 검출한다", () => {
  // 다섯 최상위 표기를 하나씩. 대문자만 다른 표기도 같은 키로 잡아야 한다.
  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode", "SPECTATOR"]) {
    assert.deepEqual(
      findSpectatorKeys({ maxPlayers: 8, [key]: true }), [`$.${key}`],
      `최상위 ${key}를 검출하지 못했다`,
    )
  }

  // 두 중첩 역할 객체의 SPECTATOR도 각각 단독으로. 예전의 includes("pectator")는 대소문자를
  // 구분해 이 둘을 그대로 통과시켰다 — 이 조각이 고치는 바로 그 구멍이다.
  assert.deepEqual(
    findSpectatorKeys({ roleCounts: { JOKER: 2, DOCTOR: 1, SPECTATOR: 1 } }),
    ["$.roleCounts.SPECTATOR"], "roleCounts.SPECTATOR를 검출하지 못했다",
  )
  assert.deepEqual(
    findSpectatorKeys({ roleNightActionTimes: { JOKER: 30, SPECTATOR: 30 } }),
    ["$.roleNightActionTimes.SPECTATOR"], "roleNightActionTimes.SPECTATOR를 검출하지 못했다",
  )
  // 배열 안에 들어 있어도 내려간다(players 같은 목록 응답).
  assert.deepEqual(
    findSpectatorKeys({ players: [{ uuid: "a" }, { uuid: "b", allowSpectators: true }] }),
    ["$.players[1].allowSpectators"], "배열 안의 폐기 키를 검출하지 못했다",
  )

  // 정상 설정은 깨끗하다 — 부재 단언이 항상 실패하는 검출기도 아니다.
  assert.deepEqual(findSpectatorKeys({
    maxPlayers: 8, jokerCount: 2, voteReveal: true,
    roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    roleNightActionTimes: { JOKER: 30 },
  }), [])
  // **키**만 본다. 값에 우연히 그 낱말이 들어간 정상 데이터를 오탐하지 않는다.
  assert.deepEqual(findSpectatorKeys({ nickname: "spectator-fan", title: "SPECTATOR" }), [])
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
  assertNoSpectatorKeys(sentPayload, "생성 요청")
  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode"]) {
    assert.equal(Object.hasOwn(sentPayload, key), false, `생성 요청에 ${key}가 실렸다`)
  }

  // (3) 서버가 실제로 들고 있는 원본 저장 스냅샷.
  const [[storedRoomId, storedRoom]] = matchmaking.__getStateSnapshotForTests().gameRooms
  assertNoSpectatorKeys(storedRoom.settings, "서버 저장값")
  assert.equal(storedRoom.settings.maxPlayers, sentPayload.maxPlayers, "정상 설정 수치가 보존되지 않았다")

  // (4) ACK로 store에 들어간 방 + 현재 방 재조회 응답.
  const state = useMatchingStore.getState()
  assert.equal(storedRoomId, state.roomId)
  assertNoSpectatorKeys(state.settings, "store 설정")
  const current = await new Promise((resolve) => handleGetCurrentRoom("host-create", resolve))
  assert.equal(current.ok, true)
  assertNoSpectatorKeys(current.room, "현재 방 조회 응답")

  // (5) 공개 목록 응답.
  const list = await new Promise((resolve) => handleGetPublicRooms(resolve))
  assert.equal(list.ok, true)
  assert.equal(list.rooms.length, 1, "생성한 방이 공개 목록에 있어야 한다")
  assert.ok(list.rooms.some((room) => room.id === storedRoomId), "생성한 방의 공개 응답을 검사해야 한다")
  assertNoSpectatorKeys(list.rooms, "공개 목록 응답")
})

/**
 * F-23(SPLIT-2): 생성 요청의 두 오염은 **서로 다른 계약**을 갖는다. 예전 제목은 둘 다
 * "거부하고 아무 방도 만들지 않는다"고 말했지만, 본문이 실제로 고정하는 것은 최상위 키의
 * 경우 `ok:true`(정상 생성 + 키 제거)다. 제목이 본문과 다르면 나중에 계약이 바뀌었을 때
 * 어느 쪽이 의도였는지 판단할 근거가 사라지므로, 제목을 실제 계약에 맞춘다.
 */
test("AC-06 · 생성 요청의 최상위 관전자 키는 무시돼 정상 생성되고, 중첩 역할 키는 생성 자체가 거부된다", async () => {
  await mountCreationPage("host-reject")

  // production 화면은 이 키를 만들지 않는다(위 시험). 여기서는 그 앞단이 뚫렸다고 가정하고
  // 서버 경계 자체를 본다 — 최상위 키를 하나씩 넣어 각각 확인한다.
  //
  // 생성 검증은 최상위 미허용 키를 **읽지 않는다**(서버 권한 필드를 구조적으로 차단하는 기존
  // 계약). 그래서 요청은 통과하지만 그 키는 저장값·응답 어디에도 들어가지 않아야 한다.
  for (const key of ["allowSpectators", "allow-spectators", "spectator", "spectatorMode", "SPECTATOR"]) {
    matchmaking.__resetStateForTests()
    const res = await socketState.socket.emitWithAck(
      SOCKET_EVENTS.CREATE_ROOM, { ...validSettingsPayload(), [key]: true },
    )
    assert.equal(res.ok, true, `${key}: ${res.message}`)
    // 정상 생성은 방을 **정확히 하나** 만든다(무시가 중복 생성으로 새지 않았다).
    const rooms = matchmaking.__getStateSnapshotForTests().gameRooms
    assert.equal(rooms.length, 1, `${key}: 정상 생성이 방을 정확히 하나 만들지 않았다`)
    const [, storedRoom] = rooms[0]
    assertNoSpectatorKeys(storedRoom.settings, `${key}를 실은 생성의 저장값`)
    assert.equal(storedRoom.settings.maxPlayers, 8, "정상 설정 수치가 훼손됐다")
    assert.equal(storedRoom.settings.voteReveal, true, "정상 설정 수치가 훼손됐다")
    assertNoSpectatorKeys(res.room, `${key}를 실은 생성의 응답`)
  }

  // 중첩 오염 키는 조용히 버려지지 않고 생성 자체가 거부돼야 한다 — 두 역할 객체를 각각
  // 단독으로 넣어 확인한다(하나만 막혀 있어도 다른 하나가 통과하면 방이 만들어진다).
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
  assertNoSpectatorKeys(storeSettings, "조회 뒤 store 설정")
  assert.equal(storeSettings.maxPlayers, 8, "정상 설정값이 함께 사라졌다")

  // ② store → 폼 변환기. 오염 키를 옮기지 않으면서 정상 값은 그대로 온다.
  const formState = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType,
    settings: storeSettings,
  })
  assert.equal(formState.ok, true, formState.code)
  assertNoSpectatorKeys(formState, "폼 상태")

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
  assertNoSpectatorKeys(stored, "저장 뒤 서버 저장값")
  assert.equal(Object.hasOwn(stored.roleNightActionTimes ?? {}, "SPECTATOR"), false)
  assert.equal(stored.maxPlayers, 6)

  const afterSave = useMatchingStore.getState()
  assert.equal(afterSave.settingsVersion, 2, "store가 새 설정 버전을 반영하지 않았다")
  assert.equal(afterSave.settings.maxPlayers, 6)

  // ④ **이전 버전** 방송이 늦게 도착한다 — 관전자 키를 실은 v1 스냅샷이다. 버전이 낮으므로
  //    적용되지 않아야 하고, 그래서 오염도 설정 되돌림도 일어나지 않는다.
  //
  //    최상위 표기만 실으면 대소문자를 구분하던 예전 검사로도 잡혔다. 여기서는 **두 중첩
  //    대문자 SPECTATOR**를 함께 실어, 중첩 경로로 들어오는 재오염까지 막히는지 본다.
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

/**
 * 실제 참가·CUSTOM 전환·전원 준비까지 마친 방을 만든다.
 *
 * 중첩 오염(roleCounts.SPECTATOR·roleNightActionTimes.SPECTATOR)을 얹으려면 그 두 키가
 * 실제로 존재하는 CUSTOM 저장값이 있어야 하고, "저장이 준비를 건드리지 않았다"는 준비한
 * 사람이 실제로 있을 때만 관측된다 — 둘 다 실제 서버 경로로 만든다.
 */
async function setupCustomRoomWithReadyJoiner(hostUuid = "host-custom", joinerUuid = "guest-custom") {
  const { io, serverSocket, room } = await setupRoom(hostUuid, { maxPlayers: 8, jokerCount: 2 })

  const joinerSocket = createFakeSocket(joinerUuid)
  io.sockets.sockets.set(joinerSocket.id, joinerSocket)
  await handleJoinRoomByCode(io, joinerSocket, joinerUuid, room.roomCode)

  // 역할 구성을 CUSTOM으로 확정한다(v1 → v2). 이 저장이 roleCounts·roleNightActionTimes를
  // 실제 저장값에 만든다 — 계획이 명시한 정상 기대값이 여기서 고정된다.
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

  // 설정 변경이 준비를 해제하므로, 준비는 그 **뒤에** 세운다.
  for (const [socket, uuid] of [[serverSocket, hostUuid], [joinerSocket, joinerUuid]]) {
    const ready = await new Promise((resolve) =>
      handleSetReady(io, socket, uuid, readyPayload(room, true, { settingsVersion: 2 }), resolve))
    assert.equal(ready.ok, true, `${uuid} 준비 실패: ${ready.message}`)
  }

  return { io, serverSocket, joinerSocket, room, hostUuid, joinerUuid }
}

/** 현재 서버가 들고 있는 방의 원본(스냅샷은 players를 배열로 준다 — Map으로 되돌린다). */
function rawStoredRoom(roomId) {
  const [, room] = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === roomId)
  return { ...room, players: new Map(room.players) }
}

/** 최상위 + 두 중첩 대문자 SPECTATOR를 한꺼번에 얹은 "오래된 저장값"을 만든다. */
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

  // 전제 확인 — 주입이 실제로 저장값에 들어갔는가. 검출기의 양성 대조이기도 하다.
  const seeded = matchmaking.__getStateSnapshotForTests().gameRooms.find(([id]) => id === roomId)[1].settings
  const found = findSpectatorKeys(seeded)
  assert.ok(found.includes("$.roleCounts.SPECTATOR"), "전제: 중첩 roleCounts 오염이 심어져야 한다")
  assert.ok(found.includes("$.roleNightActionTimes.SPECTATOR"), "전제: 중첩 밤 시간 오염이 심어져야 한다")
  assert.ok(found.includes("$.allowSpectators"), "전제: 최상위 오염이 심어져야 한다")
}

/**
 * F-23(SPLIT-2): **값이 달라지지 않는 저장**은 오염만 걷어내고 나머지는 전부 보존한다.
 *
 * 기존 통합 시험은 오염 제거를 **값을 바꾸는** 저장으로만 확인했다. 그 경로는 어차피 버전을
 * 올리고 준비를 해제하므로, "정제가 버전·준비를 함부로 건드리지 않는가"를 구별하지 못한다 —
 * 정제만으로 settingsVersion이 오르거나 준비가 풀리는 퇴화가 그대로 통과한다. 그래서 값이
 * 같은 저장 하나를 실제 조회 → store → 폼 → 저장 순서로 돌려 그 경계를 따로 고정한다.
 */
test("F-23(SPLIT-2) · 동일값 저장은 중첩 오염만 걷어내고 버전·준비·방송·수신을 전부 보존한다", async () => {
  const { room, joinerSocket } = await setupCustomRoomWithReadyJoiner()
  seedContaminatedSettings(room.roomId)

  // ① 실제 조회 → store. 응답 경계가 이미 두 중첩 오염을 걷어내야 한다.
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

  // ② store → 폼. 폼의 역할 목록도 정상 역할 집합과 정확히 같아야 한다.
  const formState = buildRoomSettingsFormState({
    accessType: useMatchingStore.getState().accessType, settings: storeSettings,
  })
  assert.equal(formState.ok, true, formState.code)
  assertNoSpectatorKeys(formState, "오염된 CUSTOM 방의 폼 상태")
  assert.deepEqual(Object.keys(formState.roleComposition.roleCounts).sort(), [...NORMAL_ROLE_KEYS].sort())
  assert.deepEqual(formState.specifiedRoleNightActionTimes, ["JOKER"],
    "지정된 밤 시간 목록이 정상 역할만 담고 있지 않다")

  // ③ 값을 **하나도 바꾸지 않고** 저장한다.
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

  // 제출한 요청 자체에도 폐기 키가 없다(폼이 원본을 spread해 되살리지 않았다).
  const sent = socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).at(-1).payload
  assertNoSpectatorKeys(sent, "동일값 저장 요청")
  assert.deepEqual(sent.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(sent.roleNightActionTimes, { JOKER: 30 })

  // 저장값: 오염만 사라지고 정상값은 전부 그대로다.
  const stored = rawStoredRoom(room.roomId)
  assertNoSpectatorKeys(stored.settings, "동일값 저장 뒤 서버 저장값")
  assert.equal(stored.settings.maxPlayers, 8)
  assert.equal(stored.settings.jokerCount, 2)
  assert.equal(stored.settings.dayDiscussionTime, 60)
  assert.equal(stored.settings.dayVoteTime, 60)
  assert.equal(stored.settings.nightActionTime, 90)
  assert.deepEqual(stored.settings.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.deepEqual(stored.settings.roleNightActionTimes, { JOKER: 30 })
  // D-12 세 값은 편집에서 보내지 않았는데 정제 과정에서 달라지면 안 된다.
  assert.equal(stored.settings.lightsOut, false)
  assert.equal(stored.settings.soulBetting, false)
  assert.equal(stored.settings.voteReveal, true)

  // 버전·준비·readyRevision·방송·실제 수신은 전부 불변이다.
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

  // ④ **양성 대조**: 실제로 값을 바꾸는 저장은 같은 경로로 버전을 올리고 준비를 풀며
  //    정제된 설정 사건을 방장·참가자 양쪽에 실제로 전달한다. 위의 "0회"가 전달 경로 자체가
  //    끊겨서 나온 결과가 아님을 이 단언이 보증한다.
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
  // 실제로 전달된 그 사건도 정제돼 있어야 한다(방송 경계의 되오염 0).
  const delivered = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).at(-1)
  assertNoSpectatorKeys(delivered.payload, "실제로 전달된 설정 변경 사건")
  assert.equal(delivered.payload.settings.maxPlayers, 6)
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 6, "store가 최신값을 반영하지 않았다")
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "변경 저장 수신 뒤 store 설정")
})

/**
 * F-23(SPLIT-2): ACK를 잃으면 훅이 **미확인**으로 남고, 같은 requestId 조회로만 정착한다.
 *
 * 저장 자체는 서버에서 정상 커밋되고 응답만 도달하지 않는다. 그 상태에서 새 requestId로
 * 다시 저장하면 이미 반영된 변경이 두 번 일어난다 — 그래서 화면은 결과 조회만 보내야 한다.
 *
 * 예전 판은 Promise.race로 "응답을 못 받은 척"한 뒤 서버 핸들러를 **직접** 불렀다. 그러면
 * 훅의 timeout 처리(catch → pendingSettingsRequest)도, 미확인 동안의 새 저장 잠금도,
 * verifyRoomSettingsResult가 실제로 보내는 요청도 하나도 검사하지 못한다 — 서버 계약만 두 번
 * 확인한 셈이다. 여기서는 소켓 대역이 실제 timeout처럼 **거부**하게 두고, 그 다음은 전부
 * 프로덕션 훅이 스스로 하게 한다.
 */
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

  // 커밋은 정상적으로 일어나되 ACK만 도달하지 않는다 → 훅의 timeout 경로로 미확인이 된다.
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
  // **훅이** 그 요청을 미확인으로 붙잡고 있다(대기방 화면의 결과 확인 진입이 여기서 열린다).
  assert.equal(result.current.hasPendingSettingsResult, true, "ACK 유실이 미확인으로 남지 않았다")
  assert.equal(result.current.settingsError?.code, ROOM_SETTINGS_ERROR_CODES.UNKNOWN)

  // 서버에는 이미 커밋돼 있다(그래서 "실패"라고 단정하면 안 된다).
  const committed = rawStoredRoom(room.roomId)
  assert.equal(committed.settings.maxPlayers, 6, "전제: 서버는 이미 커밋했어야 한다")
  assertNoSpectatorKeys(committed.settings, "ACK 유실 저장 뒤 서버 저장값")
  const versionAfterCommit = committed.settingsVersion
  const saveRequests = socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  assert.equal(saveRequests.length, 1, "ACK 유실이 자동 재저장을 만들었다")
  const lostRequestId = saveRequests[0].payload.requestId

  // 미확인인 동안에는 **새 저장 자체가 나가지 않는다** — 나가면 이미 반영된 변경이 두 번 커밋된다.
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

  // 같은 requestId로 결과만 다시 묻는다 — **훅이** 보내고, 실제 서버 결과 기록 경로를 지난다.
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

  // 정착했으므로 미확인 잠금이 풀리고, 새 저장은 0이며 저장값도 다시 커밋되지 않았다.
  assert.equal(result.current.hasPendingSettingsResult, false, "정착한 뒤에도 미확인으로 남았다")
  assert.equal(
    socketState.socket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length, 1,
    "결과 확인이 새 저장 요청을 만들었다",
  )
  const afterLookup = rawStoredRoom(room.roomId)
  assert.equal(afterLookup.settingsVersion, versionAfterCommit, "결과 확인이 저장을 다시 커밋했다")
  assert.equal(afterLookup.settings.maxPlayers, 6)
  // 잠금이 풀렸으니 이제 정상 저장이 다시 열린다(모든 저장을 막아서 통과한 것이 아니다).
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

/** 실제 대기방 페이지를 띄우고, 방장에게 설정 편집 진입이 열릴 때까지 기다린다. */
async function mountMatchingPage() {
  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/game-matching"] },
      React.createElement(GameMatchingPage)))
  })
  // 진입 자체가 서버 검증(get_current_room)을 통과해야 열린다 — 그때 store도 최신 설정이 된다.
  await waitFor(() => {
    assert.ok(view.container.querySelector("button[aria-label='방 설정 변경']"),
      "방장에게 설정 편집 진입이 열리지 않았다")
    assert.equal(useMatchingStore.getState().settingsVersion, 2, "최신 설정이 아직 도착하지 않았다")
  })
  return view
}

/** 지금 열려 있는 편집 패널의 두 탭을 돌며 정상값과 관전자 항목 부재를 함께 확인한다. */
async function assertEditPanelShowsCleanSettings(container, where) {
  // (1) 일반 탭 — 관전자 항목 0, 정상 정원, 편집 대상이 아닌 D-12 세 항목 0.
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

  // (2) 역할 구성 — 인원 행은 정상 4역할뿐이고, 값도 서버 저장값 그대로다.
  assert.deepEqual(
    roleCompositionRowLabels(container),
    ["광대 인원", "의사 인원", "경비원 인원", "마녀사냥꾼 인원"],
    `${where}: 역할 구성 행 목록이 정상 4역할과 다르다`,
  )
  assert.equal(stepperValue(container, "광대 인원"), "2명")
  assert.equal(stepperValue(container, "의사 인원"), "1명")
  assert.equal(stepperValue(container, "경비원 인원"), "0명")
  assert.equal(stepperValue(container, "마녀사냥꾼 인원"), "0명")

  // (3) 회의&투표 탭 — 지정된 밤 시간 override와 폴백이 각각 제 값으로 보인다.
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

/**
 * F-23(AC-01/AC-03): **실제 대기방 화면**에서 오염된 저장 설정을 열고 저장하고 다시 연다.
 *
 * 앞의 시험들은 공용 변환기와 훅까지만 이었다. 그 경로가 깨끗해도 페이지가 다른 값을
 * 패널에 넘기거나 패널이 원본을 다시 읽으면 방장이 보는 화면에는 관전자 항목이 되살아난다.
 * 여기서는 GameMatchingPage → useMatchingPage → GameSetupPanel을 실제로 마운트해
 * 진입 → 화면 값 → 실제 저장 클릭 → 재열기를 한 경로로 잇고, 그 저장이 값이 같은 저장이므로
 * 버전·준비까지 보존되는지 함께 본다.
 */
test("F-23(AC-01/AC-03) · 실제 대기방 화면의 설정 열기·저장·재열기 어디에도 관전자 항목이 없다", async () => {
  const { room, joinerSocket } = await setupCustomRoomWithReadyJoiner("host-page", "guest-page")
  seedContaminatedSettings(room.roomId)

  const { container } = await mountMatchingPage()

  // 편집을 열기 전의 대기방 화면(요약 패널 포함)에도 관전 진입·문구가 없다.
  assert.equal(container.textContent.includes("관전"), false, "대기방 화면에 관전 문구가 있다")
  assert.equal(container.querySelector("button[aria-label='설정 저장']"), null,
    "전제: 편집 패널은 아직 닫혀 있어야 한다")
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "조회 뒤 store 설정")

  // ① 실제 진입 버튼으로 편집 패널을 연다.
  await act(async () => { container.querySelector("button[aria-label='방 설정 변경']").click() })
  assert.ok(container.querySelector("button[aria-label='설정 저장']"), "설정 패널이 열리지 않았다")
  await assertEditPanelShowsCleanSettings(container, "처음 열기")

  // ② 값을 하나도 바꾸지 않고 **실제 저장 버튼**을 누른다.
  const versionBefore = useMatchingStore.getState().settingsVersion
  const readyBefore = [...rawStoredRoom(room.roomId).players]
    .map(([uuid, player]) => [uuid, player.isReady, player.readyRevision])
  assert.ok(readyBefore.every(([, isReady]) => isReady === true), "전제: 전원이 준비 상태여야 한다")
  const receiptsBefore = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).length
  const joinerReceiptsBefore = joinerSocket.countReceived(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED)

  await act(async () => { container.querySelector("button[aria-label='설정 저장']").click() })
  assert.deepEqual(alerts, [], alerts.join(" / "))

  // 화면이 실제로 보낸 요청과 서버 저장값 어디에도 폐기 키가 없다.
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
  // 값이 같은 저장이므로 버전·준비·방송은 전부 그대로다(정제만 일어난다).
  assert.equal(stored.settingsVersion, versionBefore, "정제만으로 설정 버전이 올랐다")
  assert.deepEqual(
    [...stored.players].map(([uuid, player]) => [uuid, player.isReady, player.readyRevision]),
    readyBefore, "화면에서 연 동일값 저장이 준비 상태를 건드렸다",
  )
  assert.equal(clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED).length, receiptsBefore,
    "동일값 저장이 설정 변경 사건을 방장 화면에 전달했다")
  assert.equal(joinerSocket.countReceived(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED), joinerReceiptsBefore,
    "동일값 저장이 설정 변경 사건을 참가자에게 전달했다")

  // ③ 저장이 성공했으므로 패널이 닫히고, 대기방 화면에는 여전히 관전 문구가 없다.
  await waitFor(() => assert.equal(container.querySelector("button[aria-label='설정 저장']"), null,
    "저장 성공인데 편집 패널이 닫히지 않았다"))
  assert.equal(container.textContent.includes("관전"), false, "저장 뒤 대기방 화면에 관전 문구가 생겼다")

  // ④ **다시 열어도** 같은 화면이다 — 저장·재열기 과정에서 폐기 키가 되살아나지 않는다.
  await act(async () => { container.querySelector("button[aria-label='방 설정 변경']").click() })
  assert.ok(container.querySelector("button[aria-label='설정 저장']"), "설정 패널이 다시 열리지 않았다")
  await assertEditPanelShowsCleanSettings(container, "재열기")
  assertNoSpectatorKeys(useMatchingStore.getState().settings, "재열기 시점의 store 설정")
})

/**
 * F-23(SPLIT-2): 연결이 교체되면 **옛 소켓으로 도착한 사건은 새 연결의 화면에 닿지 않는다.**
 *
 * 예전 대역은 listener를 전역 Map 하나에 모으고 subscribeSocket이 아무 일도 하지 않았다 —
 * 그 구조에서는 소켓을 바꿔도 훅이 알지 못하고, 옛 소켓으로 보낸 사건이 그대로 배달되므로
 * 이 계약을 시험으로 재현할 수 없었다. 여기서는 구독을 소켓별로 나누고 교체를 실제로 통지한다.
 */
test("F-23(SPLIT-2) · 연결이 교체되면 옛 소켓의 오염된 설정 사건은 화면에 닿지 않고 새 연결만 동작한다", async () => {
  const { io, serverSocket, room } = await setupCustomRoomWithReadyJoiner("host-swap", "guest-swap")
  const firstSocket = socketState.socket

  const { result } = renderHook(() => useMatchingRoom(roomCallbacks))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(result.current.isRoomVerified, true, "방 검증이 끝나지 않았다")
  assert.ok(firstSocket.handlerCountOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED) > 0,
    "전제: 첫 연결에 설정 사건 구독이 붙어야 한다")

  // 재연결 — 같은 계정의 새 소켓으로 갈아끼우고 구독자에게 알린다.
  const secondSocket = createBridgedSocket(io, serverSocket, "host-swap")
  await act(async () => {
    setTestSocket(secondSocket)
    await Promise.resolve(); await Promise.resolve()
  })
  assert.equal(firstSocket.handlerCountOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED), 0,
    "옛 연결의 구독이 해제되지 않았다")
  assert.ok(secondSocket.handlerCountOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED) > 0,
    "새 연결에 구독이 붙지 않았다")

  const versionBefore = useMatchingStore.getState().settingsVersion

  // ① 옛 소켓으로 도착한 **더 높은 버전**의 오염 사건. 버전만 보면 통과할 값이고, 이 화면의
  //    구독이 옛 연결에 남아 있었다면 그대로 적용돼 설정과 폐기 키를 함께 심었을 것이다.
  //
  //    (matchingStore는 받은 설정을 보관할 뿐 독립 정제기가 아니다 — A-02. 그래서 여기서
  //    확인하는 것은 "임의 오염 객체가 정제된다"가 아니라 **그 사건이 아예 닿지 않는다**이다.
  //    정제 경계의 증거는 아래 ②의 실제 서버 방송이 맡는다.)
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

  // ② 새 연결은 정상 동작한다 — 저장 요청은 새 소켓으로만 나가고, 그 저장이 만든 **실제 서버
  //    방송**은 새 연결의 구독에 닿아 store까지 반영된다(전달 경로 자체가 끊긴 것이 아니다).
  //    그 방송은 서버의 허용 목록으로 다시 조립된 값이라 폐기 키가 0이어야 한다.
  const beforeOnOldSocket = firstSocket.requestsOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).length
  const receiptsBefore = clientReceiptsOf(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, secondSocket).length
  seedContaminatedSettings(room.roomId) // 저장 직전의 저장값에 옛 오염이 남아 있는 상황
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
})
