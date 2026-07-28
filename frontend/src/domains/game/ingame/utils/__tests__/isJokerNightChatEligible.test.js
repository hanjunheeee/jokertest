import test from "node:test"
import assert from "node:assert/strict"
import { isJokerNightChatEligible } from "../isJokerNightChatEligible.js"

test("isJokerNightChatEligible: state가 null이면 false다", () => {
  assert.equal(isJokerNightChatEligible(null), false)
})

test("isJokerNightChatEligible: state.self가 없는 미완성 state는 false다", () => {
  assert.equal(isJokerNightChatEligible({ phase: "NIGHT" }), false)
})

test("isJokerNightChatEligible: phase가 NIGHT이고 self.team이 JOKER면 true다", () => {
  assert.equal(isJokerNightChatEligible({ phase: "NIGHT", self: { team: "JOKER" } }), true)
})

test("isJokerNightChatEligible: phase가 NIGHT이고 self.team이 CITIZEN이면 false다", () => {
  assert.equal(isJokerNightChatEligible({ phase: "NIGHT", self: { team: "CITIZEN" } }), false)
})

test("isJokerNightChatEligible: phase가 ROLE_REVEAL이고 self.team이 JOKER여도 false다", () => {
  assert.equal(isJokerNightChatEligible({ phase: "ROLE_REVEAL", self: { team: "JOKER" } }), false)
})
