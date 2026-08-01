import test from "node:test"
import assert from "node:assert/strict"

import {
  computeDayVoteSubmitPatch,
  INITIAL_DAY_VOTE_SUBMIT_STATE,
} from "../computeDayVoteSubmitPatch.js"

test("INITIAL_DAY_VOTE_SUBMIT_STATE: hasSubmitted가 false다(초기/리셋 상태에서는 표시 조건이 false)", () => {
  assert.deepEqual(INITIAL_DAY_VOTE_SUBMIT_STATE, {
    status: "idle",
    error: null,
    hasSubmitted: false,
    lastSubmittedTargetId: null,
  })
})

test("computeDayVoteSubmitPatch: {ok:true} 대상 제출은 hasSubmitted:true와 제출한 targetId를 반영한다", () => {
  const patch = computeDayVoteSubmitPatch(INITIAL_DAY_VOTE_SUBMIT_STATE, { ok: true }, "target-uuid")

  assert.deepEqual(patch, { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: "target-uuid" })
})

test("computeDayVoteSubmitPatch: {ok:true} 기권(targetId:null) 제출은 hasSubmitted:true와 lastSubmittedTargetId:null을 반영한다(미제출과 구분됨)", () => {
  const patch = computeDayVoteSubmitPatch(INITIAL_DAY_VOTE_SUBMIT_STATE, { ok: true }, null)

  assert.deepEqual(patch, { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: null })
  assert.notDeepEqual(patch, INITIAL_DAY_VOTE_SUBMIT_STATE)
})

test("computeDayVoteSubmitPatch: {ok:false, code, message}은 error를 반영하고 이전 hasSubmitted/lastSubmittedTargetId를 그대로 유지한다", () => {
  const prevState = { status: "submitting", error: null, hasSubmitted: true, lastSubmittedTargetId: "prev-target" }

  const patch = computeDayVoteSubmitPatch(prevState, { ok: false, code: "TARGET_NOT_ALIVE", message: "대상이 사망했습니다." }, "new-target")

  assert.deepEqual(patch, {
    status: "idle",
    error: { code: "TARGET_NOT_ALIVE", message: "대상이 사망했습니다." },
    hasSubmitted: true,
    lastSubmittedTargetId: "prev-target",
  })
})

test("computeDayVoteSubmitPatch: ackResult가 null/undefined면 UNKNOWN_ERROR/기본 메시지로 대체되고 이전 이력은 유지된다", () => {
  const prevState = { status: "submitting", error: null, hasSubmitted: false, lastSubmittedTargetId: null }

  const patch = computeDayVoteSubmitPatch(prevState, undefined, "target-uuid")

  assert.deepEqual(patch, {
    status: "idle",
    error: { code: "UNKNOWN_ERROR", message: "요청을 처리하지 못했습니다." },
    hasSubmitted: false,
    lastSubmittedTargetId: null,
  })
})
