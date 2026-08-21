import test from "node:test"
import assert from "node:assert/strict"
import { computeResolveNightInvalidatePatch } from "../computeResolveNightInvalidatePatch.js"

test("mounted:true면 status/error를 초기값으로 되돌린다(개인 조사 결과는 store 소유라 건드리지 않는다)", () => {
  assert.deepEqual(computeResolveNightInvalidatePatch(true), {
    status: "idle",
    error: null,
  })
})

test("mounted:false면 null을 반환해 state를 건드리지 않는다", () => {
  assert.equal(computeResolveNightInvalidatePatch(false), null)
})
