import test from "node:test"
import assert from "node:assert/strict"
import {
  getInGameNightActionType,
  getInGameNightActionLabel,
  isSelfTargetAllowedForNightAction,
} from "../ingameActionPanel.js"

// 백엔드 isEligibleForNightAction(backend/game-core/gameSession.js)과 동일한 표 —
// 두 표가 나중에 어긋나지 않는지 회귀 방지.
const eligibilityTable = [
  ["JOKER", 0, "ASSASSINATE"],
  ["JOKER", 1, "ASSASSINATE"],
  ["DOCTOR", 0, "PROTECT"],
  ["DOCTOR", 1, "PROTECT"],
  ["GUARD", 0, "INVESTIGATE"],
  ["GUARD", 1, "INVESTIGATE"],
  ["WITCH_HUNTER", 0, null],
  ["WITCH_HUNTER", 1, "CONFIRM"],
  ["CITIZEN", 0, null],
  ["CITIZEN", 1, null],
]

for (const [role, dayIndex, expectedType] of eligibilityTable) {
  test(`getInGameNightActionType: ${role} × dayIndex ${dayIndex} → ${expectedType}`, () => {
    assert.equal(getInGameNightActionType(role, dayIndex), expectedType)
  })

  test(`getInGameNightActionLabel: ${role} × dayIndex ${dayIndex}는 ${expectedType === null ? "null" : "문자열"}이다`, () => {
    const label = getInGameNightActionLabel(role, dayIndex)
    if (expectedType === null) {
      assert.equal(label, null)
    } else {
      assert.equal(typeof label, "string")
      assert.notEqual(label.length, 0)
    }
  })
}

test("isSelfTargetAllowedForNightAction: DOCTOR만 true, 나머지는 false다", () => {
  assert.equal(isSelfTargetAllowedForNightAction("DOCTOR"), true)
  assert.equal(isSelfTargetAllowedForNightAction("JOKER"), false)
  assert.equal(isSelfTargetAllowedForNightAction("GUARD"), false)
  assert.equal(isSelfTargetAllowedForNightAction("WITCH_HUNTER"), false)
  assert.equal(isSelfTargetAllowedForNightAction("CITIZEN"), false)
})
