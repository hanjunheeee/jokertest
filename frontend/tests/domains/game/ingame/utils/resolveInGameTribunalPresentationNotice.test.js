import test from "node:test"
import assert from "node:assert/strict"

import {
  TRIBUNAL_DEAD_NOTICE,
  TRIBUNAL_DEFENDANT_NOTICE,
  TRIBUNAL_VOTE_SUBMITTED_NOTICE,
} from "../../../../../src/domains/game/ingame/constants/actions/ingameActionPanel.js"
import { resolveInGameTribunalPresentationNotice } from "../../../../../src/domains/game/ingame/utils/resolveInGameTribunalPresentationNotice.js"

test("resolveInGameTribunalPresentationNotice: 피고인은 피고인 안내를 본다", () => {
  assert.equal(
    resolveInGameTribunalPresentationNotice({ isDefendant: true, status: "submitted" }),
    TRIBUNAL_DEFENDANT_NOTICE,
  )
})

test("resolveInGameTribunalPresentationNotice: 투표를 마친 유권자는 완료 안내를 본다", () => {
  assert.equal(
    resolveInGameTribunalPresentationNotice({ status: "submitted" }),
    TRIBUNAL_VOTE_SUBMITTED_NOTICE,
  )
  assert.equal(
    resolveInGameTribunalPresentationNotice({ hasSubmitted: true }),
    TRIBUNAL_VOTE_SUBMITTED_NOTICE,
  )
})

test("resolveInGameTribunalPresentationNotice: 사망자는 사망 안내를 본다", () => {
  assert.equal(
    resolveInGameTribunalPresentationNotice({ alive: false }),
    TRIBUNAL_DEAD_NOTICE,
  )
})
