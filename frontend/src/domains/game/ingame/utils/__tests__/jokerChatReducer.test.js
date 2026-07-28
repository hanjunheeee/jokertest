import test from "node:test"
import assert from "node:assert/strict"
import { jokerChatReducer } from "../jokerChatReducer.js"

const baseState = { gameId: "game-1", messages: [], draft: "", status: "idle", error: null }

test("jokerChatReducer: GAME_CHANGED로 다른 gameId면 전부 초기화되고 gameId가 갱신된다", () => {
  const state = { gameId: "game-1", messages: [{ id: "m1" }], draft: "hi", status: "sending", error: "err" }
  const next = jokerChatReducer(state, { type: "GAME_CHANGED", gameId: "game-2" })
  assert.deepEqual(next, { gameId: "game-2", messages: [], draft: "", status: "idle", error: null })
})

test("jokerChatReducer: GAME_CHANGED로 같은 gameId면 완전히 동일한 state 참조를 반환한다", () => {
  const state = { ...baseState }
  const next = jokerChatReducer(state, { type: "GAME_CHANGED", gameId: "game-1" })
  assert.equal(next, state)
})

test("jokerChatReducer: RECEIVE가 현재 gameId와 같으면 messages 끝에 메시지가 추가되고 나머지는 불변이다", () => {
  const state = { ...baseState, messages: [{ id: "m1" }], draft: "draft", status: "idle", error: null }
  const message = { id: "m2" }
  const next = jokerChatReducer(state, { type: "RECEIVE", gameId: "game-1", message })
  assert.deepEqual(next.messages, [{ id: "m1" }, { id: "m2" }])
  assert.equal(next.draft, "draft")
  assert.equal(next.status, "idle")
  assert.equal(next.error, null)
})

test("jokerChatReducer: RECEIVE가 다른(새) gameId면 초기화된 뒤 그 메시지 하나만 담긴다", () => {
  const state = { gameId: "game-1", messages: [{ id: "old" }], draft: "old-draft", status: "sending", error: "old-error" }
  const message = { id: "new" }
  const next = jokerChatReducer(state, { type: "RECEIVE", gameId: "game-2", message })
  assert.deepEqual(next, { gameId: "game-2", messages: [{ id: "new" }], draft: "", status: "idle", error: null })
})

test("jokerChatReducer: DRAFT가 현재 gameId와 같으면 draft만 변경된다", () => {
  const state = { ...baseState, draft: "old" }
  const next = jokerChatReducer(state, { type: "DRAFT", gameId: "game-1", draft: "new" })
  assert.equal(next.draft, "new")
  assert.equal(next.gameId, "game-1")
})

test("jokerChatReducer: DRAFT가 다른 gameId면 state가 참조까지 완전히 불변이다", () => {
  const state = { ...baseState, draft: "old" }
  const next = jokerChatReducer(state, { type: "DRAFT", gameId: "game-2", draft: "new" })
  assert.equal(next, state)
})

test("jokerChatReducer: SEND가 현재 gameId와 같으면 status가 sending, error가 null이 된다", () => {
  const state = { ...baseState, error: "이전 오류" }
  const next = jokerChatReducer(state, { type: "SEND", gameId: "game-1" })
  assert.equal(next.status, "sending")
  assert.equal(next.error, null)
})

test("jokerChatReducer: SEND가 다른 gameId면 state가 참조까지 완전히 불변이다", () => {
  const state = { ...baseState }
  const next = jokerChatReducer(state, { type: "SEND", gameId: "game-2" })
  assert.equal(next, state)
})

test("jokerChatReducer: ACK(ok:true)가 같은 gameId이고 draft가 requestDraft와 같으면 draft가 비워진다", () => {
  const state = { ...baseState, draft: "hello", status: "sending" }
  const next = jokerChatReducer(state, { type: "ACK", gameId: "game-1", ok: true, requestDraft: "hello" })
  assert.equal(next.draft, "")
  assert.equal(next.status, "idle")
  assert.equal(next.error, null)
})

test("jokerChatReducer: ACK(ok:true)가 같은 gameId이고 draft가 requestDraft와 다르면 draft가 보존된다", () => {
  const state = { ...baseState, draft: "new user input", status: "sending" }
  const next = jokerChatReducer(state, { type: "ACK", gameId: "game-1", ok: true, requestDraft: "hello" })
  assert.equal(next.draft, "new user input")
})

test("jokerChatReducer: ACK(ok:false)가 같은 gameId면 status idle, error가 action.message다", () => {
  const state = { ...baseState, status: "sending" }
  const next = jokerChatReducer(state, { type: "ACK", gameId: "game-1", ok: false, message: "실패했습니다.", requestDraft: "" })
  assert.equal(next.status, "idle")
  assert.equal(next.error, "실패했습니다.")
})

test("jokerChatReducer: ACK가 다른 gameId면 ok 여부와 무관하게 state가 참조까지 완전히 불변이다", () => {
  const state = { ...baseState, status: "sending" }
  const nextOk = jokerChatReducer(state, { type: "ACK", gameId: "game-2", ok: true, requestDraft: "" })
  const nextFail = jokerChatReducer(state, { type: "ACK", gameId: "game-2", ok: false, message: "x", requestDraft: "" })
  assert.equal(nextOk, state)
  assert.equal(nextFail, state)
})

test("jokerChatReducer: INVALIDATE가 같은 gameId면 status/error/messages가 초기화되고 draft는 보존된다", () => {
  const state = { gameId: "game-1", messages: [{ id: "m1" }], draft: "입력 중", status: "sending", error: "이전 오류" }
  const next = jokerChatReducer(state, { type: "INVALIDATE", gameId: "game-1" })
  assert.deepEqual(next.messages, [])
  assert.equal(next.status, "idle")
  assert.equal(next.error, null)
  assert.equal(next.draft, "입력 중")
})

test("jokerChatReducer: INVALIDATE가 다른 gameId면 state가 참조까지 완전히 불변이다", () => {
  const state = { ...baseState }
  const next = jokerChatReducer(state, { type: "INVALIDATE", gameId: "game-2" })
  assert.equal(next, state)
})

test("jokerChatReducer: 알 수 없는 action type이면 state를 그대로 반환한다", () => {
  const state = { ...baseState }
  const next = jokerChatReducer(state, { type: "UNKNOWN_ACTION" })
  assert.equal(next, state)
})
