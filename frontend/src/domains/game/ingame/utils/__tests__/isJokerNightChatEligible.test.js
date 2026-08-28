import test from "node:test"
import assert from "node:assert/strict"
import { isJokerNightChatEligible } from "../isJokerNightChatEligible.js"

test("isJokerNightChatEligible: state가 null이면 false다", () => {
  assert.equal(isJokerNightChatEligible(null), false)
})

test("isJokerNightChatEligible: state.self가 없는 미완성 state는 false다", () => {
  assert.equal(isJokerNightChatEligible({ phase: "NIGHT" }), false)
})

/** phase/team/생존 여부만 바꿔가며 판정하기 위한 최소 canonical state. */
function jokerState({ phase = "NIGHT", team = "JOKER", alive = true } = {}) {
  return {
    phase,
    players: [
      { uuid: "me", nickname: "me", alive },
      { uuid: "other", nickname: "other", alive: true },
    ],
    self: { uuid: "me", nickname: "me", role: team === "JOKER" ? "JOKER" : "CITIZEN", team },
  }
}

test("isJokerNightChatEligible: phase가 NIGHT이고 self.team이 JOKER면 true다", () => {
  assert.equal(isJokerNightChatEligible(jokerState()), true)
})

test("isJokerNightChatEligible: phase가 NIGHT이고 self.team이 CITIZEN이면 false다", () => {
  assert.equal(isJokerNightChatEligible(jokerState({ team: "CITIZEN" })), false)
})

test("isJokerNightChatEligible: phase가 ROLE_REVEAL이고 self.team이 JOKER여도 false다", () => {
  assert.equal(isJokerNightChatEligible(jokerState({ phase: "ROLE_REVEAL" })), false)
})

test("isJokerNightChatEligible: 사망한 JOKER도 NIGHT이면 true다(죽은 광대만의 확정 특례)", () => {
  // 밤에 사망자의 DEAD 채널은 닫히지만(inGameChatChannel), 죽은 광대의 JOKER 채널은 열린다.
  assert.equal(isJokerNightChatEligible(jokerState({ alive: false })), true)
})

test("isJokerNightChatEligible: canonical roster에서 생존 여부를 확인할 수 없으면 false다(fail-closed)", () => {
  // roster 자체가 없거나 self가 roster에 없으면 canonical state를 신뢰할 수 없다 — 생사와
  // 무관하게 자격을 주는 규칙이어도 "state를 아직 못 믿는 상태"에서는 열지 않는다.
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
