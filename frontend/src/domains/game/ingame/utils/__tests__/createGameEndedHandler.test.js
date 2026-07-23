import test from "node:test"
import assert from "node:assert/strict"
import { createGameEndedHandler } from "../createGameEndedHandler.js"

function recorder() {
  const calls = []
  return { fn: (...args) => calls.push(args), calls }
}

test("payload.gameId가 현재 gameId와 같으면 clearGame 후 navigate('/multiplay')가 순서대로 호출된다", () => {
  const clearGame = recorder()
  const navigate = recorder()
  const order = []
  const handler = createGameEndedHandler({
    getCurrentGameId: () => "game-1",
    clearGame: (...args) => {
      order.push("clearGame")
      clearGame.fn(...args)
    },
    navigate: (...args) => {
      order.push("navigate")
      navigate.fn(...args)
    },
  })

  handler({ gameId: "game-1", reason: "PARTICIPANT_LEFT" })

  assert.equal(clearGame.calls.length, 1)
  assert.equal(navigate.calls.length, 1)
  assert.deepEqual(navigate.calls[0], ["/multiplay"])
  assert.deepEqual(order, ["clearGame", "navigate"])
})

test("payload.gameId가 현재 gameId와 다르면(stale 이벤트) clearGame/navigate 모두 호출되지 않는다", () => {
  const clearGame = recorder()
  const navigate = recorder()
  const handler = createGameEndedHandler({
    getCurrentGameId: () => "game-current",
    clearGame: clearGame.fn,
    navigate: navigate.fn,
  })

  handler({ gameId: "game-old", reason: "PARTICIPANT_LEFT" })

  assert.equal(clearGame.calls.length, 0)
  assert.equal(navigate.calls.length, 0)
})

test("payload가 null이거나 gameId가 없는 malformed 객체면 조용히 무시된다", () => {
  const clearGame = recorder()
  const navigate = recorder()
  const handler = createGameEndedHandler({
    getCurrentGameId: () => "game-current",
    clearGame: clearGame.fn,
    navigate: navigate.fn,
  })

  assert.doesNotThrow(() => handler(null))
  assert.doesNotThrow(() => handler({}))
  assert.doesNotThrow(() => handler(undefined))

  assert.equal(clearGame.calls.length, 0)
  assert.equal(navigate.calls.length, 0)
})

test("getCurrentGameId는 호출 시점에 지연 조회된다 — 생성 시점 값을 캡처하지 않는다", () => {
  let currentGameId = "game-a"
  const clearGame = recorder()
  const navigate = recorder()
  const handler = createGameEndedHandler({
    getCurrentGameId: () => currentGameId,
    clearGame: clearGame.fn,
    navigate: navigate.fn,
  })

  // 핸들러 생성 이후 현재 gameId가 바뀐다(새 GameSession 시작을 흉내낸다).
  currentGameId = "game-b"

  // 생성 시점 값("game-a")을 캡처했다면 이 호출도 무시돼야 하지만, 최신 값을 읽는다면
  // "game-b"와 일치해 정상 처리되어야 한다.
  handler({ gameId: "game-b", reason: "PARTICIPANT_LEFT" })

  assert.equal(clearGame.calls.length, 1)
  assert.equal(navigate.calls.length, 1)
})
