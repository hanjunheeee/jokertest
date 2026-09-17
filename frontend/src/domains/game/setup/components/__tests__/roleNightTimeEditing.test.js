/**
 * F-20 AC-03: 직업별 밤 제한시간 편집의 **실제 DOM 증거**.
 *
 * 헬퍼에 손으로 만든 객체를 넣어 보는 것으로는 "화면에서 실제로 바꾼 값이 요청에 실리는가"를
 * 말할 수 없다. 이 시험은 한 경로를 끝까지 잇는다:
 *
 *   실제 스테퍼 클릭(jsdom) → GameSetupPanel 제출 → buildUpdateRoomSettingsPayload
 *   → 실제 백엔드 handleUpdateRoomSettings → get_current_room(참가자 응답)
 *   → get_public_rooms(공개 목록) → 실제 RoomListRow가 그린 DOM
 *
 * 소켓 모듈 목업(mock.module)을 쓰지 않는다 — 이 경로에는 소켓 훅이 없다. 그래서 이 파일은
 * `--experimental-test-module-mocks` 없이도 그대로 돈다.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { register } from "node:module"
import { JSDOM } from "jsdom"
import React from "react"

// backend/socket/matchmaking.js가 require 시점에 끌고 오는 models가 파싱 가능한 DATABASE_URL을
// 요구한다(이 저장소 시험의 공통 관례 — 값은 .env.test와 같고 실제 연결은 하지 않는다).
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

register(new URL(
  "../../../ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const { render, act, cleanup } = await import("@testing-library/react")
const { default: GameSetupPanel } = await import("../GameSetupPanel.jsx")
const { default: RoomListRow } = await import("../../../mode/components/roomList/RoomListRow.jsx")
const { buildRoomSettingsFormState, buildUpdateRoomSettingsPayload } =
  await import("../../utils/roomSettingsForm.js")

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
// 방 소멸 시 fire-and-forget으로 도는 초대 정리는 실제 MySQL을 요구한다 — 대역으로만 흐르게 한다.
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const { createFakeSocket, createFakeIo, validSettingsPayload } = matchmakingFixtures
const { handleCreateRoom, handleUpdateRoomSettings, handleGetCurrentRoom, handleGetPublicRooms } =
  matchmaking.__testables

/** host 한 명으로 방을 실제로 만든다. */
async function createRoom(settingsOverrides) {
  matchmaking.__resetStateForTests()
  const io = createFakeIo([])
  const hostSocket = createFakeSocket("host-a")
  io.sockets.sockets.set(hostSocket.id, hostSocket)
  const created = await new Promise((resolve) =>
    handleCreateRoom(io, hostSocket, "host-a", validSettingsPayload(settingsOverrides), resolve))
  assert.equal(created.ok, true, created.message)
  return { io, hostSocket, room: created.room }
}

/** 실제 패널을 마운트하고 제출 콜백이 받은 폼 상태를 돌려준다. */
async function mountPanel({ mode, initialFormState }) {
  let submitted = null
  let container
  await act(async () => {
    ;({ container } = render(React.createElement(GameSetupPanel, {
      visible: true,
      mode,
      initialFormState,
      formResetKey: "r1",
      isCreating: false,
      onCreateGame: (state) => { submitted = state },
    })))
  })
  return { container, getSubmitted: () => submitted }
}

/** 탭 라벨로 실제 탭 버튼을 눌러 화면을 전환한다. */
async function clickTab(container, label) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label)
  assert.ok(button, `${label} 탭 버튼이 없다`)
  await act(async () => { button.click() })
}

/** aria-label로 스테퍼 화살표를 눌러 값을 한 칸 옮긴다. */
async function clickStepper(container, ariaLabel) {
  const button = container.querySelector(`button[aria-label='${ariaLabel}']`)
  assert.ok(button, `${ariaLabel} 버튼이 없다`)
  assert.equal(button.disabled, false, `${ariaLabel} 버튼이 비활성이다`)
  await act(async () => { button.click() })
}

async function clickSubmit(container, ariaLabel) {
  const submit = container.querySelector(`button[aria-label='${ariaLabel}']`)
  assert.ok(submit, `${ariaLabel} 버튼이 없다`)
  await act(async () => { submit.click() })
}

test.afterEach(() => { cleanup() })

test("AC-03 · 편집을 열고 그대로 저장하면 서버의 부분 지정이 그대로 유지된다", async () => {
  // 서버에는 GUARD 하나만 지정돼 있다(나머지 직업은 전체 밤 시간으로 폴백한다).
  const { room } = await createRoom({ nightActionTime: 90, roleNightActionTimes: { GUARD: 120 } })
  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })
  assert.equal(formState.ok, true, formState.code)
  assert.deepEqual(formState.specifiedRoleNightActionTimes, ["GUARD"])

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")
  await clickSubmit(container, "설정 저장")

  const submitted = getSubmitted()
  assert.ok(submitted, "제출 콜백이 폼 상태를 넘기지 않았다")
  assert.deepEqual(submitted.specifiedRoleNightActionTimes, ["GUARD"],
    "아무것도 건드리지 않았는데 지정 목록이 바뀌었다")

  const payload = buildUpdateRoomSettingsPayload({
    ...submitted, roomId: room.roomId, requestId: "req-untouched", expectedSettingsVersion: 1,
  })
  assert.deepEqual(payload.roleNightActionTimes, { GUARD: 120 },
    "열고 그대로 저장했을 뿐인데 없던 직업별 override가 생겼다")
})

test("AC-03 · 지정돼 있지 않던 직업의 밤 시간을 실제로 바꾸면 그 값이 요청·저장·참가자 응답·공개 목록·목록 행까지 이어진다", async () => {
  const { io, hostSocket, room } = await createRoom({
    maxPlayers: 8, jokerCount: 2, nightActionTime: 90, roleNightActionTimes: { GUARD: 120 },
  })
  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })
  assert.equal(formState.ok, true, formState.code)
  // JOKER는 서버 지정 목록에 없다 — 화면에는 전체 밤 시간과 같은 기본값으로 보인다.
  assert.equal(formState.specifiedRoleNightActionTimes.includes("JOKER"), false)

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")

  // 실제 화살표를 눌러 광대 밤 시간을 90 → 60으로 내린다(step 30).
  await clickStepper(container, "광대 밤 시간 조절 감소")
  assert.ok(container.textContent.includes("60초"), "스테퍼 클릭이 화면 값에 반영되지 않았다")

  await clickSubmit(container, "설정 저장")
  const submitted = getSubmitted()
  assert.ok(submitted, "제출 콜백이 폼 상태를 넘기지 않았다")
  // 정의 순서(JOKER·DOCTOR·GUARD·WITCH_HUNTER)대로, 원래 지정 + 이번에 바꾼 직업만 실린다.
  assert.deepEqual(submitted.specifiedRoleNightActionTimes, ["JOKER", "GUARD"],
    "화면에서 바꾼 직업이 지정 목록에 들어가지 않았다")
  assert.equal(submitted.ranges["night-action-time-joker"], 60)

  const payload = buildUpdateRoomSettingsPayload({
    ...submitted, roomId: room.roomId, requestId: "req-edited-joker", expectedSettingsVersion: 1,
  })
  assert.deepEqual(payload.roleNightActionTimes, { JOKER: 60, GUARD: 120 })

  // 실제 서버 핸들러가 이 요청을 받아들이고 저장한다.
  const saved = await new Promise((resolve) =>
    handleUpdateRoomSettings(io, hostSocket, "host-a", payload, resolve))
  assert.equal(saved.ok, true, saved.message)
  assert.equal(saved.changed, true)

  // 참가자 응답.
  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.deepEqual(current.room.settings.roleNightActionTimes, { JOKER: 60, GUARD: 120 })

  // 공개 목록 요약.
  const list = await new Promise((resolve) => handleGetPublicRooms(resolve))
  const listed = list.rooms.find((entry) => entry.id === room.roomId)
  assert.ok(listed, "저장한 방이 공개 목록에 없다")
  assert.deepEqual(listed.settings.roleNightActionTimes, { JOKER: 60, GUARD: 120 })

  // 실제 목록 행 DOM — 서버가 준 요약이 사람이 읽는 표시와 aria-label 양쪽에 나타난다.
  let rowContainer
  await act(async () => {
    ;({ container: rowContainer } = render(React.createElement(RoomListRow, {
      room: { ...listed, stage: 1, displayStatus: "waiting" },
      selected: false,
      onSelect: () => {},
    })))
  })
  const rowText = rowContainer.textContent
  assert.ok(rowText.includes("광대 밤 60초"), `목록 행에 광대 밤 시간이 없다: ${rowText}`)
  assert.ok(rowText.includes("경비원 밤 120초"), `목록 행에 경비원 밤 시간이 없다: ${rowText}`)
  const rowButton = rowContainer.querySelector("button[aria-label]")
  assert.ok(rowButton.getAttribute("aria-label").includes("광대 밤 60초"),
    "aria-label이 직업별 밤 시간을 읽어주지 않는다")
})

test("AC-03 · 일반 탭에서 바꾼 값과 직업별 밤 시간 편집이 한 요청에 함께 실린다", async () => {
  const { io, hostSocket, room } = await createRoom({
    maxPlayers: 8, jokerCount: 2, nightActionTime: 90, roleNightActionTimes: { GUARD: 120 },
  })
  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  // 일반 탭: 정원을 8 → 7로 내린다.
  await clickStepper(container, "최대 플레이어 수 감소")
  // 회의&투표 탭: 의사 밤 시간을 90 → 120으로 올린다(원래 지정돼 있지 않던 직업).
  await clickTab(container, "회의&투표")
  await clickStepper(container, "의사 밤 시간 조절 증가")
  await clickSubmit(container, "설정 저장")

  const submitted = getSubmitted()
  assert.equal(submitted.ranges["max-players"], 7, "탭을 옮기는 사이 일반 탭 입력이 사라졌다")
  assert.deepEqual(submitted.specifiedRoleNightActionTimes, ["DOCTOR", "GUARD"])

  const payload = buildUpdateRoomSettingsPayload({
    ...submitted, roomId: room.roomId, requestId: "req-mixed", expectedSettingsVersion: 1,
  })
  assert.equal(payload.maxPlayers, 7)
  assert.deepEqual(payload.roleNightActionTimes, { DOCTOR: 120, GUARD: 120 })

  const saved = await new Promise((resolve) =>
    handleUpdateRoomSettings(io, hostSocket, "host-a", payload, resolve))
  assert.equal(saved.ok, true, saved.message)

  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.equal(current.room.settings.maxPlayers, 7)
  assert.deepEqual(current.room.settings.roleNightActionTimes, { DOCTOR: 120, GUARD: 120 })
})

test("AC-03 · 생성 화면은 지정 목록이라는 출발점이 없어 기존 계약대로 네 직업을 모두 싣는다", async () => {
  const { container, getSubmitted } = await mountPanel({ mode: "create", initialFormState: null })
  await clickTab(container, "회의&투표")
  await clickStepper(container, "광대 밤 시간 조절 감소")
  await clickSubmit(container, "게임 만들기")

  // 생성 모드의 제출은 이미 create_room payload다(편집 모드와 달리 폼 상태가 아니다).
  const payload = getSubmitted()
  assert.deepEqual(Object.keys(payload.roleNightActionTimes).sort(),
    ["DOCTOR", "GUARD", "JOKER", "WITCH_HUNTER"])
  assert.equal(payload.roleNightActionTimes.JOKER, 60, "생성 화면에서 바꾼 값이 반영되지 않았다")
})
