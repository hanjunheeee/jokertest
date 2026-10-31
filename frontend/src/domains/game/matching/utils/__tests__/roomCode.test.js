import test from "node:test"
import assert from "node:assert/strict"

import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  isValidRoomCode,
  normalizeRoomCode,
  normalizeRoomCodeChar,
  normalizeRoomCodeText,
  resolveRoomCodeCopy,
} from "../roomCode.js"

const SERVER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

test("ROOM_CODE_LENGTH와 ROOM_CODE_PATTERN이 서로 어긋나지 않는다", () => {
  assert.equal(ROOM_CODE_LENGTH, 6)
  assert.ok(ROOM_CODE_PATTERN.test("A".repeat(ROOM_CODE_LENGTH)))
  assert.ok(!ROOM_CODE_PATTERN.test("A".repeat(ROOM_CODE_LENGTH - 1)))
  assert.ok(!ROOM_CODE_PATTERN.test("A".repeat(ROOM_CODE_LENGTH + 1)))
})

test("ROOM_CODE_PATTERN은 g 플래그가 없어 같은 값을 몇 번 검사해도 결과가 같다", () => {
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
  for (const code of ["AB2C3D", "abc123", "aB3xY9", "000000", "zzzzzz"]) {
    assert.equal(normalizeRoomCode(code), code)
  }
})

test("isValidRoomCode는 서버가 만들 수 있는 모든 문자를 통과시킨다", () => {
  for (let i = 0; i < SERVER_CHARS.length; i += 1) {
    const code = Array.from(
      { length: ROOM_CODE_LENGTH },
      (_, offset) => SERVER_CHARS[(i + offset) % SERVER_CHARS.length],
    ).join("")

    assert.equal(isValidRoomCode(code), true, `서버 문자 집합의 코드가 거부됨: ${code}`)
  }
})

test("isValidRoomCode는 숫자만 있는 코드도 그대로 통과시킨다", () => {
  assert.equal(isValidRoomCode("123456"), true)
})

test("isValidRoomCode는 빈 값·길이 미달·비영숫자를 거부한다", () => {
  const rejected = [
    "",
    null,
    undefined,
    "ABC12",
    "ABC1234",
    "AB-123",
    "AB 123",
    " AB123",
    "AB123 ",
    "AB12\n3",
    "방코드12",
    "AB12３D",
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

test("normalizeRoomCodeChar는 영문자를 숫자와 똑같이 통과시킨다", () => {
  for (const char of "ABCDEFGHJKLMNPQRSTUVWXYZ") {
    assert.equal(normalizeRoomCodeChar(char), char, `영문자가 걸러짐: ${char}`)
  }
})

test("normalizeRoomCodeChar는 숫자 한 글자 입력을 그대로 통과시킨다(회귀)", () => {
  for (const char of "0123456789") {
    assert.equal(normalizeRoomCodeChar(char), char)
  }
})

test("normalizeRoomCodeChar는 대소문자를 바꾸지 않는다", () => {
  assert.equal(normalizeRoomCodeChar("a"), "a")
  assert.equal(normalizeRoomCodeChar("A"), "A")
})

test("normalizeRoomCodeChar는 여러 글자가 들어오면 마지막 글자만 남긴다", () => {
  assert.equal(normalizeRoomCodeChar("AB"), "B")
  assert.equal(normalizeRoomCodeChar("2X"), "X")
  assert.equal(normalizeRoomCodeChar("A-"), "A")
  assert.equal(normalizeRoomCodeChar("-B"), "B")
})

test("normalizeRoomCodeChar는 쓸 수 없는 값에 대해 빈 문자열을 준다", () => {
  for (const input of ["", " ", "-", "가", "３", null, undefined, 5, {}]) {
    assert.equal(normalizeRoomCodeChar(input), "", `걸러지지 않음: ${String(input)}`)
  }
})

test("normalizeRoomCodeText는 영문자가 섞인 방코드를 그대로 보존한다", () => {
  assert.equal(normalizeRoomCodeText("AB2C3D"), "AB2C3D")
  assert.equal(normalizeRoomCodeText("ZZZZZZ"), "ZZZZZZ")
  assert.equal(normalizeRoomCodeText("aB2c3D"), "aB2c3D")
})

test("normalizeRoomCodeText는 숫자 전용 코드를 그대로 통과시킨다(회귀)", () => {
  assert.equal(normalizeRoomCodeText("123456"), "123456")
})

test("normalizeRoomCodeText는 구분자·공백을 걷어내고 붙여넣기를 살려낸다", () => {
  assert.equal(normalizeRoomCodeText("AB2-C3D"), "AB2C3D")
  assert.equal(normalizeRoomCodeText(" AB2C3D "), "AB2C3D")
  assert.equal(normalizeRoomCodeText("AB2 C3D"), "AB2C3D")
  assert.equal(normalizeRoomCodeText("AB2\nC3D"), "AB2C3D")
})

test("normalizeRoomCodeText는 방코드 길이를 넘는 입력을 잘라낸다", () => {
  assert.equal(normalizeRoomCodeText("AB2C3DEXTRA"), "AB2C3D")
  assert.equal(normalizeRoomCodeText("A".repeat(50)).length, ROOM_CODE_LENGTH)
})

test("normalizeRoomCodeText는 문자열이 아닌 값에도 터지지 않는다", () => {
  for (const input of [null, undefined, 123456, {}, []]) {
    assert.equal(normalizeRoomCodeText(input), "", `걸러지지 않음: ${String(input)}`)
  }
})

test("normalizeRoomCodeText가 통과시킨 6자 값은 isValidRoomCode도 통과한다", () => {
  for (const raw of ["AB2C3D", "abc123", "123456", "AB2-C3D", "aB2c3D"]) {
    const normalized = normalizeRoomCodeText(raw)
    if (normalized.length !== ROOM_CODE_LENGTH) continue

    assert.equal(isValidRoomCode(normalized), true, `입력은 되는데 유효하지 않음: ${normalized}`)
  }
})

test("복사 실패 안내 문구는 비어 있지 않다", () => {
  for (const [key, message] of Object.entries(ROOM_CODE_COPY_ERRORS)) {
    assert.equal(typeof message, "string", `${key} 문구가 문자열이 아님`)
    assert.ok(message.trim().length > 0, `${key} 문구가 비어 있음`)
  }
})
