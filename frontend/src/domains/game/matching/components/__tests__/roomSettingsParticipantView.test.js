/**
 * F-20 AC-03: 방장이 실제로 편집·저장한 설정이 **비방장 참가자의 화면**과 공개 목록 행까지
 * 이어지는지를 한 경로로 고정한다.
 *
 * 응답 객체를 읽어 보는 것으로는 "참가자가 그 값을 실제로 볼 수 있는가"를 말할 수 없다.
 * 이 시험은 다음을 전부 실제 코드로 잇는다:
 *
 *   방장의 실제 스테퍼·체크박스·역할 구성 클릭(jsdom, 실제 GameSetupPanel)
 *     → buildUpdateRoomSettingsPayload
 *     → 실제 백엔드 handleUpdateRoomSettings
 *     → 서버가 **참가자 소켓에 실제로 emit한** room_settings_updated 사건
 *     → 실제 useMatchingRoom 구독 → 실제 matchingStore
 *     → 실제 RoomSettingsSummaryPanel DOM (비방장이 읽는 화면)
 *     → 실제 get_public_rooms → 실제 RoomListRow DOM
 *
 * 소켓은 모듈 목업이 아니라 실제 socketClient.setSocket으로 대역 인스턴스를 꽂는다 —
 * 그래서 이 파일은 `--experimental-test-module-mocks` 없이 그대로 돈다.
 */
import test from "node:test"
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
  "../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const { render, act, cleanup, renderHook } = await import("@testing-library/react")
const { default: GameSetupPanel } = await import("../../../setup/components/GameSetupPanel.jsx")
const { default: RoomSettingsSummaryPanel } = await import("../RoomSettingsSummaryPanel.jsx")
const { default: RoomListRow } = await import("../../../mode/components/roomList/RoomListRow.jsx")
const { buildRoomSettingsFormState, buildUpdateRoomSettingsPayload } =
  await import("../../../setup/utils/roomSettingsForm.js")
const { SOCKET_EVENTS } = await import("../../../setup/constants/gameSetupSocket.js")
const { setSocket } = await import("../../../../../shared/socket/socketClient.js")
const { useMatchingStore } = await import("../../store/matchingStore.js")
const { useAuthStore } = await import("../../../../auth/store/auth.store.js")
const { useMatchingRoom } = await import("../../hooks/useMatchingRoom.js")

const { default: matchmaking } =
  await import("../../../../../../../backend/socket/matchmaking.js")
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
const { handleCreateRoom, handleJoinRoomByCode, handleUpdateRoomSettings, handleGetCurrentRoom, handleGetPublicRooms } =
  matchmaking.__testables

/** 방장 + 비방장 참가자 한 명으로 실제 방을 만든다. */
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

/** 비방장 참가자의 실제 대기방 훅을 마운트하고 서버가 준 현재 방으로 검증을 끝낸다. */
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
  const rendered = renderHook(() => useMatchingRoom({ onRoomDeleted: () => {}, onGameStarted: () => {} }))
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  assert.equal(rendered.result.current.isRoomVerified, true, "참가자 방 검증이 끝나지 않았다")
  assert.equal(useMatchingStore.getState().hostUuid, "host-a")
  assert.notEqual(useMatchingStore.getState().hostUuid, "p1", "이 시험의 전제는 비방장 참가자다")
  return { socket, ...rendered }
}

/** store가 들고 있는 서버 확정 설정을 실제 표시 패널로 그린다(GameMatchingPage와 같은 연결). */
async function renderSummaryFromStore() {
  const { accessType, settings } = useMatchingStore.getState()
  let container
  await act(async () => {
    ;({ container } = render(React.createElement(RoomSettingsSummaryPanel, {
      visible: true, accessType, settings,
    })))
  })
  return container
}

test.afterEach(() => {
  cleanup()
  setSocket(null)
  useMatchingStore.getState().clearRoom()
})

test("AC-03 · 방장이 두 탭과 직접 지정 구성을 편집·저장하면 비방장 참가자 화면과 공개 목록에 그대로 나타난다", async () => {
  const { io, hostSocket, guestSocket, room } = await createRoomWithParticipant({
    maxPlayers: 8, jokerCount: 2, nightActionTime: 90,
  })

  // 참가자는 저장 **이전**의 방을 보고 있다.
  const before = await new Promise((resolve) => handleGetCurrentRoom("p1", resolve))
  const { socket: clientSocket } = await mountParticipantRoom(before.room)
  const beforeDom = await renderSummaryFromStore()
  assert.ok(beforeDom.textContent.includes("공개 참가"), beforeDom.textContent)
  assert.ok(beforeDom.textContent.includes("8명"), beforeDom.textContent)
  // 여기서 전역 cleanup을 부르면 참가자 훅까지 함께 언마운트돼 이후 사건을 받지 못한다 —
  // 각 트리는 자기 container로만 조회하므로 남겨 둔다.

  // ── 방장의 실제 편집 ────────────────────────────────────────────────────
  const hostCurrent = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  const formState = buildRoomSettingsFormState({
    accessType: hostCurrent.room.accessType, settings: hostCurrent.room.settings,
  })
  assert.equal(formState.ok, true, formState.code)
  const { container, getSubmitted } = await mountPanel(formState)

  // 일반 탭: 입장 방식 → 코드, 정원 8 → 6, 역할 구성 자동 → 직접 지정(의사 1명 추가).
  await clickByAriaLabel(container, "코드로만 참가")
  await clickByAriaLabel(container, "최대 플레이어 수 감소")
  await clickByAriaLabel(container, "최대 플레이어 수 감소")
  await clickByAriaLabel(container, "역할 구성 증가") // 자동 → 직접 지정
  await clickByAriaLabel(container, "의사 인원 증가")

  // 회의&투표 탭: 토론 60 → 90, 밤 90 → 60, 광대 밤 시간만 따로 30초로.
  await clickTab(container, "회의&투표")
  await clickByAriaLabel(container, "낮 토론 시간 조절 증가")
  await clickByAriaLabel(container, "밤 행동 시간 조절 감소")
  await clickByAriaLabel(container, "광대 밤 시간 조절 감소")
  await clickByAriaLabel(container, "광대 밤 시간 조절 감소")
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

  // ── 서버가 참가자 소켓에 실제로 보낸 사건을 그대로 클라이언트 훅에 전달한다 ──
  const broadcast = guestSocket.emitted
    .slice(guestEmitsBefore)
    .find((entry) => entry.event === SOCKET_EVENTS.ROOM_SETTINGS_UPDATED)
  assert.ok(broadcast, "서버가 참가자에게 설정 변경 사건을 보내지 않았다")
  await act(async () => { clientSocket.trigger(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, broadcast.payload) })

  const stored = useMatchingStore.getState()
  assert.equal(stored.accessType, "code")
  assert.equal(stored.settings.maxPlayers, 6)

  // ── 비방장 참가자가 실제로 읽는 화면 ────────────────────────────────────
  const summary = await renderSummaryFromStore()
  const text = summary.textContent
  assert.ok(text.includes("코드로만 참가"), `입장 방식이 없다: ${text}`)
  assert.ok(text.includes("6명"), `정원이 없다: ${text}`)
  assert.ok(text.includes("광대 2"), `직업 구성이 없다: ${text}`)
  assert.ok(text.includes("의사 1"), `직접 지정한 직업 인원이 없다: ${text}`)
  assert.ok(text.includes("토론 90초"), `토론 시간이 없다: ${text}`)
  assert.ok(text.includes("투표 60초"), `투표 시간이 없다: ${text}`)
  assert.ok(text.includes("밤 60초"), `밤 시간이 없다: ${text}`)
  assert.ok(text.includes("광대 밤 30초"), `직업별 밤 시간이 없다: ${text}`)
  assert.ok(summary.querySelector("[aria-label='현재 방 설정']"), "읽기용 이름이 없다")

  // 참가자 화면에 새어 나가면 안 되는 것들.
  assert.equal(text.includes(room.roomCode), false, "방 코드가 설정 표시에 새어 나갔다")
  assert.equal(/버전|settingsVersion/.test(text), false, "내부 버전 카운터가 화면에 노출됐다")
  assert.equal(text.includes("host-a") || text.includes("p1"), false, "참가자 신원이 설정 표시에 섞였다")

  // ── 같은 저장이 공개 목록 행에도 그대로 나타난다 ────────────────────────
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
  assert.ok(rowText.includes("광대 밤 30초"), `목록 행에 직업별 밤 시간이 없다: ${rowText}`)
})

test("AC-03 · 실제 대기 페이지가 useMatchingPage의 서버 확정 설정을 그 패널에 연결한다", async () => {
  // 이 배선만 실제 페이지를 렌더해 확인하지 못한다: GameMatchingPage는 친구 패널을 거쳐
  // shared/env.js(import.meta.env)에 닿는데, 그 경계를 갈아끼우려면 mock.module이 필요하고
  // 이 실행기는 --experimental-test-module-mocks를 켜지 못한다(공식 npm test에는 있다).
  // 그래서 페이지 **소스**에서 배선 자체를 고정한다 — 값의 흐름은 위 시험이 실제 DOM으로
  // 이미 확인했고, 여기서 확인할 것은 "페이지가 그 값을 패널에 넘기는가" 하나다.
  const { readFileSync } = await import("node:fs")
  const { fileURLToPath } = await import("node:url")
  const pagePath = fileURLToPath(new URL("../../pages/GameMatchingPage.jsx", import.meta.url))
  const source = readFileSync(pagePath, "utf8")

  assert.ok(/import\s+RoomSettingsSummaryPanel\s+from/.test(source),
    "대기 페이지가 현재 설정 패널을 불러오지 않는다")
  // useMatchingPage가 돌려주는 서버 확정 값을 실제로 꺼내 쓴다.
  assert.ok(/\broomSettings,/.test(source), "페이지가 roomSettings를 받지 않는다")
  assert.ok(/\broomAccessType,/.test(source), "페이지가 roomAccessType을 받지 않는다")
  assert.ok(/<RoomSettingsSummaryPanel[\s\S]*?settings=\{roomSettings\}/.test(source),
    "페이지가 서버 확정 설정을 패널에 넘기지 않는다")
  assert.ok(/<RoomSettingsSummaryPanel[\s\S]*?accessType=\{roomAccessType\}/.test(source),
    "페이지가 입장 방식을 패널에 넘기지 않는다")
  // 내부 버전 카운터는 표시 경로에 넘기지 않는다(참가자 화면의 진단값 노출 금지).
  assert.equal(/<RoomSettingsSummaryPanel[\s\S]*?settingsVersion=/.test(source), false,
    "내부 설정 버전이 표시 패널로 넘어간다")
})

test("AC-03 · 서버 설정을 아직 확보하지 못했으면 기본값을 지어내지 않고 아무것도 그리지 않는다", async () => {
  let container
  await act(async () => {
    ;({ container } = render(React.createElement(RoomSettingsSummaryPanel, {
      visible: true, accessType: null, settings: null,
    })))
  })
  assert.equal(container.textContent.trim(), "",
    "서버 설정이 없는데 화면이 값을 지어냈다")
})
