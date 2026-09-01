import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeRoomCode, sanitizeRoomCodeChar } from "../sanitizeRoomCode.js"

test("영문+숫자 방코드 전체가 붙여넣기된다", () => {
  assert.equal(sanitizeRoomCode("UGEP8V"), "UGEP8V")
})

test("소문자는 대문자로 정규화된다", () => {
  assert.equal(sanitizeRoomCode("ugep8v"), "UGEP8V")
})

test("허용되지 않는 I, O, 0, 1은 제거된다", () => {
  assert.equal(sanitizeRoomCode("IO01AB"), "AB")
})

test("6자를 초과하면 잘린다", () => {
  assert.equal(sanitizeRoomCode("ABCDEFGH"), "ABCDEF")
})

test("한 칸 입력은 허용 문자 중 마지막 글자만 남긴다", () => {
  assert.equal(sanitizeRoomCodeChar("x8"), "8")
  assert.equal(sanitizeRoomCodeChar("U"), "U")
})
