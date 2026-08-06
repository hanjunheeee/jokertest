import test from "node:test"
import assert from "node:assert/strict"
import {
  deriveCitizenCount,
  getFixedRoleCount,
  getRoleCountRange,
  validateRoleComposition,
} from "../roleComposition.js"

function customInput({ roleCounts, maxPlayers = 8 } = {}) {
  return {
    mode: "custom",
    maxPlayers,
    roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, ...roleCounts },
  }
}

test("AUTO 모드는 roleCounts와 무관하게 항상 유효하다", () => {
  assert.equal(validateRoleComposition({ mode: "auto", maxPlayers: 8, roleCounts: {} }).ok, true)
  assert.equal(validateRoleComposition({ mode: "auto", maxPlayers: 4, roleCounts: null }).ok, true)
})

test("유효한 CUSTOM 구성은 통과한다(생성 가능 상태)", () => {
  assert.equal(validateRoleComposition(customInput()).ok, true)
  // 고정 역할 합이 정확히 정원과 같은 경우도 허용된다(시민 0명).
  assert.equal(
    validateRoleComposition(customInput({ maxPlayers: 4, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } })).ok,
    true,
  )
})

test("파생 시민 수는 정원에서 고정 역할 합을 뺀 값이다", () => {
  assert.equal(deriveCitizenCount(8, { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }), 3)
  assert.equal(deriveCitizenCount(10, { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }), 9)
  assert.equal(deriveCitizenCount(4, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }), 0)
  // 합계가 정원을 넘으면 "시민 -1명"처럼 보이지 않게 null(계산 불가)을 돌려준다.
  assert.equal(deriveCitizenCount(4, { JOKER: 2, DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 0 }), null)
  assert.equal(deriveCitizenCount(8, { JOKER: "2", DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 }), null)
  assert.equal(getFixedRoleCount({ JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }), 5)
})

test("숫자가 아닌 인원 값은 합계에서 숫자로 강제 변환되지 않는다", () => {
  // "2"를 2로 읽어 버리면 합계·파생 시민 수는 정상처럼 보이는데 서버는 거부한다.
  for (const invalid of ["2", true, null, undefined, [], {}]) {
    const roleCounts = { JOKER: 1, DOCTOR: invalid, GUARD: 0, WITCH_HUNTER: 0 }
    assert.equal(
      Number.isNaN(getFixedRoleCount(roleCounts)),
      true,
      `DOCTOR=${String(invalid)}면 합계는 NaN이어야 함`,
    )
    assert.equal(deriveCitizenCount(8, roleCounts), null)
  }
})

test("maxPlayers가 바뀌면 같은 roleCounts라도 검증 결과가 즉시 달라진다", () => {
  const roleCounts = { JOKER: 3, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }
  assert.equal(validateRoleComposition({ mode: "custom", maxPlayers: 8, roleCounts }).ok, true)

  const shrunk = validateRoleComposition({ mode: "custom", maxPlayers: 5, roleCounts })
  assert.equal(shrunk.ok, false)
  assert.equal(shrunk.code, "FIXED_ROLES_EXCEED_MAX_PLAYERS")

  // 정원이 광대 수 이하로 줄면 광대 조건이 먼저 걸린다.
  const tiny = validateRoleComposition({ mode: "custom", maxPlayers: 3, roleCounts })
  assert.equal(tiny.ok, false)
  assert.equal(tiny.code, "JOKER_COUNT_TOO_HIGH")
})

test("음수·소수·문자열·누락 값은 모두 거부한다", () => {
  for (const invalid of [-1, 1.5, "2", null, undefined, NaN, true, [], {}]) {
    const result = validateRoleComposition(customInput({ roleCounts: { DOCTOR: invalid } }))
    assert.equal(result.ok, false, `DOCTOR=${String(invalid)}는 거부돼야 함`)
    assert.equal(result.code, "INVALID_ROLE_COUNT")
  }
  // 키 자체가 없는 경우도 동일하게 거부한다(부분 payload를 0으로 채워 넣지 않는다).
  const missing = validateRoleComposition({
    mode: "custom",
    maxPlayers: 8,
    roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1 },
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, "INVALID_ROLE_COUNT")
})

test("JOKER=0 · JOKER>=maxPlayers · 합계>maxPlayers는 거부한다", () => {
  const zeroJoker = validateRoleComposition(customInput({ roleCounts: { JOKER: 0 } }))
  assert.equal(zeroJoker.ok, false)
  assert.equal(zeroJoker.code, "JOKER_COUNT_TOO_LOW")

  const tooManyJokers = validateRoleComposition(
    customInput({ maxPlayers: 4, roleCounts: { JOKER: 4, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } }),
  )
  assert.equal(tooManyJokers.ok, false)
  assert.equal(tooManyJokers.code, "JOKER_COUNT_TOO_HIGH")

  const overflow = validateRoleComposition(
    customInput({ maxPlayers: 4, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 0 } }),
  )
  assert.equal(overflow.ok, false)
  assert.equal(overflow.code, "FIXED_ROLES_EXCEED_MAX_PLAYERS")
})

test("CITIZEN 등 허용되지 않은 키가 있으면 거부한다", () => {
  const withCitizen = validateRoleComposition(customInput({ roleCounts: { CITIZEN: 3 } }))
  assert.equal(withCitizen.ok, false)
  assert.equal(withCitizen.code, "UNKNOWN_ROLE_KEY")

  const withServerField = validateRoleComposition(customInput({ roleCounts: { hostUuid: "x" } }))
  assert.equal(withServerField.ok, false)
  assert.equal(withServerField.code, "UNKNOWN_ROLE_KEY")
})

test("roleCounts가 객체가 아니거나 maxPlayers가 잘못되면 거부한다", () => {
  for (const invalid of [null, undefined, [], "x", 3]) {
    const result = validateRoleComposition({ mode: "custom", maxPlayers: 8, roleCounts: invalid })
    assert.equal(result.ok, false, `roleCounts=${String(invalid)}는 거부돼야 함`)
    assert.equal(result.code, "ROLE_COUNTS_NOT_OBJECT")
  }
  // customInput의 기본값(maxPlayers = 8)이 undefined를 덮어써 버리므로 직접 넘긴다.
  for (const invalid of [undefined, null, 0, -1, 1.5, "8", NaN]) {
    const badMax = validateRoleComposition({
      mode: "custom",
      maxPlayers: invalid,
      roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
    })
    assert.equal(badMax.ok, false, `maxPlayers=${String(invalid)}는 거부돼야 함`)
    assert.equal(badMax.code, "INVALID_MAX_PLAYERS")
  }
})

test("스테퍼 범위는 역할별 상한만 강제하고 합계는 강제하지 않는다", () => {
  // 광대는 정원보다 적어야 하고 서버의 기존 상한(4)도 넘을 수 없다.
  assert.deepEqual(getRoleCountRange("JOKER", 10), { min: 1, max: 4 })
  assert.deepEqual(getRoleCountRange("JOKER", 4), { min: 1, max: 3 })
  // 다른 역할은 0부터 정원까지 — 합계 초과는 검증 메시지와 버튼 비활성화가 처리한다.
  assert.deepEqual(getRoleCountRange("DOCTOR", 6), { min: 0, max: 6 })
})
