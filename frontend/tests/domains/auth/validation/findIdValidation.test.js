import test from "node:test"
import assert from "node:assert/strict"
import {
  FIND_ID_NICKNAME_WHITESPACE_MESSAGE,
  hasFindIdNicknameWhitespace,
  validateFindId as validateFindIdLocalInput,
  validateFindIdNickname,
} from "../../../../src/domains/auth/validation/recovery.js"

test("validateFindIdNickname: 앞뒤 공백은 trim 후 조회 가능", () => {
  assert.equal(validateFindIdNickname("  홍길동  ").ok, true)
  assert.equal(hasFindIdNicknameWhitespace("  홍길동  "), false)
})

test("validateFindIdNickname: 가운데 띄어쓰기는 전용 메시지로 거부", () => {
  const result = validateFindIdNickname("홍 길동")
  assert.equal(result.ok, false)
  assert.equal(result.message, FIND_ID_NICKNAME_WHITESPACE_MESSAGE)
  assert.equal(hasFindIdNicknameWhitespace("홍 길동"), true)
})

test("validateFindIdLocalInput: 띄어쓰기 포함 닉네임은 API 전 로컬에서 막는다", () => {
  const result = validateFindIdLocalInput("닉 네임", "2000-01-15")
  assert.equal(result.ok, false)
  assert.equal(result.message, FIND_ID_NICKNAME_WHITESPACE_MESSAGE)
})
