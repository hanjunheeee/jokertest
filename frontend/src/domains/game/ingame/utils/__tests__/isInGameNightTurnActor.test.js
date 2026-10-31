import test from "node:test"
import assert from "node:assert/strict"
import { isInGameNightTurnActor } from "../isInGameNightTurnActor.js"
import { getInGameNightTurnRoleLabel } from "../getInGameNightTurnRoleLabel.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"

test("isInGameNightTurnActor: 현재 턴 역할과 내 직업이 같으면 true다(행동 패널 활성 조건)", () => {
  for (const { role } of INGAME_NIGHT_TURN_ANNOUNCEMENTS) {
    assert.equal(isInGameNightTurnActor(role, role), true, `${role} 턴의 ${role}은 행동할 수 있다`)
  }
})

test("isInGameNightTurnActor: 현재 턴 역할과 내 직업이 다르면 false다(행동 패널 비활성 조건)", () => {
  assert.equal(isInGameNightTurnActor("JOKER", "DOCTOR"), false)
  assert.equal(isInGameNightTurnActor("DOCTOR", "JOKER"), false)
  assert.equal(isInGameNightTurnActor("GUARD", "CITIZEN"), false)
  assert.equal(isInGameNightTurnActor("WITCH_HUNTER", "GUARD"), false)
})

test("isInGameNightTurnActor: 진행 중인 턴이 없으면 누구도 행동할 수 없다(fail-closed)", () => {
  assert.equal(isInGameNightTurnActor(null, "JOKER"), false)
  assert.equal(isInGameNightTurnActor(undefined, "JOKER"), false)
  assert.equal(isInGameNightTurnActor("", "JOKER"), false)
})

test("isInGameNightTurnActor: 내 직업을 모르면(미배정) 행동할 수 없다", () => {
  assert.equal(isInGameNightTurnActor("JOKER", null), false)
  assert.equal(isInGameNightTurnActor("JOKER", undefined), false)
  assert.equal(isInGameNightTurnActor("JOKER", ""), false)
})

test("isInGameNightTurnActor: 같은 값이면 문자열 외 타입에도 참을 주지 않는다", () => {
  assert.equal(isInGameNightTurnActor(0, 0), false)
  assert.equal(isInGameNightTurnActor(null, null), false)
})

test("getInGameNightTurnRoleLabel: 상태바 표기는 안내 문구의 '○○'와 정확히 같다", () => {
  for (const { role, label, message } of INGAME_NIGHT_TURN_ANNOUNCEMENTS) {
    assert.equal(getInGameNightTurnRoleLabel(role), label)
    assert.equal(message, `${label}의 시간입니다`, `${role} 표기가 안내 문구와 갈라지지 않는다`)
  }
})

test("getInGameNightTurnRoleLabel: 모르는 역할·비문자열은 null이다", () => {
  assert.equal(getInGameNightTurnRoleLabel("CITIZEN"), null)
  assert.equal(getInGameNightTurnRoleLabel("UNKNOWN"), null)
  assert.equal(getInGameNightTurnRoleLabel(null), null)
  assert.equal(getInGameNightTurnRoleLabel(""), null)
})
