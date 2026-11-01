import test from "node:test"
import assert from "node:assert/strict"
import { formatInGameTimebarClock } from "../formatInGameTimebarClock.js"

test("formatInGameTimebarClock: MM:SS", () => {
  assert.equal(formatInGameTimebarClock(157), "02:37")
  assert.equal(formatInGameTimebarClock(86), "01:26")
  assert.equal(formatInGameTimebarClock(0), "00:00")
})
