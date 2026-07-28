import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeJokerChatText } from "../sanitizeJokerChatText.js"

test("sanitizeJokerChatText: 일반 텍스트는 그대로 통과한다", () => {
  assert.deepEqual(sanitizeJokerChatText("hello world"), { ok: true, text: "hello world" })
})

test("sanitizeJokerChatText: 앞뒤 공백은 trim된다", () => {
  assert.deepEqual(sanitizeJokerChatText("  hello  "), { ok: true, text: "hello" })
})

test("sanitizeJokerChatText: 한글 텍스트는 통과한다", () => {
  assert.deepEqual(sanitizeJokerChatText("안녕하세요"), { ok: true, text: "안녕하세요" })
})

test("sanitizeJokerChatText: 이모지(서로게이트 쌍)는 통과한다", () => {
  assert.deepEqual(sanitizeJokerChatText("😀"), { ok: true, text: "😀" })
})

test("sanitizeJokerChatText: 내부 개행(LF)은 통과한다", () => {
  assert.deepEqual(sanitizeJokerChatText("line1\nline2"), { ok: true, text: "line1\nline2" })
})

test("sanitizeJokerChatText: CRLF는 LF로 정규화된 뒤 통과한다", () => {
  assert.deepEqual(sanitizeJokerChatText("line1\r\nline2"), { ok: true, text: "line1\nline2" })
})

test("sanitizeJokerChatText: 단독 CR은 LF로 정규화된 뒤 통과한다", () => {
  assert.deepEqual(sanitizeJokerChatText("line1\rline2"), { ok: true, text: "line1\nline2" })
})

test("sanitizeJokerChatText: 빈 문자열은 EMPTY_MESSAGE다", () => {
  assert.deepEqual(sanitizeJokerChatText(""), { ok: false, code: "EMPTY_MESSAGE" })
})

test("sanitizeJokerChatText: 공백/개행만 있으면 EMPTY_MESSAGE다", () => {
  assert.deepEqual(sanitizeJokerChatText("   \n\n  "), { ok: false, code: "EMPTY_MESSAGE" })
})

test("sanitizeJokerChatText: TAB이 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("a\tb"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: NUL이 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("a\u0000b"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: DEL이 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("ab"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: C1 NEL(\\u0085)이 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("ab"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: Arabic Letter Mark(\\u061c)가 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("a؜b"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: LRM(\\u200e)이 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("a‎b"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: RLM(\\u200f)이 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("a‏b"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: bidi embedding/override(\\u202e)가 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("a‮b"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: bidi isolate(\\u2066)가 포함되면 INVALID_CHARACTERS다", () => {
  assert.deepEqual(sanitizeJokerChatText("a⁦b"), { ok: false, code: "INVALID_CHARACTERS" })
})

test("sanitizeJokerChatText: 정확히 150 code unit은 통과한다", () => {
  const text = "a".repeat(150)
  assert.deepEqual(sanitizeJokerChatText(text), { ok: true, text })
})

test("sanitizeJokerChatText: 151 code unit은 MESSAGE_TOO_LONG이다", () => {
  const text = "a".repeat(151)
  assert.deepEqual(sanitizeJokerChatText(text), { ok: false, code: "MESSAGE_TOO_LONG" })
})
