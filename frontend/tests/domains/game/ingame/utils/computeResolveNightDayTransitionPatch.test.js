import test from "node:test"
import assert from "node:assert/strict"
import { computeResolveNightDayTransitionPatch } from "../../../../../src/domains/game/ingame/utils/computeResolveNightDayTransitionPatch.js"
import { computeResolveNightInvalidatePatch } from "../../../../../src/domains/game/ingame/utils/computeResolveNightInvalidatePatch.js"

test("mounted면 status/error만 초기화한다", () => {
  assert.deepEqual(computeResolveNightDayTransitionPatch(true), { status: "idle", error: null })
})

test("nightActionResult 키 자체가 없다 — 낮 전이는 개인 결과를 폐기하지 않는다", () => {
  assert.equal(Object.hasOwn(computeResolveNightDayTransitionPatch(true), "nightActionResult"), false)
})

test("mounted가 아니면 null이다(state를 건드리지 않는다)", () => {
  assert.equal(computeResolveNightDayTransitionPatch(false), null)
})

test("무효화 패치와 달리 개인 결과를 남긴다 — 두 패치의 차이가 nightActionResult 하나다", () => {
  const invalidate = computeResolveNightInvalidatePatch(true)
  assert.equal(invalidate.nightActionResult, null)
  assert.equal(invalidate.status, computeResolveNightDayTransitionPatch(true).status)
  assert.equal(invalidate.error, computeResolveNightDayTransitionPatch(true).error)
})
