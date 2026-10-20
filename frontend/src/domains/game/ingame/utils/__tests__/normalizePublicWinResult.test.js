import test from "node:test"
import assert from "node:assert/strict"

import { normalizePublicWinResult } from "../normalizePublicWinResult.js"

const VALID_REVEALS = [
  { uuid: "p1", nickname: "A", role: "JOKER", team: "JOKER", alive: true, deathReason: null },
  { uuid: "p2", nickname: "B", role: "DOCTOR", team: "CITIZEN", alive: false, deathReason: "NIGHT" },
]

test("winner만 있으면 { winner }만 돌려준다", () => {
  assert.deepEqual(normalizePublicWinResult({ winner: "JOKER" }), { winner: "JOKER" })
})

test("reveals가 유효하면 winner와 함께 보존한다", () => {
  assert.deepEqual(normalizePublicWinResult({ winner: "CITIZEN", reveals: VALID_REVEALS }), {
    winner: "CITIZEN",
    reveals: VALID_REVEALS,
  })
})

test("mvp.uuid가 유효하면 보존한다", () => {
  assert.deepEqual(
    normalizePublicWinResult({ winner: "JOKER", reveals: VALID_REVEALS, mvp: { uuid: "p1", extra: true } }),
    { winner: "JOKER", reveals: VALID_REVEALS, mvp: { uuid: "p1" } },
  )
})

test("알 수 없는 winner·형태 불량은 null이다", () => {
  assert.equal(normalizePublicWinResult(null), null)
  assert.equal(normalizePublicWinResult({ winner: "NOBODY" }), null)
  assert.equal(normalizePublicWinResult(["JOKER"]), null)
})

test("깨진 reveal 원소는 건너뛰고 나머지만 남긴다", () => {
  const result = normalizePublicWinResult({
    winner: "JOKER",
    reveals: [VALID_REVEALS[0], { uuid: "bad" }, VALID_REVEALS[1]],
  })

  assert.deepEqual(result, { winner: "JOKER", reveals: VALID_REVEALS })
})

test("extra 키는 버린다", () => {
  assert.deepEqual(normalizePublicWinResult({ winner: "CITIZEN", extra: true }), { winner: "CITIZEN" })
})
