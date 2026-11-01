import test from "node:test"
import assert from "node:assert/strict"
import { createGameEndedHandler } from "../../../../../src/domains/game/ingame/utils/sessionEnd.js"

function recorder() {
  const calls = []
  return { fn: (...args) => calls.push(args), calls }
}

test("payload.gameId가 현재 gameId와 같으면 finalize가 호출된다", () => {
  const finalize = recorder()
  const handler = createGameEndedHandler({
    getCurrentGameId: () => "game-1",
    finalize: finalize.fn,
  })

  handler({ gameId: "game-1", reason: "PARTICIPANT_LEFT" })

  assert.equal(finalize.calls.length, 1)
})

test("payload.gameId가 현재 gameId와 다르면(stale 이벤트) finalize가 호출되지 않는다", () => {
  const finalize = recorder()
  const handler = createGameEndedHandler({
    getCurrentGameId: () => "game-current",
    finalize: finalize.fn,
  })

  handler({ gameId: "game-old", reason: "PARTICIPANT_LEFT" })

  assert.equal(finalize.calls.length, 0)
})

test("payload가 null이거나 gameId가 없는 malformed 객체면 조용히 무시된다", () => {
  const finalize = recorder()
  const handler = createGameEndedHandler({
    getCurrentGameId: () => "game-current",
    finalize: finalize.fn,
  })

  assert.doesNotThrow(() => handler(null))
  assert.doesNotThrow(() => handler({}))
  assert.doesNotThrow(() => handler(undefined))

  assert.equal(finalize.calls.length, 0)
})

test("getCurrentGameId는 호출 시점에 지연 조회된다 — 생성 시점 값을 캡처하지 않는다", () => {
  let currentGameId = "game-a"
  const finalize = recorder()
  const handler = createGameEndedHandler({
    getCurrentGameId: () => currentGameId,
    finalize: finalize.fn,
  })

  currentGameId = "game-b"

  handler({ gameId: "game-b", reason: "PARTICIPANT_LEFT" })

  assert.equal(finalize.calls.length, 1)
})
