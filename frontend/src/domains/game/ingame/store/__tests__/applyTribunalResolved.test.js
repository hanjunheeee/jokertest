import test from "node:test"
import assert from "node:assert/strict"

import { applyTribunalResolvedPure } from "../applyTribunalResolved.js"

function baseCurrent(overrides = {}) {
  return {
    gameId: "g1",
    error: null,
    state: {
      id: "g1",
      phase: "TRIBUNAL",
      dayIndex: 2,
      tribunal: { defendantUuid: "d1" },
      players: [
        { uuid: "d1", nickname: "D", alive: true },
        { uuid: "p2", nickname: "P2", alive: true },
      ],
    },
    ...overrides,
  }
}

function basePayload(overrides = {}) {
  return {
    gameId: "g1",
    dayIndex: 2,
    phase: "TRIBUNAL",
    defendantUuid: "d1",
    outcome: "GUILTY",
    counts: { guilty: 2, notGuilty: 1 },
    executedUuid: "d1",
    ...overrides,
  }
}

test("applyTribunalResolvedPure: gameId 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ gameId: "other" }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: dayIndex 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ dayIndex: 99 }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: phase 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ phase: "DAY" }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: defendantUuid 불일치는 원래 state 참조를 그대로 반환한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload({ defendantUuid: "someone-else" }))
  assert.equal(result, current)
})

test("applyTribunalResolvedPure: 정상 GUILTY 판정은 tribunal 결과 필드와 executedUuid 대상 alive:false만 반영한다", () => {
  const current = baseCurrent()
  const result = applyTribunalResolvedPure(current, basePayload())

  assert.notEqual(result, current)
  assert.equal(result.state.tribunal.outcome, "GUILTY")
  assert.deepEqual(result.state.tribunal.counts, { guilty: 2, notGuilty: 1 })
  assert.equal(result.state.tribunal.executedUuid, "d1")
  assert.equal(result.state.tribunal.resolved, true)
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, false)
  assert.equal(result.state.players.find((p) => p.uuid === "p2").alive, true)
})

test("applyTribunalResolvedPure: NOT_GUILTY 판정은 아무도 alive를 false로 바꾸지 않는다", () => {
  const current = baseCurrent()
  const payload = basePayload({ outcome: "NOT_GUILTY", counts: { guilty: 1, notGuilty: 2 }, executedUuid: null })
  const result = applyTribunalResolvedPure(current, payload)

  assert.equal(result.state.tribunal.outcome, "NOT_GUILTY")
  assert.equal(result.state.tribunal.executedUuid, null)
  assert.equal(result.state.players.find((p) => p.uuid === "d1").alive, true)
})
