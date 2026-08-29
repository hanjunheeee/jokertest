import test from "node:test"
import assert from "node:assert/strict"
import { parseNightTurnEndedPayload } from "../parseNightTurnEndedPayload.js"

const GAME_ID = "game-1"
const canonical = { gameId: GAME_ID, dayIndex: 2, nightTurnRole: "DOCTOR" }
const payload = (overrides = {}) => ({ gameId: GAME_ID, dayIndex: 2, role: "DOCTOR", ...overrides })

test("parseNightTurnEndedPayload: 현재 canonical 턴과 정확히 일치하면 정규화한다", () => {
  assert.deepEqual(parseNightTurnEndedPayload({ payload: payload({ secret: "drop" }), ...canonical }), {
    gameId: GAME_ID,
    dayIndex: 2,
    role: "DOCTOR",
  })
})

for (const [label, value, context = canonical] of [
  ["null", null],
  ["배열", []],
  ["다른 게임", payload({ gameId: "other" })],
  ["다른 날짜", payload({ dayIndex: 1 })],
  ["다른 역할", payload({ role: "GUARD" })],
  ["모르는 역할", payload({ role: "MAYOR" })],
  ["현재 턴 없음", payload(), { ...canonical, nightTurnRole: null }],
]) {
  test(`parseNightTurnEndedPayload: ${label}이면 null이다`, () => {
    assert.equal(parseNightTurnEndedPayload({ payload: value, ...context }), null)
  })
}
