import test from "node:test"
import assert from "node:assert/strict"
import { formatInGameTimebarClock } from "../../../../../../src/domains/game/ingame/utils/timebar/format.js"

test("formatInGameTimebarClock: MM:SS", () => {
  assert.equal(formatInGameTimebarClock(157), "02:37")
  assert.equal(formatInGameTimebarClock(86), "01:26")
  assert.equal(formatInGameTimebarClock(0), "00:00")
})
