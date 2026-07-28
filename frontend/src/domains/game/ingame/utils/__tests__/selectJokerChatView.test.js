import test from "node:test"
import assert from "node:assert/strict"
import { selectJokerChatView } from "../selectJokerChatView.js"

test("selectJokerChatView: state.gameId === currentGameId면 state의 값을 그대로 반환한다", () => {
  const state = { gameId: "game-1", draft: "hi", messages: [{ id: "m1" }], status: "sending", error: "e" }
  const view = selectJokerChatView(state, "game-1")
  assert.deepEqual(view, { draft: "hi", messages: [{ id: "m1" }], status: "sending", error: "e" })
})

test("selectJokerChatView: state.gameId !== currentGameId면 draft/messages/status/error가 마스킹된다", () => {
  const state = { gameId: "game-1", draft: "hi", messages: [{ id: "m1" }], status: "sending", error: "e" }
  const view = selectJokerChatView(state, "game-2")
  assert.deepEqual(view, { draft: "", messages: [], status: "idle", error: null })
})
