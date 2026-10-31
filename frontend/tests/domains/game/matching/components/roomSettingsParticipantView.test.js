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
installDomGlobal("alert", () => {})
installDomGlobal("confirm", () => false)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

register(new URL(
  "../../../../helpers/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

mock.module("../../../../../src/shared/env.js", {
  namedExports: { API_BASE_URL: "http://localhost:4000", DISCORD_SUPPORT_URL: undefined },
})
const rejectNetwork = async () => { throw new Error("Unexpected HTTP call in room settings test") }
mock.module("../../../../../src/shared/api/client.js", {
  namedExports: {
    api: { get: rejectNetwork, post: rejectNetwork, put: rejectNetwork, patch: rejectNetwork, delete: rejectNetwork },
    apiClient: rejectNetwork,
    refreshAccessToken: rejectNetwork,
  },
})
const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { MemoryRouter } = await import("react-router-dom")
const { default: GameMatchingPage } = await import("../../../../../src/domains/game/matching/pages/GameMatchingPage.jsx")
let participantPageView = null
const { default: GameSetupPanel } = await import("../../../../../src/domains/game/setup/components/GameSetupPanel.jsx")
const { default: RoomListRow } = await import("../../../../../src/domains/game/mode/components/roomList/RoomListRow.jsx")
const { buildRoomSettingsFormState, buildUpdateRoomSettingsPayload } =
  await import("../../../../../src/domains/game/setup/utils/roomSettingsForm.js")
const { SOCKET_EVENTS } = await import("../../../../../src/domains/game/setup/constants/gameSetupSocket.js")
const { setSocket } = await import("../../../../../src/shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../../../../src/domains/game/matching/store/matchingStore.js")
const { useAuthStore } = await import("../../../../../src/domains/auth/store/auth.store.js")


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
const { handleCreateRoom, handleJoinRoomByCode, handleUpdateRoomSettings, handleGetCurrentRoom, handleGetPublicRooms } =
  matchmaking.__testables

async function createRoomWithParticipant(settingsOverrides) {
  matchmaking.__resetStateForTests()
  const io = createFakeIo([])
  const hostSocket = createFakeSocket("host-a")
  io.sockets.sockets.set(hostSocket.id, hostSocket)
  const created = await new Promise((resolve) =>
    handleCreateRoom(io, hostSocket, "host-a", validSettingsPayload(settingsOverrides), resolve))
  assert.equal(created.ok, true, created.message)

  const guestSocket = createFakeSocket("p1")
  io.sockets.sockets.set(guestSocket.id, guestSocket)
  await handleJoinRoomByCode(io, guestSocket, "p1", created.room.roomCode)
  return { io, hostSocket, guestSocket, room: created.room }
}

async function mountPanel(initialFormState) {
  let submitted = null
  let container
  await act(async () => {
    ;({ container } = render(React.createElement(GameSetupPanel, {
      visible: true,
      mode: "edit",
      initialFormState,
      formResetKey: "r1",
      isCreating: false,
      onCreateGame: (state) => { submitted = state },
    })))
  })
  return { container, getSubmitted: () => submitted }
}

async function clickTab(container, label) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label)
  assert.ok(button, `${label} 탭 버튼이 없다`)
  await act(async () => { button.click() })
}

async function clickByAriaLabel(container, ariaLabel) {
  const button = container.querySelector(`button[aria-label='${ariaLabel}']`)
  assert.ok(button, `${ariaLabel} 버튼이 없다`)
  assert.equal(button.disabled, false, `${ariaLabel} 버튼이 비활성이다`)
  await act(async () => { button.click() })
}

async function mountParticipantRoom(currentRoom) {
  useMatchingStore.getState().clearRoom()
  useAuthStore.setState({ user: { uuid: "p1" }, isLoggedIn: true })

  const listeners = new Map()
  const socket = {
    id: "sock-p1-client", connected: true,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) { listeners.get(event)?.delete(handler) },
    trigger(event, payload) { for (const h of [...(listeners.get(event) ?? [])]) h(payload) },
    emit() {},
    timeout() { return socket },
    async emitWithAck(event) {
      if (event === "get_current_room") return { ok: true, room: currentRoom }
      return { ok: true }
    },
  }
  setSocket(socket)
  await act(async () => {
    participantPageView = render(React.createElement(MemoryRouter, { initialEntries: ["/matching"] },
      React.createElement(GameMatchingPage)))
  })
  await waitFor(() => {
    assert.equal(useMatchingStore.getState().hostUuid, "host-a")
    assert.ok(useMatchingStore.getState().settings, "참가자 store에 서버 설정이 없다")
  })
  assert.equal(participantPageView.container.querySelector("[aria-label='현재 방 설정']"), null,
    "대기 페이지에 읽기 전용 설정 UI가 남아 있다")
  assert.equal(participantPageView.container.querySelector("[aria-label='방 설정 변경']"), null,
    "비방장에게 설정 편집 버튼이 노출됐다")
  assert.notEqual(useMatchingStore.getState().hostUuid, "p1", "이 시험의 전제는 비방장 참가자다")
  return { socket, view: participantPageView }
}

test.afterEach(() => {
  cleanup()
  participantPageView = null
  setSocket(null)
  useMatchingStore.getState().clearRoom()
})

test("AC-03 · 방장이 두 탭과 직접 지정 구성을 편집·저장하면 비방장 store와 공개 목록에 그대로 나타난다", async () => {
  const { io, hostSocket, guestSocket, room } = await createRoomWithParticipant({
    maxPlayers: 8, jokerCount: 2, nightActionTime: 90,
  })

  const before = await new Promise((resolve) => handleGetCurrentRoom("p1", resolve))
  const { socket: clientSocket } = await mountParticipantRoom(before.room)
  const beforeStore = useMatchingStore.getState()
  assert.equal(beforeStore.accessType, "open")
  assert.equal(beforeStore.settings.maxPlayers, 8)
  const hostCurrent = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  const formState = buildRoomSettingsFormState({
    accessType: hostCurrent.room.accessType, settings: hostCurrent.room.settings,
  })
  assert.equal(formState.ok, true, formState.code)
  const { container, getSubmitted } = await mountPanel(formState)

  await clickByAriaLabel(container, "코드로만 참가")
  await clickByAriaLabel(container, "최대 플레이어 수 감소")
  await clickByAriaLabel(container, "최대 플레이어 수 감소")
  await clickByAriaLabel(container, "역할 구성 증가")
  await clickByAriaLabel(container, "의사 인원 증가")

  await clickTab(container, "회의&투표")
  await clickByAriaLabel(container, "낮 토론 시간 조절 증가")
  await clickByAriaLabel(container, "밤 행동 시간 조절 감소")
  const jokerTimeRow = container.querySelector('[aria-label="광대 밤 시간 조절 감소"]').parentElement
  assert.ok(jokerTimeRow.textContent.includes("60초"), "미지정 광대 시간이 전체 밤 60초를 따라오지 않았다")
  await clickByAriaLabel(container, "광대 밤 시간 조절 감소")
  assert.ok(jokerTimeRow.textContent.includes("30초"), "광대 시간을 한 번 줄여 30초로 편집하지 못했다")
  await clickByAriaLabel(container, "설정 저장")

  assert.equal(getSubmitted()?.checks?.["private-lobby"], true,
    `체크박스 클릭이 폼 상태에 반영되지 않았다: ${JSON.stringify(getSubmitted()?.checks)}`)
  const payload = buildUpdateRoomSettingsPayload({
    ...getSubmitted(),
    roomId: room.roomId,
    requestId: "req-participant-view",
    expectedSettingsVersion: hostCurrent.room.settingsVersion,
  })
  assert.equal(payload.accessType, "code")
  assert.equal(payload.maxPlayers, 6)
  assert.equal(payload.roleCompositionMode, "custom")
  assert.deepEqual(payload.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.equal(payload.dayDiscussionTime, 90)
  assert.equal(payload.nightActionTime, 60)
  assert.deepEqual(payload.roleNightActionTimes, { JOKER: 30 })

  const guestEmitsBefore = guestSocket.emitted.length
  const saved = await new Promise((resolve) =>
    handleUpdateRoomSettings(io, hostSocket, "host-a", payload, resolve))
  assert.equal(saved.ok, true, saved.message)
  assert.equal(saved.changed, true)

  const broadcast = guestSocket.emitted
    .slice(guestEmitsBefore)
    .find((entry) => entry.event === SOCKET_EVENTS.ROOM_SETTINGS_UPDATED)
  assert.ok(broadcast, "서버가 참가자에게 설정 변경 사건을 보내지 않았다")
  await act(async () => { clientSocket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, broadcast.payload) })

  const stored = useMatchingStore.getState()
  assert.equal(stored.accessType, "code")
  assert.equal(stored.settings.maxPlayers, 6)
  assert.equal(stored.settings.roleCompositionMode, "custom")
  assert.deepEqual(stored.settings.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.equal(stored.settings.dayDiscussionTime, 90)
  assert.equal(stored.settings.nightActionTime, 60)
  assert.deepEqual(stored.settings.roleNightActionTimes, { JOKER: 30 })
  assert.equal(participantPageView.container.querySelector("[aria-label='현재 방 설정']"), null,
    "서버 방송 뒤에도 읽기 전용 설정 UI가 나타나면 안 된다")

  const list = await new Promise((resolve) => handleGetPublicRooms(resolve))
  const listed = list.rooms.find((entry) => entry.id === room.roomId)
  assert.ok(listed, "저장한 방이 공개 목록에 없다")
  let rowContainer
  await act(async () => {
    ;({ container: rowContainer } = render(React.createElement(RoomListRow, {
      room: { ...listed, stage: 1, displayStatus: "waiting" },
      selected: false,
      onSelect: () => {},
    })))
  })
  const rowText = rowContainer.textContent
  assert.ok(rowText.includes("광대 2"), `목록 행에 직업 구성이 없다: ${rowText}`)
  assert.ok(rowText.includes("의사 1"), `목록 행에 직접 지정 구성이 없다: ${rowText}`)
  assert.ok(rowText.includes("토론 90초"), `목록 행에 토론 시간이 없다: ${rowText}`)
  assert.ok(rowText.includes("밤 60초"), `목록 행에 전체 밤 시간이 없다: ${rowText}`)
  assert.equal(rowText.includes("광대 밤"), false, "목록 행에 직업별 밤 시간이 남아 있다")
})

test("AC-03 · 대기 페이지에는 읽기 전용 현재 방 설정 UI를 그리지 않는다", async () => {
  const { readFileSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")
  const pagePath = fileURLToPath(new URL("../../../../../src/domains/game/matching/pages/GameMatchingPage.jsx", import.meta.url))
  const source = readFileSync(pagePath, "utf8")

  assert.equal(/import\s+RoomSettingsSummaryPanel\s+from/.test(source), false,
    "대기 페이지가 읽기 전용 설정 패널을 import한다")
  assert.equal(/<RoomSettingsSummaryPanel/.test(source), false,
    "대기 페이지가 읽기 전용 설정 패널을 그린다")
  assert.equal(/aria-label="현재 방 설정"/.test(source), false,
    "대기 페이지에 현재 방 설정 UI가 남아 있다")
})
