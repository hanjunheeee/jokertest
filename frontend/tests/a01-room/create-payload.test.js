// 방 만들기 요청 값 시험: 폼 값 → create_room에 실을 값 (정원·공개 방식·광대·직접 구성·재판·직업별 밤·지운 3칸·처음 값)
// 목록 A01a "화면 PC" A01-F-001~023, 폼을 직접 만지는 줄(019~021)은 설정 패널을 그려서 봄
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react")
const { buildCreateRoomPayload } = await import("../../src/domains/game/setup/utils/buildCreateRoomPayload.js")
const { buildDefaultFormState } = await import("../../src/domains/game/setup/utils/roomSettingsForm.js")
const { default: GameSetupPanel } = await import("../../src/domains/game/setup/components/GameSetupPanel.jsx")

test.afterEach(() => cleanup())

// 처음 폼에 바꿀 값만 덮기 (안 손댄 직업별 밤 시간은 패널처럼 빈 목록)
const formWith = ({ checks = {}, ranges = {}, roleComposition, specified = [] } = {}) => {
  const base = buildDefaultFormState()
  return {
    checks: { ...base.checks, ...checks },
    ranges: { ...base.ranges, ...ranges },
    roleComposition,
    specifiedRoleNightActionTimes: specified,
  }
}
const payloadOf = (opts) => buildCreateRoomPayload(formWith(opts))

// 설정 패널을 그리고 만들기를 누르면 넘어가는 값 받기
const renderPanel = () => {
  const created = []
  render(React.createElement(GameSetupPanel, { visible: true, isCreating: false, onCreateGame: (p) => created.push(p) }))
  return created
}
const click = (name) => fireEvent.click(screen.getByRole("button", { name }))

// 정원 5~10 × 코드로만 참가 켬/끔 (값 12개)
let no = 1
for (const maxPlayers of [5, 6, 7, 8, 9, 10]) {
  for (const privateLobby of [true, false]) {
    const id = `A01-F-${String(no).padStart(3, "0")}`
    no += 1
    const access = privateLobby ? "code" : "open"
    test(`${id} 정원 ${maxPlayers} · 코드로만 참가 ${privateLobby ? "켬" : "끔"} → maxPlayers ${maxPlayers}, accessType '${access}'`, () => {
      const payload = payloadOf({ checks: { "private-lobby": privateLobby }, ranges: { "max-players": maxPlayers } })
      assert.equal(payload.maxPlayers, maxPlayers)
      assert.equal(payload.accessType, access)
    })
  }
}

for (const [id, joker] of [["A01-F-013", 1], ["A01-F-014", 2]]) {
  test(`${id} 자동 구성 광대 ${joker} → jokerCount ${joker}, 'auto', roleCounts 없음`, () => {
    const payload = payloadOf({ ranges: { "joker-count": joker }, roleComposition: { mode: "auto", roleCounts: null } })
    assert.equal(payload.jokerCount, joker)
    assert.equal(payload.roleCompositionMode, "auto")
    assert.equal(Object.hasOwn(payload, "roleCounts"), false)
  })
}

test("A01-F-015 직접 J2D1 → roleCounts {JOKER:2,DOCTOR:1,GUARD:0,WITCH_HUNTER:0}, jokerCount 2", () => {
  const payload = payloadOf({
    roleComposition: { mode: "custom", roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 } },
  })
  assert.equal(payload.roleCompositionMode, "custom")
  assert.deepEqual(payload.roleCounts, { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
  assert.equal(payload.jokerCount, 2)
})

test("A01-F-016 [지금 동작] 일반 탭 광대 2 + 직접 광대 1 → jokerCount 1", () => {
  const payload = payloadOf({
    ranges: { "joker-count": 2 },
    roleComposition: { mode: "custom", roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
  })
  assert.equal(payload.jokerCount, 1)
})

test("A01-F-017 재판 = 투표 → tribunalTime 없음", () => {
  const payload = payloadOf({ ranges: { "day-vote-time": 60, "tribunal-time": 60 } })
  assert.equal(Object.hasOwn(payload, "tribunalTime"), false)
})

test("A01-F-018 재판 30 · 투표 60 → tribunalTime 30", () => {
  const payload = payloadOf({ ranges: { "day-vote-time": 60, "tribunal-time": 30 } })
  assert.equal(payload.tribunalTime, 30)
})

test("A01-F-019 패널에서 투표만 90으로 바꿈 → tribunalTime 없음 (재판이 투표를 따라감)", () => {
  const created = renderPanel()
  click("회의&투표")
  click("낮 투표 시간 조절 증가")
  click("게임 만들기")
  assert.equal(created.length, 1)
  assert.equal(created[0].dayVoteTime, 90)
  assert.equal(Object.hasOwn(created[0], "tribunalTime"), false)
})

test("A01-F-020 [지금 동작] 직업별 밤 시간 안 건드림 → roleNightActionTimes 없음", () => {
  const created = renderPanel()
  click("게임 만들기")
  assert.equal(created.length, 1)
  assert.equal(Object.hasOwn(created[0], "roleNightActionTimes"), false)
})

test("A01-F-021 [지금 동작] 의사 밤 시간만 60 → roleNightActionTimes { DOCTOR: 60 }", () => {
  const created = renderPanel()
  click("회의&투표")
  click("의사 밤 시간 조절 감소")
  click("게임 만들기")
  assert.equal(created.length, 1)
  assert.deepEqual(created[0].roleNightActionTimes, { DOCTOR: 60 })
})

test("A01-F-022 어떤 폼이든 → 값에 lightsOut·soulBetting·voteReveal 없음", () => {
  const forms = [
    {},
    { checks: { "private-lobby": true }, ranges: { "max-players": 5, "tribunal-time": 30 } },
    { roleComposition: { mode: "custom", roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } }, specified: ["DOCTOR"] },
  ]
  for (const form of forms) {
    const payload = payloadOf(form)
    for (const key of ["lightsOut", "soulBetting", "voteReveal"]) assert.equal(Object.hasOwn(payload, key), false, `${key} 없음`)
  }
})

test("A01-F-023 안 건드린 폼 → 처음 값 그대로 만들기 값", () => {
  assert.deepEqual(payloadOf(), {
    accessType: "open",
    maxPlayers: 10,
    jokerCount: 1,
    dayDiscussionTime: 60,
    dayVoteTime: 60,
    nightActionTime: 90,
    roleCompositionMode: "auto",
  })
})
