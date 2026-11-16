// 설정 폼 ↔ 서버 값 시험: 서버 설정 → 폼 첫 값, 폼 → 설정 바꾸기 요청, 저장값 정리가 지운 3칸·모르는 칸 지움
// 목록 A01a "화면 PC" A01-F-049~060
import test from "node:test"
import assert from "node:assert/strict"

const { buildRoomSettingsFormState, buildUpdateRoomSettingsPayload, ERROR_CODES } =
  await import("../../src/domains/game/setup/utils/roomSettingsForm.js")
const { sanitizeRoomSettings } = await import("../../src/domains/game/setup/utils/roomSettingsSourceSanitize.js")

// 서버가 주는 설정 (정원 10·광대 2·60·60·90·자동)
const BASE = Object.freeze({
  maxPlayers: 10,
  jokerCount: 2,
  roleCompositionMode: "auto",
  dayDiscussionTime: 60,
  dayVoteTime: 60,
  nightActionTime: 90,
})

const REMOVED_KEYS = ["lightsOut", "soulBetting", "voteReveal"]

// 폼 → 바꾸기 요청 (방 room-1·요청 req-1·버전 3)
const updateOf = (form) => buildUpdateRoomSettingsPayload({
  ...form,
  roomId: "room-1",
  requestId: "req-1",
  expectedSettingsVersion: 3,
})

test("A01-F-049 서버 설정(코드·정원 7·광대 1) → 폼 정원 7·광대 1·코드로만 참가 켜짐", () => {
  const form = buildRoomSettingsFormState({ accessType: "code", settings: { ...BASE, maxPlayers: 7, jokerCount: 1 } })
  assert.equal(form.ok, true)
  assert.equal(form.ranges["max-players"], 7)
  assert.equal(form.ranges["joker-count"], 1)
  assert.equal(form.checks["private-lobby"], true)
})

test("A01-F-050 재판 칸 없음·투표 90 → 폼 재판 90", () => {
  const form = buildRoomSettingsFormState({ accessType: "open", settings: { ...BASE, dayVoteTime: 90 } })
  assert.equal(form.ok, true)
  assert.equal(form.ranges["tribunal-time"], 90)
})

test("A01-F-051 직접 구성 서버 설정 → 폼 직접 지정·같은 수", () => {
  const roleCounts = { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 }
  const form = buildRoomSettingsFormState({
    accessType: "open",
    settings: { ...BASE, maxPlayers: 7, jokerCount: 1, roleCompositionMode: "custom", roleCounts },
  })
  assert.equal(form.ok, true)
  assert.deepEqual(form.roleComposition, { mode: "custom", roleCounts })
})

test("A01-F-052 지운 3칸 섞인 옛 설정 → 폼 상태에 그 칸 없음", () => {
  const form = buildRoomSettingsFormState({
    accessType: "open",
    settings: { ...BASE, lightsOut: true, soulBetting: true, voteReveal: false },
  })
  assert.equal(form.ok, true)
  const text = JSON.stringify(form)
  for (const key of REMOVED_KEYS) assert.equal(text.includes(key), false, `${key} 없음`)
  for (const id of ["lights-out", "soul-betting", "vote-reveal"]) assert.equal(text.includes(id), false, `${id} 없음`)
})

test("A01-F-053 [지금 동작] 정원 11 서버 값 → 폼 오류 OUT_OF_RANGE", () => {
  const form = buildRoomSettingsFormState({ accessType: "open", settings: { ...BASE, maxPlayers: 11 } })
  assert.equal(form.ok, false)
  assert.equal(form.code, ERROR_CODES.OUT_OF_RANGE)
})

test("A01-F-054 폼 + 방 id·버전 → 바꾸기 요청에 roomId·requestId·expectedSettingsVersion·칸들", () => {
  const form = buildRoomSettingsFormState({ accessType: "code", settings: { ...BASE, maxPlayers: 8 } })
  const payload = updateOf(form)
  assert.equal(payload.roomId, "room-1")
  assert.equal(payload.requestId, "req-1")
  assert.equal(payload.expectedSettingsVersion, 3)
  assert.equal(payload.accessType, "code")
  assert.equal(payload.maxPlayers, 8)
  assert.equal(payload.jokerCount, 2)
  assert.equal(payload.roleCompositionMode, "auto")
  assert.equal(payload.dayDiscussionTime, 60)
  assert.equal(payload.dayVoteTime, 60)
  assert.equal(payload.nightActionTime, 90)
})

test("A01-F-055 바꾸기 요청에 지운 3칸 없음", () => {
  const form = buildRoomSettingsFormState({
    accessType: "open",
    settings: { ...BASE, lightsOut: true, soulBetting: true, voteReveal: false },
  })
  const payload = updateOf(form)
  for (const key of REMOVED_KEYS) assert.equal(Object.hasOwn(payload, key), false, `${key} 없음`)
})

test("A01-F-056 바꾸기 요청: 재판 = 투표 → tribunalTime 없음", () => {
  const form = buildRoomSettingsFormState({ accessType: "open", settings: { ...BASE, tribunalTime: 60 } })
  const payload = updateOf(form)
  assert.equal(Object.hasOwn(payload, "tribunalTime"), false)
})

// 저장값 정리가 지운 3칸을 지움
const SANITIZE_CASES = [
  ["A01-F-057", "lightsOut", true],
  ["A01-F-058", "soulBetting", true],
  ["A01-F-059", "voteReveal", false],
]

for (const [no, key, value] of SANITIZE_CASES) {
  test(`${no} 저장값 정리에 ${key} → 결과에 없음`, () => {
    const { settings } = sanitizeRoomSettings({ ...BASE, [key]: value })
    assert.equal(Object.hasOwn(settings, key), false)
    assert.equal(settings.maxPlayers, 10)
  })
}

test("A01-F-060 [지금 동작] 저장값 정리에 모르는 칸 foo → 결과에 없음", () => {
  const { settings } = sanitizeRoomSettings({ ...BASE, foo: 1 })
  assert.equal(Object.hasOwn(settings, "foo"), false)
})
