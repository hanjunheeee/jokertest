import test from "node:test"
import assert from "node:assert/strict"

import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  isValidRoomCode,
  normalizeRoomCode,
  resolveRoomCodeCopy,
} from "../roomCode.js"

// 서버(backend/utils/roomCode.js)가 실제로 뽑아 쓰는 문자 집합입니다.
// 이 집합에서 나온 코드는 전부 "복사 가능"으로 판정돼야 합니다.
const SERVER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

test("ROOM_CODE_LENGTH와 ROOM_CODE_PATTERN이 서로 어긋나지 않는다", () => {
  assert.equal(ROOM_CODE_LENGTH, 6)
  assert.ok(ROOM_CODE_PATTERN.test("A".repeat(ROOM_CODE_LENGTH)))
  assert.ok(!ROOM_CODE_PATTERN.test("A".repeat(ROOM_CODE_LENGTH - 1)))
  assert.ok(!ROOM_CODE_PATTERN.test("A".repeat(ROOM_CODE_LENGTH + 1)))
})

test("ROOM_CODE_PATTERN은 g 플래그가 없어 같은 값을 몇 번 검사해도 결과가 같다", () => {
  // g 플래그가 붙으면 lastIndex가 남아 두 번째 test가 false를 돌려주는 고전적인 버그가 생긴다.
  assert.equal(ROOM_CODE_PATTERN.global, false)
  assert.equal(ROOM_CODE_PATTERN.test("AB2C3D"), true)
  assert.equal(ROOM_CODE_PATTERN.test("AB2C3D"), true)
  assert.equal(ROOM_CODE_PATTERN.test("AB2C3D"), true)
})

test("normalizeRoomCode는 문자열이 아닌 값을 빈 문자열로 바꾼다", () => {
  assert.equal(normalizeRoomCode("AB2C3D"), "AB2C3D")
  assert.equal(normalizeRoomCode(""), "")
  assert.equal(normalizeRoomCode(null), "")
  assert.equal(normalizeRoomCode(undefined), "")
  assert.equal(normalizeRoomCode(123456), "")
  assert.equal(normalizeRoomCode({ roomCode: "AB2C3D" }), "")
})

test("normalizeRoomCode는 정상 코드를 조금도 가공하지 않는다", () => {
  // 표시값과 복사값이 갈라지지 않으려면 자르기·대문자화 같은 가공이 없어야 한다.
  for (const code of ["AB2C3D", "abc123", "aB3xY9", "000000", "zzzzzz"]) {
    assert.equal(normalizeRoomCode(code), code)
  }
})

test("isValidRoomCode는 서버가 만들 수 있는 모든 문자를 통과시킨다", () => {
  // 문자 집합 전체를 6자씩 훑어 알파벳이 섞인 코드가 걸러지지 않는지 확인한다.
  for (let i = 0; i < SERVER_CHARS.length; i += 1) {
    const code = Array.from(
      { length: ROOM_CODE_LENGTH },
      (_, offset) => SERVER_CHARS[(i + offset) % SERVER_CHARS.length],
    ).join("")

    assert.equal(isValidRoomCode(code), true, `서버 문자 집합의 코드가 거부됨: ${code}`)
  }
})

test("isValidRoomCode는 숫자만 있는 코드도 그대로 통과시킨다", () => {
  // 숫자 전용 코드를 막아버리면 기존 동작이 회귀한다.
  assert.equal(isValidRoomCode("123456"), true)
})

test("isValidRoomCode는 빈 값·길이 미달·비영숫자를 거부한다", () => {
  const rejected = [
    "", // 아직 코드를 못 받음
    null,
    undefined,
    "ABC12", // 5자
    "ABC1234", // 7자
    "AB-123", // 하이픈
    "AB 123", // 공백
    " AB123", // 앞 공백
    "AB123 ", // 뒤 공백
    "AB12\n3", // 개행
    "방코드12", // 한글
    "AB12３D", // 전각 숫자
  ]

  for (const code of rejected) {
    assert.equal(isValidRoomCode(code), false, `거부됐어야 하는 코드가 통과함: ${String(code)}`)
  }
})

test("resolveRoomCodeCopy는 유효한 코드를 변형 없이 그대로 돌려준다", () => {
  const outcome = resolveRoomCodeCopy("AB2C3D")

  assert.deepEqual(outcome, { ok: true, value: "AB2C3D", error: "" })
})

test("resolveRoomCodeCopy는 빈 코드에 대해 ok를 주지 않고 안내 문구를 붙인다", () => {
  for (const code of ["", null, undefined]) {
    const outcome = resolveRoomCodeCopy(code)

    assert.equal(outcome.ok, false, `빈 코드가 복사 가능으로 판정됨: ${String(code)}`)
    assert.equal(outcome.value, "")
    assert.equal(outcome.error, ROOM_CODE_COPY_ERRORS.UNAVAILABLE)
  }
})

test("resolveRoomCodeCopy는 형식이 깨진 코드도 ok를 주지 않는다", () => {
  for (const code of ["ABC12", "AB-123", "AB 123", "방코드12"]) {
    const outcome = resolveRoomCodeCopy(code)

    assert.equal(outcome.ok, false, `잘못된 코드가 복사 가능으로 판정됨: ${code}`)
    assert.equal(outcome.error, ROOM_CODE_COPY_ERRORS.UNAVAILABLE)
  }
})

test("복사 실패 안내 문구는 비어 있지 않다", () => {
  // 문구가 비면 role="alert" 영역이 아무것도 읽어주지 않아 오류 노출이 사라진다.
  for (const [key, message] of Object.entries(ROOM_CODE_COPY_ERRORS)) {
    assert.equal(typeof message, "string", `${key} 문구가 문자열이 아님`)
    assert.ok(message.trim().length > 0, `${key} 문구가 비어 있음`)
  }
})
