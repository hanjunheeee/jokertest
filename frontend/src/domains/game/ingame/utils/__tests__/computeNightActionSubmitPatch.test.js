import test from "node:test"
import assert from "node:assert/strict"
import { computeNightActionSubmitPatch } from "../computeNightActionSubmitPatch.js"

test("{ok:true}면 {status:'submitted', error:null}을 반환한다", () => {
  assert.deepEqual(computeNightActionSubmitPatch({ ok: true }), { status: "submitted", error: null })
})

test("{ok:false, message}면 그 message를 error로 담아 {status:'idle'}을 반환한다", () => {
  assert.deepEqual(computeNightActionSubmitPatch({ ok: false, message: "X" }), { status: "idle", error: "X" })
})

test("{ok:false}만 있고 message가 없으면 기본 에러 문구를 담는다", () => {
  const result = computeNightActionSubmitPatch({ ok: false })
  assert.equal(result.status, "idle")
  assert.equal(typeof result.error, "string")
  assert.notEqual(result.error, null)
})

test("성공은 'submitted'로 잠기고(중복 제출 방지) 실패는 재시도를 위해 'idle'로 남는다", () => {
  assert.equal(computeNightActionSubmitPatch({ ok: true }).status, "submitted")
  assert.equal(computeNightActionSubmitPatch({ ok: false, message: "X" }).status, "idle")
  assert.equal(computeNightActionSubmitPatch({ ok: false }).status, "idle")
})
