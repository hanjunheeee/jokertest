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

/** 라벨로 실제 스테퍼 행을 찾아 **화면에 그려진** 값을 읽는다. */
function readStepperRow(container, label) {
  const row = [...container.querySelectorAll("[data-setup-row]")]
    .find((node) => node.querySelector("p")?.textContent.trim() === label)
  assert.ok(row, `${label} 행이 없다`)
  return row.textContent.replace(label, "").trim()
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
  assert.ok(rowText.includes("광대 2"), `목록 행에 광대 수가 없다: ${rowText}`)
  assert.ok(rowText.includes("밤 90초"), `목록 행에 전체 밤 시간이 없다: ${rowText}`)
  assert.equal(rowText.includes("광대 밤"), false, "목록 행에 직업별 밤 시간이 남아 있다")
  assert.equal(rowText.includes("경비원 밤"), false, "목록 행에 직업별 밤 시간이 남아 있다")
  const rowButton = rowContainer.querySelector("button[aria-label]")
  assert.equal(rowButton.getAttribute("aria-label").includes("광대 밤"), false,
    "aria-label에 직업별 밤 시간이 들어가면 안 된다")
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

test("AC-03 · 지정하지 않은 직업의 밤 시간은 생성 기본값이 아니라 실제로 적용될 전체 밤 시간으로 보인다", async () => {
  // 전체 밤 시간 60초, 직업별 지정 없음 — 서버는 네 직업 모두 60초를 쓴다.
  const { room } = await createRoom({ nightActionTime: 60 })
  assert.equal(room.settings.roleNightActionTimes, undefined, "이 사건의 전제는 '지정 없음'이다")

  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })
  assert.equal(formState.ok, true, formState.code)
  assert.deepEqual(formState.specifiedRoleNightActionTimes, [],
    "지정하지 않은 직업이 지정 목록에 들어갔다")

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")

  // 화면이 말하는 값과 서버가 실제로 쓰는 값이 같아야 한다 — 생성 기본값 90초가 보이면
  // 방장은 "이 직업은 90초"라고 읽는데 서버는 60초를 쓴다.
  assert.equal(readStepperRow(container, "밤 행동 시간 조절"), "60초")
  for (const label of ["광대 밤 시간 조절", "의사 밤 시간 조절", "경비원 밤 시간 조절", "마녀사냥꾼 밤 시간 조절"]) {
    assert.equal(readStepperRow(container, label), "60초",
      `${label}이 실제 적용될 값이 아니라 생성 기본값을 보여준다`)
  }

  // 그런데도 열고 그대로 저장하면 없던 override는 생기지 않는다(두 성질은 서로 독립이다).
  await clickSubmit(container, "설정 저장")
  const untouched = buildUpdateRoomSettingsPayload({
    ...getSubmitted(), roomId: room.roomId, requestId: "req-fallback-untouched", expectedSettingsVersion: 1,
  })
  assert.equal(Object.hasOwn(untouched, "roleNightActionTimes"), false,
    "열고 그대로 저장했을 뿐인데 override가 생겼다")

  // 실제 편집은 그 **실효값**에서 출발한다 — 60에서 한 칸 올리면 90이다(90에서 120이 아니다).
  await clickStepper(container, "광대 밤 시간 조절 증가")
  assert.equal(readStepperRow(container, "광대 밤 시간 조절"), "90초")
  await clickSubmit(container, "설정 저장")
  const edited = buildUpdateRoomSettingsPayload({
    ...getSubmitted(), roomId: room.roomId, requestId: "req-fallback-edited", expectedSettingsVersion: 1,
  })
  assert.deepEqual(edited.roleNightActionTimes, { JOKER: 90 })
})

const ROLE_TIME_LABELS = Object.freeze({
  JOKER: "광대 밤 시간 조절",
  DOCTOR: "의사 밤 시간 조절",
  GUARD: "경비원 밤 시간 조절",
  WITCH_HUNTER: "마녀사냥꾼 밤 시간 조절",
})
const OVERALL_NIGHT_LABEL = "밤 행동 시간 조절"

test("AC-03 · 편집 중 전체 밤 시간을 바꾸면 지정하지 않은 직업 행도 함께 따라가고, 지정·편집한 값은 그대로다", async () => {
  // 전체 60초 · GUARD만 서버 지정. 나머지 세 직업은 "지정 없음 = 전체 시간으로 폴백"이다.
  const { io, hostSocket, room } = await createRoom({
    nightActionTime: 60, roleNightActionTimes: { GUARD: 120 },
  })
  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })
  assert.equal(formState.ok, true, formState.code)
  assert.deepEqual(formState.specifiedRoleNightActionTimes, ["GUARD"])

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")
  assert.equal(readStepperRow(container, OVERALL_NIGHT_LABEL), "60초")
  for (const role of ["JOKER", "DOCTOR", "WITCH_HUNTER"]) {
    assert.equal(readStepperRow(container, ROLE_TIME_LABELS[role]), "60초", `${role} 초기 폴백`)
  }
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.GUARD), "120초")

  // 의사만 방장이 **직접** 60 → 120으로 바꾼다(이 값은 이제 전체 시간과 독립이다).
  await clickStepper(container, "의사 밤 시간 조절 증가")
  await clickStepper(container, "의사 밤 시간 조절 증가")
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.DOCTOR), "120초")

  // 전체 밤 시간을 60 → 90으로 올린다. 서버는 이 순간부터 지정 없는 직업에 90초를 쓴다.
  await clickStepper(container, `${OVERALL_NIGHT_LABEL} 증가`)
  assert.equal(readStepperRow(container, OVERALL_NIGHT_LABEL), "90초")
  for (const role of ["JOKER", "WITCH_HUNTER"]) {
    assert.equal(readStepperRow(container, ROLE_TIME_LABELS[role]), "90초",
      `${role} 행이 전체 밤 시간을 따라가지 않아 서버가 쓸 값과 다른 값을 보여준다`)
  }
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.DOCTOR), "120초",
    "방장이 직접 지정한 값이 전체 시간 변경에 덮였다")
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.GUARD), "120초",
    "서버가 명시한 override가 전체 시간 변경에 덮였다")

  // 전체 시간을 한 번 더 바꿔도 같은 관계가 유지된다.
  await clickStepper(container, `${OVERALL_NIGHT_LABEL} 증가`)
  assert.equal(readStepperRow(container, OVERALL_NIGHT_LABEL), "120초")
  for (const role of ["JOKER", "WITCH_HUNTER"]) {
    assert.equal(readStepperRow(container, ROLE_TIME_LABELS[role]), "120초",
      `${role} 행이 두 번째 전체 시간 변경을 따라가지 않았다`)
  }

  // 따라간 것은 표시일 뿐 "지정했다"는 사실이 아니다 — 저장에는 override가 실리지 않는다.
  await clickSubmit(container, "설정 저장")
  const submitted = getSubmitted()
  assert.deepEqual(submitted.specifiedRoleNightActionTimes, ["DOCTOR", "GUARD"],
    "전체 시간을 따라간 행이 지정 목록에 들어갔다")

  const payload = buildUpdateRoomSettingsPayload({
    ...submitted, roomId: room.roomId, requestId: "req-overall-follow", expectedSettingsVersion: 1,
  })
  assert.equal(payload.nightActionTime, 120)
  assert.deepEqual(payload.roleNightActionTimes, { DOCTOR: 120, GUARD: 120 },
    "따라가기만 한 직업이 override로 저장됐다")

  // 실제 서버가 받아 저장한 값도 같다(따라간 직업은 전체 시간으로 폴백한 채로 남는다).
  const saved = await new Promise((resolve) =>
    handleUpdateRoomSettings(io, hostSocket, "host-a", payload, resolve))
  assert.equal(saved.ok, true, saved.message)
  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.equal(current.room.settings.nightActionTime, 120)
  assert.deepEqual(current.room.settings.roleNightActionTimes, { DOCTOR: 120, GUARD: 120 })
})

test("AC-03 · 전체 밤 시간을 바꾼 뒤 직업 행을 처음 누르면 그 새 값에서 출발한다", async () => {
  const { room } = await createRoom({ nightActionTime: 60 })
  assert.equal(room.settings.roleNightActionTimes, undefined, "이 사건의 전제는 '지정 없음'이다")
  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")
  await clickStepper(container, `${OVERALL_NIGHT_LABEL} 증가`) // 60 → 90
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.JOKER), "90초")

  // 한 칸 올리면 120이어야 한다. 행이 아직 60에 머물러 있었다면 여기서 90이 된다 —
  // 방장이 "한 칸 올렸을 뿐"인데 실효값과 같은 값을 override로 박아 넣게 된다.
  await clickStepper(container, "광대 밤 시간 조절 증가")
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.JOKER), "120초",
    "직업 행의 편집이 따라간 실효값이 아니라 옛 값에서 출발했다")

  await clickSubmit(container, "설정 저장")
  const payload = buildUpdateRoomSettingsPayload({
    ...getSubmitted(), roomId: room.roomId, requestId: "req-follow-then-edit", expectedSettingsVersion: 1,
  })
  assert.equal(payload.nightActionTime, 90)
  assert.deepEqual(payload.roleNightActionTimes, { JOKER: 120 })
})

test("AC-03 · 생성 화면에서는 전체 밤 시간을 바꿔도 직업 행이 따라가지 않는다(기존 계약 보존)", async () => {
  // 생성 화면에는 "지정하지 않음"이라는 상태가 없다 — 네 직업 모두 명시값이고 그대로 실린다.
  const { container, getSubmitted } = await mountPanel({ mode: "create", initialFormState: null })
  await clickTab(container, "회의&투표")
  assert.equal(readStepperRow(container, OVERALL_NIGHT_LABEL), "90초")
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.JOKER), "90초")

  await clickStepper(container, `${OVERALL_NIGHT_LABEL} 증가`) // 90 → 120
  assert.equal(readStepperRow(container, OVERALL_NIGHT_LABEL), "120초")
  for (const role of Object.keys(ROLE_TIME_LABELS)) {
    assert.equal(readStepperRow(container, ROLE_TIME_LABELS[role]), "90초",
      `생성 화면의 ${role} 기본값이 전체 시간을 따라가 바뀌었다`)
  }

  await clickSubmit(container, "게임 만들기")
  const payload = getSubmitted()
  assert.equal(payload.nightActionTime, 120)
  assert.deepEqual(payload.roleNightActionTimes,
    { JOKER: 90, DOCTOR: 90, GUARD: 90, WITCH_HUNTER: 90 })
})

test("AC-03 · 이 화면이 표현할 수 없는 서버 설정은 기본값으로 덮지 않고 명시적 실패로 돌려준다", async () => {
  const base = {
    maxPlayers: 8, jokerCount: 2, roleCompositionMode: "auto",
    dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90,
  }
  const form = (settings) => buildRoomSettingsFormState({ accessType: "open", settings: { ...base, ...settings } })

  // 정상값은 그대로 통과한다(모든 것을 거부해서 통과시킨 것이 아니다).
  assert.equal(form({}).ok, true)

  // 정원: 허용 범위(4~10) 밖.
  assert.deepEqual(
    { code: form({ maxPlayers: 11 }).code, field: form({ maxPlayers: 11 }).field },
    { code: "OUT_OF_RANGE", field: "maxPlayers" },
  )
  assert.equal(form({ maxPlayers: 3 }).code, "OUT_OF_RANGE")
  // 값이 아예 없는 것과 "있는데 표현할 수 없는 것"은 다른 사실이다.
  assert.equal(form({ maxPlayers: undefined }).code, "MISSING_FIELD")

  // 시간: step(30초)에 맞지 않는 값.
  assert.equal(form({ dayDiscussionTime: 75 }).code, "OUT_OF_RANGE")
  assert.equal(form({ dayVoteTime: 120 }).code, "OUT_OF_RANGE") // 투표는 30~90초다
  assert.equal(form({ nightActionTime: 150 }).code, "OUT_OF_RANGE")
  assert.equal(form({ roleNightActionTimes: { JOKER: 45 } }).code, "OUT_OF_RANGE")

  // 광대 수: 역할 계약의 상한(2명)을 넘는 값.
  assert.equal(form({ jokerCount: 3 }).code, "OUT_OF_RANGE")

  // CUSTOM 역할 구성: 상한 초과·합계 초과·광대 수 불일치.
  const custom = (roleCounts, extra = {}) =>
    form({ roleCompositionMode: "custom", jokerCount: roleCounts.JOKER, roleCounts, ...extra })
  assert.equal(custom({ JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }).ok, true)
  assert.equal(custom({ JOKER: 1, DOCTOR: 3, GUARD: 0, WITCH_HUNTER: 0 }).code, "INVALID_ROLE_COUNTS")
  assert.equal(
    custom({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, { maxPlayers: 4 }).code,
    "INVALID_ROLE_COUNTS",
  )
  // jokerCount와 roleCounts.JOKER가 어긋나면 두 스테퍼가 서로 다른 값을 보여주게 된다.
  const mismatched = form({
    roleCompositionMode: "custom", jokerCount: 2,
    roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
  })
  assert.equal(mismatched.ok, false)
  assert.equal(mismatched.field, "jokerCount")
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
