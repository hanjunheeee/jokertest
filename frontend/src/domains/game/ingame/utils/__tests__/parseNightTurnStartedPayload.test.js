import test from "node:test"
import assert from "node:assert/strict"
import { parseNightTurnStartedPayload } from "../parseNightTurnStartedPayload.js"

const GAME_ID = "game-1"
const DEADLINE = 1_700_000_030_000

function startedPayload(overrides = {}) {
  return { gameId: GAME_ID, dayIndex: 1, role: "DOCTOR", deadline: DEADLINE, ...overrides }
}

const rejected = [
  ["payload가 undefined면", undefined],
  ["payload가 null이면", null],
  ["payload가 배열이면", [GAME_ID, 1, "DOCTOR", DEADLINE]],
  ["payload가 문자열이면", "night_turn_started"],
  ["gameId가 없으면", startedPayload({ gameId: undefined })],
  ["gameId가 공백뿐이면", startedPayload({ gameId: "   " })],
  ["다른 게임의 방송이면", startedPayload({ gameId: "game-other" })],
  ["dayIndex가 없으면", startedPayload({ dayIndex: undefined })],
  ["dayIndex가 정수가 아니면", startedPayload({ dayIndex: 1.5 })],
  ["지난 밤의 늦은 방송이면", startedPayload({ dayIndex: 0 })],
  ["다음 밤의 이른 방송이면", startedPayload({ dayIndex: 2 })],
  ["role이 없으면", startedPayload({ role: undefined })],
  ["role이 빈 문자열이면", startedPayload({ role: "" })],
  ["role이 문자열이 아니면", startedPayload({ role: 3 })],
  ["모르는 role이면", startedPayload({ role: "MAYOR" })],
  ["role 표기가 다르면(소문자)", startedPayload({ role: "doctor" })],
  ["deadline이 없으면", startedPayload({ deadline: undefined })],
  ["deadline이 숫자가 아니면", startedPayload({ deadline: String(DEADLINE) })],
  ["deadline이 0이면", startedPayload({ deadline: 0 })],
  ["deadline이 음수면", startedPayload({ deadline: -1 })],
  ["deadline이 NaN이면", startedPayload({ deadline: Number.NaN })],
  ["deadline이 Infinity면", startedPayload({ deadline: Number.POSITIVE_INFINITY })],
]

for (const [label, payload] of rejected) {
  test(`parseNightTurnStartedPayload: ${label} null이다`, () => {
    assert.equal(parseNightTurnStartedPayload({ payload, gameId: GAME_ID, dayIndex: 1 }), null)
  })
}

test("parseNightTurnStartedPayload: 활성 gameId가 없으면 어떤 방송도 받지 않는다", () => {
  assert.equal(parseNightTurnStartedPayload({ payload: startedPayload(), gameId: null, dayIndex: 1 }), null)
  assert.equal(parseNightTurnStartedPayload({ payload: startedPayload(), gameId: "", dayIndex: 1 }), null)
})

test("parseNightTurnStartedPayload: 현재 dayIndex를 모르면(정수 아님) 받지 않는다", () => {
  assert.equal(parseNightTurnStartedPayload({ payload: startedPayload(), gameId: GAME_ID, dayIndex: undefined }), null)
  assert.equal(parseNightTurnStartedPayload({ payload: startedPayload(), gameId: GAME_ID, dayIndex: null }), null)
})

test("parseNightTurnStartedPayload: 계약을 만족하면 정규화된 payload를 돌려준다", () => {
  assert.deepEqual(parseNightTurnStartedPayload({ payload: startedPayload(), gameId: GAME_ID, dayIndex: 1 }), {
    gameId: GAME_ID,
    dayIndex: 1,
    role: "DOCTOR",
    deadline: DEADLINE,
  })
})

test("parseNightTurnStartedPayload: 백엔드 NIGHT_TURN_ORDER의 네 역할을 모두 통과시킨다", () => {
  for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    const parsed = parseNightTurnStartedPayload({ payload: startedPayload({ role }), gameId: GAME_ID, dayIndex: 1 })
    assert.equal(parsed?.role, role, `${role} 턴이 통과해야 한다`)
  }
})

test("parseNightTurnStartedPayload: 아직 능력이 없는 역할의 턴도 그대로 통과시킨다", () => {
  const parsed = parseNightTurnStartedPayload({
    payload: startedPayload({ role: "WITCH_HUNTER", dayIndex: 0 }),
    gameId: GAME_ID,
    dayIndex: 0,
  })
  assert.equal(parsed?.role, "WITCH_HUNTER")
})

test("parseNightTurnStartedPayload: 생존 정보를 요구하지 않는다 — 죽은 역할의 턴이 산 역할의 턴과 구별되지 않는다", () => {
  const parsed = parseNightTurnStartedPayload({ payload: startedPayload(), gameId: GAME_ID, dayIndex: 1 })
  assert.deepEqual(Object.keys(parsed).sort(), ["dayIndex", "deadline", "gameId", "role"])
})

test("parseNightTurnStartedPayload: 계약 밖의 여분 필드는 결과에 새어들지 않는다", () => {
  const parsed = parseNightTurnStartedPayload({
    payload: startedPayload({ aliveActorUuids: ["u1"], secret: "leak" }),
    gameId: GAME_ID,
    dayIndex: 1,
  })
  assert.deepEqual(parsed, { gameId: GAME_ID, dayIndex: 1, role: "DOCTOR", deadline: DEADLINE })
})
