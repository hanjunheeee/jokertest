// 새로고침 대비 기억 (인게임C 4): 그 판 채팅 기록 되살리기·역할 공개 창 다시 안 띄우기
import test from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" })
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true, writable: true })

const {
  hasSeenRoleReveal,
  loadChatHistory,
  markRoleRevealSeen,
  saveChatHistory,
} = await import("../../../../../src/domains/game/ingame/utils/ingameSessionMemory.js")
const { gameChatReducer, initialGameChatState } = await import("../../../../../src/domains/game/ingame/utils/gameChatReducer.js")
const { jokerChatReducer } = await import("../../../../../src/domains/game/ingame/utils/jokerChatReducer.js")

const msg = (id, text = id) => ({ id, senderUuid: "u2", text, sentAt: 1 })

test.beforeEach(() => dom.window.sessionStorage.clear())

test("채팅 기록: 같은 판·같은 계정만 되살리고, 새 판이 쓰면 옛 판 것은 사라짐", () => {
  saveChatHistory("game", "g1", "me", { DAY: [msg("a"), { bad: true }], DEAD: [] })
  assert.deepEqual(loadChatHistory("game", "g1", "me"), { DAY: [msg("a")], DEAD: [] })
  assert.equal(loadChatHistory("game", "g1", "other"), null)
  assert.equal(loadChatHistory("game", "g2", "me"), null)

  saveChatHistory("game", "g2", "me", { DAY: [msg("b")] })
  assert.equal(loadChatHistory("game", "g1", "me"), null)
  assert.deepEqual(loadChatHistory("game", "g2", "me"), { DAY: [msg("b")] })
})

test("채팅 기록: 채널마다 최근 200개만 남김", () => {
  const many = Array.from({ length: 250 }, (_, i) => msg(`m${i}`))
  saveChatHistory("game", "g1", "me", { DAY: many })
  const loaded = loadChatHistory("game", "g1", "me").DAY
  assert.equal(loaded.length, 200)
  assert.equal(loaded[0].id, "m50")
})

test("낮 채팅 상태: 판에 들어올 때 기록을 채우고, 같은 id 말은 또 안 붙임", () => {
  const restored = { DAY: [msg("a")], DEAD: [msg("d")] }
  let state = gameChatReducer(initialGameChatState(), { type: "CONTEXT_CHANGED", gameId: "g1", authUuid: "me", restored })
  assert.deepEqual(state.DAY.messages, [msg("a")])
  assert.deepEqual(state.DEAD.messages, [msg("d")])
  state = gameChatReducer(state, { type: "RECEIVE", gameId: "g1", authUuid: "me", channel: "DAY", message: msg("a") })
  assert.equal(state.DAY.messages.length, 1)
  state = gameChatReducer(state, { type: "RECEIVE", gameId: "g1", authUuid: "me", channel: "DAY", message: msg("b") })
  assert.deepEqual(state.DAY.messages.map((m) => m.id), ["a", "b"])
})

test("같은 직업 채팅 상태: 판에 들어올 때 기록을 채움, 계정이 늦게 잡혀도 빈 채팅이면 채움", () => {
  const empty = { gameId: null, messages: [], draft: "", status: "idle", error: null }
  const state = jokerChatReducer(empty, { type: "GAME_CHANGED", gameId: "g1", restored: [msg("r")] })
  assert.deepEqual(state.messages, [msg("r")])

  const late = jokerChatReducer({ ...empty, gameId: "g1" }, { type: "GAME_CHANGED", gameId: "g1", restored: [msg("r")] })
  assert.deepEqual(late.messages, [msg("r")])
})

test("역할 공개 창: 이 판에서 봤다고 적으면 새로고침 뒤 다시 안 띄움, 다른 판은 띄움", () => {
  assert.equal(hasSeenRoleReveal("g1", "me"), false)
  markRoleRevealSeen("g1", "me")
  assert.equal(hasSeenRoleReveal("g1", "me"), true)
  assert.equal(hasSeenRoleReveal("g2", "me"), false)
  assert.equal(hasSeenRoleReveal("g1", "other"), false)
})
