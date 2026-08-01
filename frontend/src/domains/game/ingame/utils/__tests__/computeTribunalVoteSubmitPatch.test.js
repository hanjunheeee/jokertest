import test from "node:test"
import assert from "node:assert/strict"

import {
  computeTribunalVoteAckPatch,
  INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE,
} from "../computeTribunalVoteSubmitPatch.js"

test("computeTribunalVoteAckPatch: valid success ack returns submitted state", () => {
  const patch = computeTribunalVoteAckPatch({
    ok: true,
    gameId: "g1",
    dayIndex: 2,
    vote: "GUILTY",
  })

  assert.deepEqual(patch, {
    status: "submitted",
    submittedVote: "GUILTY",
    error: null,
  })
})

test("computeTribunalVoteAckPatch: invalid success ack fields return null", () => {
  const invalidAcks = [
    { ok: true, gameId: "", dayIndex: 2, vote: "GUILTY" },
    { ok: true, gameId: "g1", dayIndex: "2", vote: "GUILTY" },
    { ok: true, gameId: "g1", dayIndex: 2, vote: "APPROVE" },
  ]

  for (const ack of invalidAcks) {
    assert.equal(computeTribunalVoteAckPatch(ack), null)
  }
})

test("computeTribunalVoteAckPatch: valid failure message is preserved", () => {
  const message = "already submitted"
  const patch = computeTribunalVoteAckPatch({
    ok: false,
    message,
  })

  assert.deepEqual(patch, {
    status: "idle",
    submittedVote: null,
    error: message,
  })
})

test("computeTribunalVoteAckPatch: missing or invalid failure message uses fallback", () => {
  const missingMessagePatch = computeTribunalVoteAckPatch({
    ok: false,
  })

  const invalidMessagePatch = computeTribunalVoteAckPatch({
    ok: false,
    message: 123,
  })

  assert.equal(missingMessagePatch.status, "idle")
  assert.equal(missingMessagePatch.submittedVote, null)
  assert.equal(typeof missingMessagePatch.error, "string")
  assert.ok(missingMessagePatch.error.length > 0)

  assert.deepEqual(invalidMessagePatch, missingMessagePatch)
})

test("computeTribunalVoteAckPatch: non-plain-object responses return null", () => {
  const invalidResponses = [
    null,
    undefined,
    [],
  ]

  for (const response of invalidResponses) {
    assert.equal(computeTribunalVoteAckPatch(response), null)
  }
})

test("INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE is idle", () => {
  assert.deepEqual(INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE, {
    status: "idle",
    submittedVote: null,
    error: null,
  })
})
