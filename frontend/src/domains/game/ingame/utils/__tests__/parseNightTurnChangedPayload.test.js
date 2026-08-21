import test from "node:test"
import assert from "node:assert/strict"

import { parseNightTurnChangedPayload } from "../parseNightTurnChangedPayload.js"

function baseArgs(overrides = {}) {
  return { gameId: "g1", dayIndex: 2, ...overrides }
}

function validPayload(overrides = {}) {
  return { gameId: "g1", phase: "NIGHT", dayIndex: 2, nightTurnRole: "DOCTOR", ...overrides }
}

test("parseNightTurnChangedPayload: gameId/phase/dayIndex/nightTurnRole이 모두 유효하면 그대로 파싱한다", () => {
  assert.deepEqual(parseNightTurnChangedPayload({ payload: validPayload(), ...baseArgs() }), {
    gameId: "g1",
    dayIndex: 2,
    phase: "NIGHT",
    nightTurnRole: "DOCTOR",
  })
})

test("parseNightTurnChangedPayload: nightTurnRole이 null이면(판정 준비 완료) 그대로 null로 파싱한다", () => {
  const result = parseNightTurnChangedPayload({ payload: validPayload({ nightTurnRole: null }), ...baseArgs() })
  assert.equal(result.nightTurnRole, null)
})

test("parseNightTurnChangedPayload: 4개 canonical 역할 각각을 올바르게 파싱한다", () => {
  for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    const result = parseNightTurnChangedPayload({ payload: validPayload({ nightTurnRole: role }), ...baseArgs() })
    assert.equal(result.nightTurnRole, role)
  }
})

test("parseNightTurnChangedPayload: gameId가 다르면(다른 게임의 늦은 방송) null을 반환한다", () => {
  assert.equal(parseNightTurnChangedPayload({ payload: validPayload({ gameId: "other" }), ...baseArgs() }), null)
})

test("parseNightTurnChangedPayload: dayIndex가 다르면(이전 밤의 늦은 방송, stale) null을 반환한다", () => {
  assert.equal(parseNightTurnChangedPayload({ payload: validPayload({ dayIndex: 1 }), ...baseArgs() }), null)
})

test("parseNightTurnChangedPayload: phase가 NIGHT가 아니면 null을 반환한다", () => {
  assert.equal(parseNightTurnChangedPayload({ payload: validPayload({ phase: "DAY" }), ...baseArgs() }), null)
})

test("parseNightTurnChangedPayload: nightTurnRole이 알 수 없는 역할이면 null을 반환한다", () => {
  assert.equal(parseNightTurnChangedPayload({ payload: validPayload({ nightTurnRole: "CITIZEN" }), ...baseArgs() }), null)
})

test("parseNightTurnChangedPayload: 활성 dayIndex가 정수가 아니면 항상 null이다", () => {
  assert.equal(parseNightTurnChangedPayload({ payload: validPayload(), gameId: "g1", dayIndex: undefined }), null)
})

test("parseNightTurnChangedPayload: payload가 없거나 객체가 아니거나 배열이면 null을 반환한다", () => {
  assert.equal(parseNightTurnChangedPayload({ payload: null, ...baseArgs() }), null)
  assert.equal(parseNightTurnChangedPayload({ payload: undefined, ...baseArgs() }), null)
  assert.equal(parseNightTurnChangedPayload({ payload: "not-an-object", ...baseArgs() }), null)
  assert.equal(parseNightTurnChangedPayload({ payload: [validPayload()], ...baseArgs() }), null)
})
