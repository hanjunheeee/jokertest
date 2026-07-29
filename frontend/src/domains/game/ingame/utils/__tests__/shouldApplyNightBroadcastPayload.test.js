import test from "node:test"
import assert from "node:assert/strict"
import { shouldApplyNightBroadcastPayload } from "../shouldApplyNightBroadcastPayload.js"

test("payload.gameId가 활성 gameId와 일치하면 true를 반환한다", () => {
  assert.equal(
    shouldApplyNightBroadcastPayload({ payload: { gameId: "g1", dayIndex: 0 }, gameId: "g1" }),
    true,
  )
})

test("payload.gameId가 활성 gameId와 다르면 false를 반환한다(stale 방송 거부)", () => {
  assert.equal(
    shouldApplyNightBroadcastPayload({ payload: { gameId: "g0" }, gameId: "g1" }),
    false,
  )
})

test("활성 gameId가 없으면 항상 false를 반환한다", () => {
  assert.equal(shouldApplyNightBroadcastPayload({ payload: { gameId: "g1" }, gameId: null }), false)
})

test("payload가 객체가 아니거나 null/배열이면 false를 반환한다", () => {
  assert.equal(shouldApplyNightBroadcastPayload({ payload: null, gameId: "g1" }), false)
  assert.equal(shouldApplyNightBroadcastPayload({ payload: "g1", gameId: "g1" }), false)
  assert.equal(shouldApplyNightBroadcastPayload({ payload: ["g1"], gameId: "g1" }), false)
})

test("payload.gameId가 문자열이 아니거나 빈 문자열이면 false를 반환한다", () => {
  assert.equal(shouldApplyNightBroadcastPayload({ payload: { gameId: 1 }, gameId: "g1" }), false)
  assert.equal(shouldApplyNightBroadcastPayload({ payload: { gameId: "  " }, gameId: "  " }), false)
})
