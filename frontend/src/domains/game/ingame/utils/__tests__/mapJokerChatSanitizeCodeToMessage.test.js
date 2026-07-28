import test from "node:test"
import assert from "node:assert/strict"
import { mapJokerChatSanitizeCodeToMessage } from "../mapJokerChatSanitizeCodeToMessage.js"

test("mapJokerChatSanitizeCodeToMessage: EMPTY_MESSAGE는 지정된 안내 문구를 반환한다", () => {
  assert.equal(mapJokerChatSanitizeCodeToMessage("EMPTY_MESSAGE"), "메시지를 입력해주세요.")
})

test("mapJokerChatSanitizeCodeToMessage: MESSAGE_TOO_LONG은 지정된 안내 문구를 반환한다", () => {
  assert.equal(mapJokerChatSanitizeCodeToMessage("MESSAGE_TOO_LONG"), "메시지는 150자 이하로 입력해주세요.")
})

test("mapJokerChatSanitizeCodeToMessage: INVALID_CHARACTERS는 지정된 안내 문구를 반환한다", () => {
  assert.equal(mapJokerChatSanitizeCodeToMessage("INVALID_CHARACTERS"), "사용할 수 없는 문자가 포함되어 있습니다.")
})

test("mapJokerChatSanitizeCodeToMessage: 알 수 없는 code는 fallback 문구를 반환한다", () => {
  assert.equal(mapJokerChatSanitizeCodeToMessage(undefined), "메시지를 보낼 수 없습니다.")
  assert.equal(mapJokerChatSanitizeCodeToMessage("UNKNOWN"), "메시지를 보낼 수 없습니다.")
})
