import test from "node:test"
import assert from "node:assert/strict"
import { attachNightTurnSocketListeners } from "../../../../../src/domains/game/ingame/utils/attachNightTurnSocketListeners.js"

test("attachNightTurnSocketListeners: started/ended를 등록하고 같은 참조로 해제한다", () => {
  const calls = []
  const socket = {
    on: (event, handler) => calls.push(["on", event, handler]),
    off: (event, handler) => calls.push(["off", event, handler]),
  }
  const onStarted = () => {}
  const onEnded = () => {}

  const detach = attachNightTurnSocketListeners(socket, { onStarted, onEnded })
  assert.deepEqual(calls, [
    ["on", "night_turn_started", onStarted],
    ["on", "night_turn_ended", onEnded],
  ])

  detach()
  assert.deepEqual(calls.slice(2), [
    ["off", "night_turn_started", onStarted],
    ["off", "night_turn_ended", onEnded],
  ])
})
