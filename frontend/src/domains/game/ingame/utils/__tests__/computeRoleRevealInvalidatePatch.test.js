import test from "node:test"
import assert from "node:assert/strict"
import { computeRoleRevealInvalidatePatch } from "../computeRoleRevealInvalidatePatch.js"

test("mounted면 이전 상태와 무관하게 항상 {status:'idle', error:null}을 반환한다", () => {
  assert.deepEqual(computeRoleRevealInvalidatePatch(true), { status: "idle", error: null })
})

test("unmounted면 null을 반환한다(React state를 건드리지 않아야 함)", () => {
  assert.equal(computeRoleRevealInvalidatePatch(false), null)
})
