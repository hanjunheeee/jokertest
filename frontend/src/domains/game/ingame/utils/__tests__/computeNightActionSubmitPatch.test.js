import test from "node:test"
import assert from "node:assert/strict"
import { computeNightActionSubmitPatch } from "../computeNightActionSubmitPatch.js"

test("{ok:true}면 {status:'idle', error:null}을 반환한다", () => {
  assert.deepEqual(computeNightActionSubmitPatch({ ok: true }), { status: "idle", error: null })
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

test("세 경우 모두 status는 항상 'idle'이다(재제출 가능 정책의 pure-level 증거)", () => {
  assert.equal(computeNightActionSubmitPatch({ ok: true }).status, "idle")
  assert.equal(computeNightActionSubmitPatch({ ok: false, message: "X" }).status, "idle")
  assert.equal(computeNightActionSubmitPatch({ ok: false }).status, "idle")
})
