import test from "node:test"
import assert from "node:assert/strict"
import { attachJokerChatListener } from "../attachJokerChatListener.js"

/** 프런트 전용 최소 fake socket — on/off/trigger만 지원한다(백엔드 test helper는 별도 런타임이라 재사용하지 않음). */
function createFakeSocket() {
  const listeners = new Map()
  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
    },
    off(event, handler) {
      listeners.get(event)?.delete(handler)
    },
    trigger(event, ...args) {
      for (const handler of listeners.get(event) ?? []) handler(...args)
    },
    listenerCount(event) {
      return listeners.get(event)?.size ?? 0
    },
  }
}

function validPayload(overrides = {}) {
  return {
    gameId: "game-1",
    senderUuid: "uuid-1",
    text: "hello",
    messageId: "msg-1",
    sentAt: 1000,
    ...overrides,
  }
}

test("attachJokerChatListener: 최초 attach 시 joker_chat_message 리스너 수가 1이다", () => {
  const socket = createFakeSocket()
  attachJokerChatListener(socket, () => {}, () => "game-1")
  assert.equal(socket.listenerCount("joker_chat_message"), 1)
})

test("attachJokerChatListener: cleanup 함수 호출 후 리스너 수가 0이다", () => {
  const socket = createFakeSocket()
  const unsubscribe = attachJokerChatListener(socket, () => {}, () => "game-1")
  unsubscribe()
  assert.equal(socket.listenerCount("joker_chat_message"), 0)
})

test("attachJokerChatListener: mount->cleanup을 3회 반복해도 매번 mount 시 1, cleanup 후 0이다(누적 없음)", () => {
  const socket = createFakeSocket()
  for (let i = 0; i < 3; i += 1) {
    const unsubscribe = attachJokerChatListener(socket, () => {}, () => "game-1")
    assert.equal(socket.listenerCount("joker_chat_message"), 1)
    unsubscribe()
    assert.equal(socket.listenerCount("joker_chat_message"), 0)
  }
})

test("attachJokerChatListener: 유효한 payload를 trigger하면 handler가 정확히 1회, 파싱된 메시지와 함께 호출된다", () => {
  const socket = createFakeSocket()
  const received = []
  attachJokerChatListener(socket, (parsed) => received.push(parsed), () => "game-1")
  socket.trigger("joker_chat_message", validPayload())
  assert.equal(received.length, 1)
  assert.deepEqual(received[0], { gameId: "game-1", senderUuid: "uuid-1", text: "hello", id: "msg-1", sentAt: 1000 })
})

test("attachJokerChatListener: getCurrentGameId가 다른 gameId를 반환하면 handler가 전혀 호출되지 않는다", () => {
  const socket = createFakeSocket()
  const received = []
  attachJokerChatListener(socket, (parsed) => received.push(parsed), () => "B")
  socket.trigger("joker_chat_message", validPayload({ gameId: "A" }))
  assert.equal(received.length, 0)
})

test("attachJokerChatListener: parseJokerChatBroadcastPayload가 null을 반환하는 payload는 handler를 호출하지 않는다", () => {
  const socket = createFakeSocket()
  const received = []
  attachJokerChatListener(socket, (parsed) => received.push(parsed), () => "game-1")
  socket.trigger("joker_chat_message", validPayload({ sentAt: -1 }))
  socket.trigger("joker_chat_message", [])
  assert.equal(received.length, 0)
})
