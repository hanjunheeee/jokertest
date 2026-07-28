import test from "node:test"
import assert from "node:assert/strict"
import { parseJokerChatBroadcastPayload } from "../parseJokerChatBroadcastPayload.js"

function validPayload(overrides = {}) {
  return {
    gameId: "game-1",
    senderUuid: "uuid-1",
    messageId: "msg-1",
    sentAt: 1000,
    text: "hello",
    ...overrides,
  }
}

test("parseJokerChatBroadcastPayload: 정상 payload는 정확히 5개 키만 반환하고 추가 키는 사라진다", () => {
  const result = parseJokerChatBroadcastPayload(validPayload({ role: "JOKER" }))
  assert.deepEqual(result, {
    gameId: "game-1",
    senderUuid: "uuid-1",
    text: "hello",
    id: "msg-1",
    sentAt: 1000,
  })
})

test("parseJokerChatBroadcastPayload: null은 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(null), null)
})

test("parseJokerChatBroadcastPayload: undefined는 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(undefined), null)
})

test("parseJokerChatBroadcastPayload: 배열은 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload([]), null)
})

test("parseJokerChatBroadcastPayload: 문자열 primitive는 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload("x"), null)
})

test("parseJokerChatBroadcastPayload: 숫자 primitive는 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(42), null)
})

test("parseJokerChatBroadcastPayload: gameId가 공백만이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ gameId: "   " })), null)
})

test("parseJokerChatBroadcastPayload: gameId가 비문자열이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ gameId: 42 })), null)
})

test("parseJokerChatBroadcastPayload: senderUuid가 공백만이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ senderUuid: "   " })), null)
})

test("parseJokerChatBroadcastPayload: senderUuid가 비문자열이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ senderUuid: 42 })), null)
})

test("parseJokerChatBroadcastPayload: messageId가 공백만이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ messageId: "   " })), null)
})

test("parseJokerChatBroadcastPayload: messageId가 비문자열이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ messageId: 42 })), null)
})

test("parseJokerChatBroadcastPayload: sentAt이 음수면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ sentAt: -1 })), null)
})

test("parseJokerChatBroadcastPayload: sentAt이 실수면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ sentAt: 1.5 })), null)
})

test("parseJokerChatBroadcastPayload: sentAt이 NaN이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ sentAt: NaN })), null)
})

test("parseJokerChatBroadcastPayload: sentAt이 Infinity면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ sentAt: Infinity })), null)
})

test("parseJokerChatBroadcastPayload: sentAt이 비숫자(문자열)면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ sentAt: "123" })), null)
})

test("parseJokerChatBroadcastPayload: text가 비문자열이면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: 42 })), null)
})

test("parseJokerChatBroadcastPayload: text가 빈 문자열이면 null이다(EMPTY_MESSAGE)", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "" })), null)
})

test("parseJokerChatBroadcastPayload: text가 151자면 null이다(MESSAGE_TOO_LONG)", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "a".repeat(151) })), null)
})

test("parseJokerChatBroadcastPayload: text에 C0 제어문자(NUL)가 포함되면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "a\u0000b" })), null)
})

test("parseJokerChatBroadcastPayload: text에 C1 제어문자(NEL)가 포함되면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "a\u0085b" })), null)
})

test("parseJokerChatBroadcastPayload: text에 DEL이 포함되면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "a\u007fb" })), null)
})

test("parseJokerChatBroadcastPayload: text에 bidi override가 포함되면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "a‮b" })), null)
})

test("parseJokerChatBroadcastPayload: gameId/senderUuid/messageId 앞뒤 공백이 있는 유효 값은 trim되어 반환된다", () => {
  const result = parseJokerChatBroadcastPayload(
    validPayload({ gameId: "  game-1  ", senderUuid: "  uuid-1  ", messageId: "  msg-1  " }),
  )
  assert.deepEqual(result, {
    gameId: "game-1",
    senderUuid: "uuid-1",
    text: "hello",
    id: "msg-1",
    sentAt: 1000,
  })
})

test("parseJokerChatBroadcastPayload: text 앞뒤 공백이 남아 sanitize 결과와 원본이 다르면 null이다(non-canonical 거부)", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "  hello  " })), null)
})

test("parseJokerChatBroadcastPayload: text에 CRLF가 남아 sanitize 결과와 원본이 다르면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "line1\r\nline2" })), null)
})

test("parseJokerChatBroadcastPayload: text에 단독 CR이 남아 sanitize 결과와 원본이 다르면 null이다", () => {
  assert.equal(parseJokerChatBroadcastPayload(validPayload({ text: "line1\rline2" })), null)
})

test("parseJokerChatBroadcastPayload: text가 앞뒤 공백/CRLF 없이 canonical한 내부 LF만 있으면 정상 파싱된다", () => {
  const result = parseJokerChatBroadcastPayload(validPayload({ text: "line1\nline2" }))
  assert.deepEqual(result, {
    gameId: "game-1",
    senderUuid: "uuid-1",
    text: "line1\nline2",
    id: "msg-1",
    sentAt: 1000,
  })
})
