import test from "node:test"
import assert from "node:assert/strict"
import { INGAME_DAY_PHASES, resolveInGameDayPhase } from "../resolveInGameDayPhase.js"

test("resolveInGameDayPhase: 낮이 아니면 null이다", () => {
  assert.equal(resolveInGameDayPhase(null), null)
  assert.equal(resolveInGameDayPhase({ phase: "NIGHT" }), null)
})

test("resolveInGameDayPhase: 알 수 없는 dayPhase는 fail-closed로 토론이다", () => {
  assert.equal(resolveInGameDayPhase({ phase: "DAY" }), INGAME_DAY_PHASES.DISCUSSION)
  assert.equal(resolveInGameDayPhase({ phase: "DAY", dayPhase: null }), INGAME_DAY_PHASES.DISCUSSION)
  assert.equal(resolveInGameDayPhase({ phase: "DAY", dayPhase: "DAY_TIMER" }), INGAME_DAY_PHASES.DISCUSSION)
})

test("resolveInGameDayPhase: DAY_VOTE만 투표 구간으로 본다", () => {
  assert.equal(resolveInGameDayPhase({ phase: "DAY", dayPhase: "DAY_VOTE" }), INGAME_DAY_PHASES.VOTE)
  assert.equal(resolveInGameDayPhase({ phase: "DAY", dayPhase: "DAY_DISCUSSION" }), INGAME_DAY_PHASES.DISCUSSION)
})
