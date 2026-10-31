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
const alerts = []
installDomGlobal("alert", (message) => alerts.push(message))
installDomGlobal("confirm", () => false)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL(
  "../../../../helpers/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

mock.module("../../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
const rejectNetwork = async () => { throw new Error("Unexpected HTTP call in room recovery test") }
mock.module("../../../../../src/shared/api/client.js", {
  namedExports: {
    api: { get: rejectNetwork, post: rejectNetwork, put: rejectNetwork, patch: rejectNetwork, delete: rejectNetwork },
    apiClient: rejectNetwork,
    refreshAccessToken: rejectNetwork,
  },
})
const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { default: GameMatchingPage } = await import("../../../../../src/domains/game/matching/pages/GameMatchingPage.jsx")
const { MemoryRouter } = await import("react-router-dom")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")
const { SOCKET_EVENTS, ROOM_SETTINGS_ERROR_MESSAGES } =
  await import("../../../../../src/domains/game/setup/constants/gameSetupSocket.js")

const { default: matchmaking } =
  await import("../../../../../../backend/socket/matchmaking.js")
const { default: matchmakingFixtures } =
  await import("../../../../../../backend/tests/helpers/matchmakingFixtures.js")

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ nickname: `user-${uuid}` }) })
matchmaking.__setEconomyServiceForTests({
  getPublicProfileLoadouts: async (ids) =>
    Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
  getGameStartLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, {}])),
})
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const { createFakeSocket, createFakeIo, validSettingsPayload } = matchmakingFixtures
const { handleCreateRoom, handleJoinRoomByCode, handleUpdateRoomSettings, handleGetCurrentRoom } =
  matchmaking.__testables

const HOLD = Symbol("hold")

async function mountHost({ guestCount = 0, settings = {} } = {}) {
  matchmaking.__resetStateForTests()
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: { uuid: "host-a" }, isLoggedIn: true })
  alerts.length = 0

  const io = createFakeIo([])
  const serverSocket = createFakeSocket("host-a")
  io.sockets.sockets.set(serverSocket.id, serverSocket)
  const created = await new Promise((resolve) =>
    handleCreateRoom(io, serverSocket, "host-a", validSettingsPayload(settings), resolve))
  assert.equal(created.ok, true, created.message)

  for (let i = 0; i < guestCount; i += 1) {
    const guest = createFakeSocket(`guest-${i}`)
    io.sockets.sockets.set(guest.id, guest)
    await handleJoinRoomByCode(io, guest, `guest-${i}`, created.room.roomCode)
  }

  const listeners = new Map()
  const emittedToServer = []
  const holds = []
  const socket = {
    id: "sock-host-a-client",
    connected: true,
    holdSave: false,
    resultAnswer: null,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger(event, payload) { for (const h of [...(listeners.get(event) ?? [])]) h(payload) },
    emit() {},
    timeout() { return socket },
    emitWithAck(event, payload) {
      emittedToServer.push({ event, payload })
      if (event === "get_current_room") {
        return new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
      }
      if (event === SOCKET_EVENTS.UPDATE_ROOM_SETTINGS) {
        if (socket.holdSave) {
          return new Promise((resolve, reject) => holds.push({ event, resolve, reject }))
        }
        return new Promise((resolve) =>
          handleUpdateRoomSettings(io, serverSocket, "host-a", payload, resolve))
      }
      if (event === SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT) {
        if (socket.resultAnswer === HOLD) {
          return new Promise((resolve, reject) => holds.push({ event, resolve, reject }))
        }
        return Promise.resolve(socket.resultAnswer ?? { ok: true, status: "UNKNOWN" })
      }
      return Promise.resolve({ ok: true })
    },
    failHold(event) {
      const index = holds.findIndex((hold) => hold.event === event)
      assert.ok(index >= 0, `붙잡아 둔 ${event} 응답이 없다`)
      holds.splice(index, 1)[0].reject(new Error("operation has timed out"))
    },
    emittedToServer,
    lastOf(event) { return [...emittedToServer].reverse().find((entry) => entry.event === event) },
    countOf(event) { return emittedToServer.filter((entry) => entry.event === event).length },
  }
  setSocket(socket)

  let view
  await act(async () => {
    view = render(React.createElement(MemoryRouter, { initialEntries: ["/game-matching"] },
      React.createElement(GameMatchingPage)))
  })
  await act(async () => { await Promise.resolve(); await Promise.resolve() })

  await waitFor(() => assert.ok(view.container.querySelector('button[aria-label="방 설정 변경"]')))
  return { io, serverSocket, socket, room: created.room, container: view.container }
}

async function clickByLabel(container, ariaLabel) {
  const button = container.querySelector(`button[aria-label='${ariaLabel}']`)
  assert.ok(button, `${ariaLabel} 버튼이 없다`)
  assert.equal(button.disabled, false, `${ariaLabel} 버튼이 비활성이다`)
  await act(async () => { button.click(); await Promise.resolve(); await Promise.resolve() })
}

async function clickTab(container, label) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label)
  assert.ok(button, `${label} 탭 버튼이 없다`)
  await act(async () => { button.click() })
}

function readStepperRow(container, label) {
  const row = [...container.querySelectorAll("[data-setup-row]")]
    .find((node) => node.querySelector("p")?.textContent.trim() === label)
  assert.ok(row, `${label} 행이 없다`)
  return row.textContent.replace(label, "").trim()
}

test.afterEach(() => {
  cleanup()
  setSocket(null)
  useMatchingStore.getState().clearRoom()
  matchmaking.__resetStateForTests()
})

test("AC-03 · 같은 버전의 거부 응답으로 폼이 되맞춰지면 편집 의도도 함께 버려져, 다음 저장이 없던 직업별 override를 만들지 않는다", async () => {
  const { socket, container, room } = await mountHost({
    guestCount: 4, settings: { maxPlayers: 8, jokerCount: 1, nightActionTime: 90 },
  })
  assert.equal(room.settings.roleNightActionTimes, undefined, "전제: 서버에 직업별 지정이 없다")

  await clickByLabel(container, "방 설정 변경")

  await clickTab(container, "회의&투표")
  await clickByLabel(container, "광대 밤 시간 조절 감소")
  assert.equal(readStepperRow(container, "광대 밤 시간 조절"), "60초", "스테퍼 클릭이 화면에 반영되지 않았다")

  await clickTab(container, "일반")
  for (let i = 0; i < 4; i += 1) await clickByLabel(container, "최대 플레이어 수 감소")
  assert.equal(readStepperRow(container, "최대 플레이어 수"), "4")

  const versionBefore = useMatchingStore.getState().settingsVersion
  await clickByLabel(container, "설정 저장")

  const rejected = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  assert.equal(rejected.payload.maxPlayers, 4, "화면에서 내린 정원이 요청에 실리지 않았다")
  assert.equal(useMatchingStore.getState().settingsVersion, versionBefore,
    "전제가 깨졌다(거부인데 설정 버전이 올랐다)")
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 8, "거부된 정원이 저장됐다")

  assert.equal(readStepperRow(container, "최대 플레이어 수"), "8", "거부 응답이 폼 값을 되맞추지 않았다")
  await clickTab(container, "회의&투표")
  assert.equal(readStepperRow(container, "광대 밤 시간 조절"), "90초",
    "거부 응답이 직업별 밤 시간을 되맞추지 않았다")

  await clickByLabel(container, "낮 토론 시간 조절 증가")
  await clickByLabel(container, "설정 저장")

  const second = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  assert.equal(Object.hasOwn(second.payload, "roleNightActionTimes"), false,
    "되돌아간 폴백 값이 방장이 지정한 적 없는 직업별 override로 요청에 실렸다")

  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.equal(current.room.settings.roleNightActionTimes, undefined,
    "서버 저장에 없던 직업별 override가 생겼다")
  assert.equal(current.room.settings.dayDiscussionTime, 90, "실제로 바꾼 값은 저장돼야 한다")
})

test("AC-03 · 되맞춘 뒤 다시 지정한 직업별 밤 시간은 그대로 실리고, 무관한 방 사건은 편집을 버리지 않는다", async () => {
  const { socket, container } = await mountHost({
    guestCount: 4, settings: { maxPlayers: 8, jokerCount: 1, nightActionTime: 90 },
  })
  await clickByLabel(container, "방 설정 변경")

  await clickTab(container, "일반")
  for (let i = 0; i < 4; i += 1) await clickByLabel(container, "최대 플레이어 수 감소")
  await clickByLabel(container, "설정 저장")
  assert.equal(readStepperRow(container, "최대 플레이어 수"), "8")

  await clickTab(container, "회의&투표")
  await clickByLabel(container, "광대 밤 시간 조절 감소")
  assert.equal(readStepperRow(container, "광대 밤 시간 조절"), "60초")

  await act(async () => {
    socket.trigger("player_ready_changed", {
      uuid: "guest-0", isReady: true, canStart: false,
      roomId: useMatchingStore.getState().roomId,
      settingsVersion: useMatchingStore.getState().settingsVersion, readyRevision: 1,
    })
    await Promise.resolve()
  })
  assert.equal(readStepperRow(container, "광대 밤 시간 조절"), "60초",
    "무관한 방 사건이 편집 중인 값을 버렸다")

  await clickByLabel(container, "설정 저장")
  const saved = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
  assert.deepEqual(saved.payload.roleNightActionTimes, { JOKER: 60 },
    "되맞춘 뒤 실제로 지정한 직업별 밤 시간이 요청에서 사라졌다")

  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.deepEqual(current.room.settings.roleNightActionTimes, { JOKER: 60 })
})

test("AC-05 · 결과 확인까지 마쳤는데도 적용 여부를 모르면 대기 표시가 사라진 뒤에도 그 결론이 대기방에 남는다", async () => {
  const { socket, container } = await mountHost({ settings: { maxPlayers: 8, jokerCount: 1 } })
  const originalPageRoot = container.firstElementChild
  await clickByLabel(container, "방 설정 변경")

  socket.holdSave = true
  await clickTab(container, "일반")
  await clickByLabel(container, "최대 플레이어 수 감소")
  const savingClick = container.querySelector("button[aria-label='설정 저장']")
  await act(async () => { savingClick.click(); await Promise.resolve() })
  const sentRequestId = socket.lastOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS).payload.requestId
  assert.equal(typeof sentRequestId, "string")

  await act(async () => {
    socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
    await Promise.resolve(); await Promise.resolve()
  })

  assert.ok(container.querySelector("button[aria-label='설정 저장 결과 확인']"),
    "결과 확인 대기 표시가 없다")
  assert.equal(container.querySelector("button[aria-label='설정 저장']"), null,
    "결과 미확인 중에 편집 패널이 열린 채로 남았다")
  assert.equal(container.querySelector("[aria-label='설정 저장 결과 안내']"), null,
    "아직 확인도 하지 않았는데 최종 결론이 떴다")

  socket.holdSave = false
  socket.resultAnswer = { ok: true, status: "UNKNOWN" }
  await clickByLabel(container, "설정 저장 결과 확인")

  assert.deepEqual(socket.lastOf(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT).payload,
    { roomId: useMatchingStore.getState().roomId, requestId: sentRequestId },
    "결과 조회가 원래 요청의 식별자를 쓰지 않았다")
  assert.equal(socket.countOf(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS), 1,
    "결과를 모른다는 이유로 저장을 자동으로 다시 보냈다")

  assert.equal(container.querySelector("button[aria-label='설정 저장 결과 확인']"), null,
    "결과가 확정됐는데 대기 표시가 남았다")
  assert.equal(container.firstElementChild, originalPageRoot, "결과 확인 중 실제 페이지가 교체됐다")
  const notice = container.querySelector("[aria-label='설정 저장 결과 안내']")
  assert.ok(notice, "확인을 마쳤는데 결론이 화면 어디에도 남지 않았다")
  assert.equal(notice.getAttribute("role"), "alert")
  assert.ok(notice.textContent.includes(ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNRESOLVED),
    `안내 문구가 다르다: ${notice.textContent}`)
  for (const word of ["저장되었습니다", "저장에 실패", "요청 식별자", "UNKNOWN", "requestId"]) {
    assert.equal(notice.textContent.includes(word), false, `안내가 ${word}를 말한다`)
  }
})

test("AC-05 · 그 안내는 새 저장·닫기·소속 교체에서 각각 사라진다", async () => {
  const { socket, container } = await mountHost({ settings: { maxPlayers: 8, jokerCount: 1 } })

  async function raiseUnresolvedNotice() {
    await clickByLabel(container, "방 설정 변경")
    socket.holdSave = true
    await clickTab(container, "일반")
    await clickByLabel(container, "최대 플레이어 수 감소")
    const submit = container.querySelector("button[aria-label='설정 저장']")
    await act(async () => { submit.click(); await Promise.resolve() })
    await act(async () => {
      socket.failHold(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS)
      await Promise.resolve(); await Promise.resolve()
    })
    socket.holdSave = false
    socket.resultAnswer = { ok: true, status: "UNKNOWN" }
    await clickByLabel(container, "설정 저장 결과 확인")
    assert.ok(container.querySelector("[aria-label='설정 저장 결과 안내']"), "안내를 띄우지 못했다")
  }

  await raiseUnresolvedNotice()
  await clickByLabel(container, "설정 저장 결과 안내 닫기")
  assert.equal(container.querySelector("[aria-label='설정 저장 결과 안내']"), null,
    "닫아도 안내가 남았다")

  await raiseUnresolvedNotice()
  await clickByLabel(container, "방 설정 변경")
  await clickTab(container, "일반")
  await clickByLabel(container, "최대 플레이어 수 감소")
  await clickByLabel(container, "설정 저장")
  assert.equal(container.querySelector("[aria-label='설정 저장 결과 안내']"), null,
    "새 저장을 성공했는데 이전 요청의 미해결 안내가 남았다")
  assert.equal(useMatchingStore.getState().settings.maxPlayers, 7, "새 저장이 반영되지 않았다")

  await raiseUnresolvedNotice()
  await act(async () => {
    useMatchingStore.getState().setRoom({
      ...useMatchingStore.getState(), roomId: "room-other", roomCode: "ZZZZ99",
    })
    await Promise.resolve()
  })
  assert.equal(container.querySelector("[aria-label='설정 저장 결과 안내']"), null,
    "지난 소속의 미해결 안내가 새 소속 화면에 남았다")
})

test("AC-05 · 실제 대기 페이지가 그 안내를 대기 표시·편집 패널과 독립된 자리에 연결한다", async () => {
  const { readFileSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")
  const source = readFileSync(
    fileURLToPath(new URL("../../../../../src/domains/game/matching/pages/GameMatchingPage.jsx", import.meta.url)), "utf8")

  assert.ok(/import\s+RoomSettingsResultNotice\s+from/.test(source),
    "대기 페이지가 결과 안내를 불러오지 않는다")
  assert.ok(/\bsettingsResultNotice,/.test(source), "페이지가 settingsResultNotice를 받지 않는다")
  assert.ok(/\bdismissSettingsResultNotice,/.test(source), "페이지가 닫기 핸들러를 받지 않는다")
  assert.ok(/<RoomSettingsResultNotice[\s\S]*?message=\{settingsOpen \? null : settingsResultNotice\}/
    .test(source), "페이지가 편집 중에만 가리는 방식으로 안내를 연결하지 않는다")
  for (const [opener, name] of [
    ["{hasPendingSettingsResult ? (", "확인 대기"],
    ["{settingsOpen ? (", "편집 패널"],
  ]) {
    const start = source.indexOf(opener)
    assert.ok(start >= 0, `페이지에 ${name} 블록이 없다(전제가 깨졌다)`)
    const end = source.indexOf(") : null}", start)
    assert.ok(end > start, `${name} 블록의 끝을 찾지 못했다`)
    assert.equal(source.slice(start, end).includes("RoomSettingsResultNotice"), false,
      `결과 안내가 ${name} 블록 안에 갇혀 있다`)
  }
})
