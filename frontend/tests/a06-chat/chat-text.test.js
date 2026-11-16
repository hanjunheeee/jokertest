// 판 중 채팅 글 검사 문구 시험 — 보내기 전 빈 글·150자·나쁜 글자 검사와 화면 문구
// 목록 A06-판중-채팅.md 화면 PC 번호 A06-F-038~046
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { sanitizeJokerChatText, mapJokerChatSanitizeCodeToMessage } = await import("../../src/domains/game/ingame/utils/chatText.js")

// 글 하나 검사 → 통과면 "통과", 아니면 화면에 뜰 문구
function verdict(text) {
  const result = sanitizeJokerChatText(text)
  return result.ok ? "통과" : mapJokerChatSanitizeCodeToMessage(result.code)
}

const EMPTY = "메시지를 입력해주세요."
const TOO_LONG = "메시지는 150자 이하로 입력해주세요."
const BAD_CHAR = "사용할 수 없는 문자가 포함되어 있습니다."

const CASES = [
  ["A06-F-038", "빈 글", "", EMPTY],
  ["A06-F-039", "공백만", "   \n  ", EMPTY],
  ["A06-F-040", "1자", "가", "통과"],
  ["A06-F-041", "150자", "a".repeat(150), "통과"],
  ["A06-F-042", "151자", "a".repeat(151), TOO_LONG],
  ["A06-F-043", "한글 151자", "한".repeat(151), TOO_LONG],
]
for (const [id, label, text, expected] of CASES) {
  test(`${id} 보내기 전 글 검사: ${label} → ${expected}`, () => {
    assert.equal(verdict(text), expected)
  })
}

const BAD = [
  ["A06-F-044", "글 방향 바꿈(U+202E)", "안녕‮하세요"],
  ["A06-F-045", "벨 소리 제어 문자(U+0007)", "안녕\u0007하세요"],
]
for (const [id, label, text] of BAD) {
  test(`${id} 나쁜 글자 문구: ${label} 든 글 → "${BAD_CHAR}"`, () => {
    assert.equal(verdict(text), BAD_CHAR)
  })
}

test("A06-F-046 모르는 거절 코드 → \"메시지를 보낼 수 없습니다.\"", () => {
  assert.equal(mapJokerChatSanitizeCodeToMessage("SOMETHING_NEW"), "메시지를 보낼 수 없습니다.")
})
