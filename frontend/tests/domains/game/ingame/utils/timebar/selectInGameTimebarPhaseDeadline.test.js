import assert from "node:assert/strict"
import test from "node:test"
import { selectInGameTimebarPhaseDeadline } from "../../../../../../src/domains/game/ingame/utils/timebar/phaseDeadline.js"

const NIGHT_DEADLINE = 1_700_000_000_000
const DAY_DEADLINE = 1_700_000_060_000

test("selectInGameTimebarPhaseDeadline: NIGHT는 nightTurnDeadline을 쓴다(역할 없어도 deadline만 있으면)", () => {
  assert.equal(
    selectInGameTimebarPhaseDeadline({
      phase: "NIGHT",
      dayIndex: 1,
      nightTurnRole: null,
      nightTurnDeadline: NIGHT_DEADLINE,
    }),
    NIGHT_DEADLINE,
  )
})

test("selectInGameTimebarPhaseDeadline: DAY는 dayPhaseDeadline을 쓴다", () => {
  assert.equal(
    selectInGameTimebarPhaseDeadline({ phase: "DAY", dayIndex: 1, dayPhaseDeadline: DAY_DEADLINE }),
    DAY_DEADLINE,
  )
})

test("selectInGameTimebarPhaseDeadline: TRIBUNAL 등은 null", () => {
  assert.equal(selectInGameTimebarPhaseDeadline({ phase: "TRIBUNAL", dayIndex: 1 }), null)
})
