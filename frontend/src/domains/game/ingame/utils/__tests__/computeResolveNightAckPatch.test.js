import test from "node:test"
import assert from "node:assert/strict"
import { computeResolveNightAckPatch } from "../computeResolveNightAckPatch.js"

test("{ok:true}면 {status:'resolved', error:null}을 반환한다", () => {
  assert.deepEqual(computeResolveNightAckPatch({ ok: true }), { status: "resolved", error: null })
})

test("{ok:false, message}면 그 message를 error로 담아 {status:'idle'}을 반환한다", () => {
  assert.deepEqual(computeResolveNightAckPatch({ ok: false, message: "X" }), { status: "idle", error: "X" })
})

test("{ok:false}만 있고 message가 없으면 기본 에러 문구를 담는다", () => {
  const result = computeResolveNightAckPatch({ ok: false })
  assert.equal(result.status, "idle")
  assert.equal(typeof result.error, "string")
  assert.notEqual(result.error, null)
})

test("응답이 없어도(undefined) 실패로 취급해 status:'idle'을 반환한다", () => {
  const result = computeResolveNightAckPatch(undefined)
  assert.equal(result.status, "idle")
  assert.equal(typeof result.error, "string")
})
