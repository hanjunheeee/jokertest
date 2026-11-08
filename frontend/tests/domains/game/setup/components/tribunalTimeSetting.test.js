// 재판 시간 설정 칸 시험 (사용자 결정 2026-11-09: 방 설정에 넣고 기본값 = 낮 투표 시간)
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
  "../../../../helpers/jsxNodeLoaderHooks.mjs",
  import.meta.url,
))

const { render, act, cleanup } = await import("@testing-library/react")
const { default: GameSetupPanel } = await import("../../../../../src/domains/game/setup/components/GameSetupPanel.jsx")
const { buildRoomSettingsFormState, buildUpdateRoomSettingsPayload, buildDefaultFormState } =
  await import("../../../../../src/domains/game/setup/utils/roomSettingsForm.js")
const { pickTribunalTime } = await import("../../../../../src/domains/game/setup/utils/roomSettingsForm/tribunalTime.js")
const { shouldTribunalFollowDayVote } = await import("../../../../../src/domains/game/setup/hooks/useNightTimeEdits.js")

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
const { handleCreateRoom, handleUpdateRoomSettings } = matchmaking.__testables

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

const TRIBUNAL = "tribunal-time"
const DAY_VOTE = "day-vote-time"

test("재판 시간 · 기본 폼은 낮 투표 시간과 같은 값이고, 같으면 요청에 안 실림 (서버가 낮 투표 시간을 씀)", () => {
  const { ranges } = buildDefaultFormState()
  assert.equal(ranges[TRIBUNAL], ranges[DAY_VOTE])
  assert.equal(pickTribunalTime(ranges), null)
  assert.equal(pickTribunalTime({ [DAY_VOTE]: 60, [TRIBUNAL]: 45 }), 45)
  assert.equal(pickTribunalTime({ [DAY_VOTE]: 60 }), null)
})

test("재판 시간 · 서버 칸이 없는 옛 설정은 낮 투표 시간으로 채우고, 있으면 그 값, 칸이 못 보이는 값이면 거절", () => {
  const base = {
    maxPlayers: 8, jokerCount: 2, roleCompositionMode: "auto",
    dayDiscussionTime: 60, dayVoteTime: 90, nightActionTime: 90,
  }
  const legacy = buildRoomSettingsFormState({ accessType: "open", settings: base })
  assert.equal(legacy.ok, true, legacy.code)
  assert.equal(legacy.ranges[TRIBUNAL], 90)

  const set = buildRoomSettingsFormState({ accessType: "open", settings: { ...base, tribunalTime: 45 } })
  assert.equal(set.ranges[TRIBUNAL], 45)

  const bad = buildRoomSettingsFormState({ accessType: "open", settings: { ...base, tribunalTime: 50 } })
  assert.equal(bad.ok, false)
  assert.equal(bad.field, "tribunalTime")
})

test("재판 시간 · 안 건드렸고 같으면 낮 투표 시간을 따라가고, 건드렸거나 다르면 안 따라감", () => {
  assert.equal(shouldTribunalFollowDayVote({ [DAY_VOTE]: 60, [TRIBUNAL]: 60 }, false), true)
  assert.equal(shouldTribunalFollowDayVote({ [DAY_VOTE]: 60, [TRIBUNAL]: 60 }, true), false)
  assert.equal(shouldTribunalFollowDayVote({ [DAY_VOTE]: 60, [TRIBUNAL]: 45 }, false), false)
})

test("재판 시간 · 만들기 화면: 처음엔 낮 투표 시간(60초) 표시, 낮 투표를 바꾸면 따라가고, 재판 시간을 바꾸면 요청에 실림", async () => {
  const { container, getSubmitted } = await mountPanel({ mode: "create", initialFormState: null })
  await clickTab(container, "회의&투표")
  assert.equal(readStepperRow(container, "재판 시간 조절"), "60초")

  await clickStepper(container, "낮 투표 시간 조절 증가")
  assert.equal(readStepperRow(container, "낮 투표 시간 조절"), "90초")
  assert.equal(readStepperRow(container, "재판 시간 조절"), "90초", "안 건드린 재판 시간이 낮 투표를 안 따라감")

  await clickStepper(container, "재판 시간 조절 감소")
  assert.equal(readStepperRow(container, "재판 시간 조절"), "75초")
  await clickStepper(container, "낮 투표 시간 조절 감소")
  assert.equal(readStepperRow(container, "재판 시간 조절"), "75초", "건드린 재판 시간은 그대로")

  await clickSubmit(container, "게임 만들기")
  // 만들기 모드는 방 만들기 요청 값을 그대로 넘김
  const payload = getSubmitted()
  assert.ok(payload, "제출 콜백이 값을 넘기지 않았다")
  assert.equal(payload.dayVoteTime, 60)
  assert.equal(payload.tribunalTime, 75)
})

test("재판 시간 · 편집: 옛 방(칸 없음)을 열고 그대로 저장하면 바뀜 없음, 재판 시간을 바꾸면 서버에 저장", async () => {
  const { io, hostSocket, room } = await createRoom({ dayVoteTime: 60 })
  assert.equal(Object.hasOwn(room.settings, "tribunalTime"), false)
  const formState = buildRoomSettingsFormState({ accessType: room.accessType, settings: room.settings })
  assert.equal(formState.ranges[TRIBUNAL], 60)

  const untouched = buildUpdateRoomSettingsPayload({
    ...formState, roomId: room.roomId, requestId: "req-tribunal-same", expectedSettingsVersion: 1,
  })
  assert.equal(Object.hasOwn(untouched, "tribunalTime"), false)
  const same = await new Promise((resolve) => handleUpdateRoomSettings(io, hostSocket, "host-a", untouched, resolve))
  assert.equal(same.ok, true, same.message)
  assert.equal(same.changed, false, "열고 그대로 저장했는데 바뀜으로 잡혔다")

  const { container, getSubmitted } = await mountPanel({ mode: "edit", initialFormState: formState })
  await clickTab(container, "회의&투표")
  await clickStepper(container, "재판 시간 조절 증가")
  await clickSubmit(container, "설정 저장")
  const payload = buildUpdateRoomSettingsPayload({
    ...getSubmitted(), roomId: room.roomId, requestId: "req-tribunal-75", expectedSettingsVersion: 1,
  })
  assert.equal(payload.tribunalTime, 75)
  const saved = await new Promise((resolve) => handleUpdateRoomSettings(io, hostSocket, "host-a", payload, resolve))
  assert.equal(saved.ok, true, saved.message)
  assert.equal(saved.changed, true)
})
