import test from "node:test"
import assert from "node:assert/strict"
import { mapGamePhaseToTimebarPhaseId } from "../ingameTimebarAssets.js"

test("ROLE_REVEAL은 discussion으로 매핑된다", () => {
  assert.equal(mapGamePhaseToTimebarPhaseId("ROLE_REVEAL"), "discussion")
})

test("NIGHT은 night으로 매핑된다", () => {
  assert.equal(mapGamePhaseToTimebarPhaseId("NIGHT"), "night")
})

test("TRIBUNAL은 vote로 매핑된다", () => {
  assert.equal(mapGamePhaseToTimebarPhaseId("TRIBUNAL"), "vote")
})

test("ENDED는 result로 매핑된다", () => {
  assert.equal(mapGamePhaseToTimebarPhaseId("ENDED"), "result")
})

test("알 수 없는 값은 기존처럼 discussion으로 매핑된다(default 회귀)", () => {
  assert.equal(mapGamePhaseToTimebarPhaseId("UNKNOWN_PHASE"), "discussion")
})

test("undefined는 기존처럼 discussion으로 매핑된다(전환 전 gameState?.phase와 동일 입력, default 회귀)", () => {
  assert.equal(mapGamePhaseToTimebarPhaseId(undefined), "discussion")
})
