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
matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} })

const { createFakeSocket, createFakeIo, validSettingsPayload } = matchmakingFixtures
const { handleCreateRoom, handleUpdateRoomSettings, handleGetCurrentRoom, handleGetPublicRooms } =
  matchmaking.__testables

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

async function clickTab(container, label) {
  const button = [...container.querySelectorAll("button")]
    .find((node) => node.textContent.trim() === label)
  assert.ok(button, `${label} 탭 버튼이 없다`)
  await act(async () => { button.click() })
}

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

function readStepperRow(container, label) {
  const row = [...container.querySelectorAll("[data-setup-row]")]
    .find((node) => node.querySelector("p")?.textContent.trim() === label)
  assert.ok(row, `${label} 행이 없다`)
  return row.textContent.replace(label, "").trim()
}

test.afterEach(() => { cleanup() })

test("AC-03 · 편집을 열고 그대로 저장하면 서버의 부분 지정이 그대로 유지된다", async () => {
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
  assert.equal(formState.specifiedRoleNightActionTimes.includes("JOKER"), false)

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")

  await clickStepper(container, "광대 밤 시간 조절 감소")
  assert.ok(container.textContent.includes("60초"), "스테퍼 클릭이 화면 값에 반영되지 않았다")

  await clickSubmit(container, "설정 저장")
  const submitted = getSubmitted()
  assert.ok(submitted, "제출 콜백이 폼 상태를 넘기지 않았다")
  assert.deepEqual(submitted.specifiedRoleNightActionTimes, ["JOKER", "GUARD"],
    "화면에서 바꾼 직업이 지정 목록에 들어가지 않았다")
  assert.equal(submitted.ranges["night-action-time-joker"], 60)

  const payload = buildUpdateRoomSettingsPayload({
    ...submitted, roomId: room.roomId, requestId: "req-edited-joker", expectedSettingsVersion: 1,
  })
  assert.deepEqual(payload.roleNightActionTimes, { JOKER: 60, GUARD: 120 })

  const saved = await new Promise((resolve) =>
    handleUpdateRoomSettings(io, hostSocket, "host-a", payload, resolve))
  assert.equal(saved.ok, true, saved.message)
  assert.equal(saved.changed, true)

  const current = await new Promise((resolve) => handleGetCurrentRoom("host-a", resolve))
  assert.deepEqual(current.room.settings.roleNightActionTimes, { JOKER: 60, GUARD: 120 })

  const list = await new Promise((resolve) => handleGetPublicRooms(resolve))
  const listed = list.rooms.find((entry) => entry.id === room.roomId)
  assert.ok(listed, "저장한 방이 공개 목록에 없다")
  assert.deepEqual(listed.settings.roleNightActionTimes, { JOKER: 60, GUARD: 120 })

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
  await clickStepper(container, "최대 플레이어 수 감소")
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
  const { room } = await createRoom({ nightActionTime: 60 })
  assert.equal(room.settings.roleNightActionTimes, undefined, "이 사건의 전제는 '지정 없음'이다")

  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })
  assert.equal(formState.ok, true, formState.code)
  assert.deepEqual(formState.specifiedRoleNightActionTimes, [],
    "지정하지 않은 직업이 지정 목록에 들어갔다")

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")

  assert.equal(readStepperRow(container, "밤 행동 시간 조절"), "60초")
  for (const label of ["광대 밤 시간 조절", "의사 밤 시간 조절", "경비원 밤 시간 조절", "마녀사냥꾼 밤 시간 조절"]) {
    assert.equal(readStepperRow(container, label), "60초",
      `${label}이 실제 적용될 값이 아니라 생성 기본값을 보여준다`)
  }

  await clickSubmit(container, "설정 저장")
  const untouched = buildUpdateRoomSettingsPayload({
    ...getSubmitted(), roomId: room.roomId, requestId: "req-fallback-untouched", expectedSettingsVersion: 1,
  })
  assert.equal(Object.hasOwn(untouched, "roleNightActionTimes"), false,
    "열고 그대로 저장했을 뿐인데 override가 생겼다")

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

  await clickStepper(container, "의사 밤 시간 조절 증가")
  await clickStepper(container, "의사 밤 시간 조절 증가")
  assert.equal(readStepperRow(container, ROLE_TIME_LABELS.DOCTOR), "120초")

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

  await clickStepper(container, `${OVERALL_NIGHT_LABEL} 증가`)
  assert.equal(readStepperRow(container, OVERALL_NIGHT_LABEL), "120초")
  for (const role of ["JOKER", "WITCH_HUNTER"]) {
    assert.equal(readStepperRow(container, ROLE_TIME_LABELS[role]), "120초",
      `${role} 행이 두 번째 전체 시간 변경을 따라가지 않았다`)
  }

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

  assert.equal(form({}).ok, true)

  assert.deepEqual(
    { code: form({ maxPlayers: 11 }).code, field: form({ maxPlayers: 11 }).field },
    { code: "OUT_OF_RANGE", field: "maxPlayers" },
  )
  assert.equal(form({ maxPlayers: 3 }).code, "OUT_OF_RANGE")
  assert.equal(form({ maxPlayers: undefined }).code, "MISSING_FIELD")

  assert.equal(form({ dayDiscussionTime: 75 }).code, "OUT_OF_RANGE")
  assert.equal(form({ dayVoteTime: 120 }).code, "OUT_OF_RANGE") // 투표는 30~90초다
  assert.equal(form({ nightActionTime: 150 }).code, "OUT_OF_RANGE")
  assert.equal(form({ roleNightActionTimes: { JOKER: 45 } }).code, "OUT_OF_RANGE")

  assert.equal(form({ jokerCount: 3 }).code, "OUT_OF_RANGE")

  const custom = (roleCounts, extra = {}) =>
    form({ roleCompositionMode: "custom", jokerCount: roleCounts.JOKER, roleCounts, ...extra })
  assert.equal(custom({ JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }).ok, true)
  assert.equal(custom({ JOKER: 1, DOCTOR: 3, GUARD: 0, WITCH_HUNTER: 0 }).code, "INVALID_ROLE_COUNTS")
  assert.equal(
    custom({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, { maxPlayers: 4 }).code,
    "INVALID_ROLE_COUNTS",
  )
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

  const payload = getSubmitted()
  assert.deepEqual(Object.keys(payload.roleNightActionTimes).sort(),
    ["DOCTOR", "GUARD", "JOKER", "WITCH_HUNTER"])
  assert.equal(payload.roleNightActionTimes.JOKER, 60, "생성 화면에서 바꾼 값이 반영되지 않았다")
})
