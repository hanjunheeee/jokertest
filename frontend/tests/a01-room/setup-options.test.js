// 방 만들기 설정 항목 표 시험: 칸마다 범위·간격, 지운 3칸 항목 없음, 처음 폼 값
// 목록 A01a "화면 PC" A01-F-024~033
import test from "node:test"
import assert from "node:assert/strict"

const { GENERAL_GAME_SETUP, MEETING_GAME_SETUP } = await import("../../src/domains/game/setup/constants/gameSetupOptions.js")
const { ALL_SETUP_ITEMS } = await import("../../src/domains/game/setup/constants/roomSettingsForm.js")
const { buildDefaultFormState } = await import("../../src/domains/game/setup/utils/roomSettingsForm.js")
const { buildCreateRoomPayload } = await import("../../src/domains/game/setup/utils/buildCreateRoomPayload.js")

// 두 탭 항목을 id로 찾기
const itemOf = (id) => [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP].find((item) => item.id === id)

// 항목이 고를 수 있는 값 전부 (간격 없으면 1) → 예: 토론 [30, 60, 90, 120, 150]
const valuesOf = (item) => {
  const step = item.step ?? 1
  const out = []
  for (let v = item.min; v <= item.max; v += step) out.push(v)
  return out
}

const RANGE_CASES = [
  ["A01-F-024", "정원", "max-players", [5, 6, 7, 8, 9, 10]],
  ["A01-F-025", "광대 수", "joker-count", [1, 2]],
  ["A01-F-026", "토론 시간 (간격 30)", "day-discussion-time", [30, 60, 90, 120, 150]],
  ["A01-F-027", "투표 시간 (간격 30)", "day-vote-time", [30, 60, 90]],
  ["A01-F-028", "재판 시간 (간격 15)", "tribunal-time", [15, 30, 45, 60, 75, 90, 105, 120]],
  ["A01-F-029", "밤 시간 (간격 30)", "night-action-time", [30, 60, 90, 120]],
]

for (const [no, name, id, expected] of RANGE_CASES) {
  test(`${no} 항목 표 ${name} 범위 → ${expected[0]}~${expected.at(-1)}`, () => {
    const item = itemOf(id)
    assert.ok(item, `${id} 항목 있음`)
    assert.deepEqual(valuesOf(item), expected)
  })
}

// 지운 3칸 (불 꺼진 무도회·영혼의 베팅·투표 공개)
const REMOVED_CASES = [
  ["A01-F-030", "lights-out"],
  ["A01-F-031", "soul-betting"],
  ["A01-F-032", "vote-reveal"],
]

for (const [no, id] of REMOVED_CASES) {
  test(`${no} 지운 칸 ${id} 항목이 항목 표에 없음`, () => {
    const ids = [...GENERAL_GAME_SETUP, ...MEETING_GAME_SETUP, ...ALL_SETUP_ITEMS].map((item) => item.id)
    assert.equal(ids.includes(id), false)
  })
}

test("A01-F-033 처음 폼 상태: 코드로만 참가 꺼짐·정원 10·광대 2·토론 60·투표 60·재판 60·밤 90·자동", () => {
  const form = buildDefaultFormState()
  assert.equal(form.checks["private-lobby"], false)
  assert.equal(form.ranges["max-players"], 10)
  assert.equal(form.ranges["joker-count"], 2)
  assert.equal(form.ranges["day-discussion-time"], 60)
  assert.equal(form.ranges["day-vote-time"], 60)
  assert.equal(form.ranges["tribunal-time"], 60)
  assert.equal(form.ranges["night-action-time"], 90)
  // 구성 방식은 폼에 따로 안 정하면 자동으로 감
  const payload = buildCreateRoomPayload({ ...form, roleComposition: undefined, specifiedRoleNightActionTimes: [] })
  assert.equal(payload.roleCompositionMode, "auto")
})
