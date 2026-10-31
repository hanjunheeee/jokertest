import test from "node:test"
import assert from "node:assert/strict"
import { isJokerNightChatEligible } from "../isJokerNightChatEligible.js"

test("isJokerNightChatEligible: state가 null이면 false다", () => {
  assert.equal(isJokerNightChatEligible(null), false)
})

test("isJokerNightChatEligible: state.self가 없는 미완성 state는 false다", () => {
  assert.equal(isJokerNightChatEligible({ phase: "NIGHT" }), false)
})

function jokerState({ phase = "NIGHT", role = "JOKER", alive = true } = {}) {
  return {
    phase,
    players: [
      { uuid: "me", nickname: "me", alive },
      { uuid: "other", nickname: "other", alive: true },
    ],
    self: { uuid: "me", nickname: "me", role, team: role === "JOKER" ? "JOKER" : "CITIZEN" },
  }
}

test("isJokerNightChatEligible: phase가 NIGHT이고 self.team이 JOKER면 true다", () => {
  assert.equal(isJokerNightChatEligible(jokerState()), true)
})

test("isJokerNightChatEligible: NIGHT의 모든 생존 역할은 true다", () => {
  for (const role of ["JOKER", "CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    assert.equal(isJokerNightChatEligible(jokerState({ role })), true, role)
  }
})

test("isJokerNightChatEligible: phase가 ROLE_REVEAL이고 self.team이 JOKER여도 false다", () => {
  assert.equal(isJokerNightChatEligible(jokerState({ phase: "ROLE_REVEAL" })), false)
})

test("isJokerNightChatEligible: 사망한 JOKER도 NIGHT이면 true다(죽은 광대만의 확정 특례)", () => {
  assert.equal(isJokerNightChatEligible(jokerState({ alive: false })), true)
})

test("isJokerNightChatEligible: 사망한 비-JOKER는 NIGHT이어도 false다", () => {
  for (const role of ["CITIZEN", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
    assert.equal(isJokerNightChatEligible(jokerState({ role, alive: false })), false, role)
  }
})

test("isJokerNightChatEligible: canonical roster에서 생존 여부를 확인할 수 없으면 false다(fail-closed)", () => {
  assert.equal(isJokerNightChatEligible({ phase: "NIGHT", self: { uuid: "me", team: "JOKER" } }), false)
  assert.equal(
    isJokerNightChatEligible({
      phase: "NIGHT",
      players: [{ uuid: "someone-else", alive: true }],
      self: { uuid: "me", team: "JOKER" },
    }),
    false,
  )
})
