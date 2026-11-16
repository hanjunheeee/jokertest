// 방 만들기 직접 지정 계산 시험: 직접 지정 검사 글, 직업 칸 고를 수 있는 범위, 남는 시민 수
// 목록 A01a "화면 PC" A01-F-034~048
import test from "node:test"
import assert from "node:assert/strict"

const { validateRoleComposition, getRoleCountRange, deriveCitizenCount } =
  await import("../../src/domains/game/setup/utils/roleComposition.js")

// 구성 줄임말 → 직업 수 (예: "J2D1" → { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 })
const counts = (code) => {
  const map = { J: "JOKER", D: "DOCTOR", G: "GUARD", W: "WITCH_HUNTER" }
  const out = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }
  for (const [, letter, n] of code.matchAll(/([JDGW])(\d)/g)) out[map[letter]] = Number(n)
  return out
}

const custom = (maxPlayers, code) => validateRoleComposition({ mode: "custom", roleCounts: counts(code), maxPlayers })

test("A01-F-034 정원 5 J1 → 통과", () => {
  assert.deepEqual(custom(5, "J1"), { ok: true })
})

test("A01-F-035 정원 5 J0 → '광대는 최소 1명이어야 합니다.'", () => {
  const r = custom(5, "J0")
  assert.equal(r.ok, false)
  assert.equal(r.message, "광대는 최소 1명이어야 합니다.")
})

test("A01-F-036 정원 5 J3 → '광대는 최대 2명까지…'", () => {
  const r = custom(5, "J3")
  assert.equal(r.ok, false)
  assert.match(r.message, /^광대는 최대 2명까지/)
})

test("A01-F-037 정원 5 J1D3 → '특수직업은 각각 최대 2명까지…'", () => {
  const r = custom(5, "J1D3")
  assert.equal(r.ok, false)
  assert.match(r.message, /^특수직업은 각각 최대 2명까지/)
})

test("A01-F-038 정원 5 J2D2G1W1 → '지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.'", () => {
  const r = custom(5, "J2D2G1W1")
  assert.equal(r.ok, false)
  assert.equal(r.message, "지정한 역할 인원의 합이 최대 플레이어 수를 넘습니다.")
})

test("A01-F-039 정원 6 J2D2G1W1 → 통과", () => {
  assert.deepEqual(custom(6, "J2D2G1W1"), { ok: true })
})

test("A01-F-040 정원 5 J2D1G1W1 → 통과 (시민 0명)", () => {
  assert.deepEqual(custom(5, "J2D1G1W1"), { ok: true })
})

test("A01-F-041 자동은 늘 통과 (이상한 수를 줘도)", () => {
  assert.deepEqual(validateRoleComposition({ mode: "auto", roleCounts: counts("J3D3"), maxPlayers: 5 }), { ok: true })
})

// 직업 칸 고를 수 있는 범위
const RANGE_CASES = [
  ["A01-F-042", "광대", "JOKER", 5, { min: 1, max: 2 }],
  ["A01-F-043", "의사", "DOCTOR", 5, { min: 0, max: 2 }],
  ["A01-F-044", "광대", "JOKER", 10, { min: 1, max: 2 }],
  ["A01-F-045", "경비원", "GUARD", 10, { min: 0, max: 2 }],
]

for (const [no, label, role, maxPlayers, expected] of RANGE_CASES) {
  test(`${no} ${label} 칸 정원 ${maxPlayers} → ${expected.min}~${expected.max}`, () => {
    assert.deepEqual(getRoleCountRange(role, maxPlayers), expected)
  })
}

// 남는 시민 수
const CITIZEN_CASES = [
  ["A01-F-046", 10, "J1D1", 8],
  ["A01-F-047", 5, "J2D1G1W1", 0],
  ["A01-F-048", 5, "J2D2G2", null],
]

for (const [no, maxPlayers, code, expected] of CITIZEN_CASES) {
  test(`${no} 정원 ${maxPlayers} ${code} → 시민 ${expected === null ? "계산 못 함(null)" : expected}`, () => {
    assert.equal(deriveCitizenCount(maxPlayers, counts(code)), expected)
  })
}
