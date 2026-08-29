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

// ── 입력 정규화 (useRoomCodeInput이 쓰는 함수들) ───────────────────────────────

test("normalizeRoomCodeChar는 영문자를 숫자와 똑같이 통과시킨다", () => {
  // 이 슬라이스가 고친 버그의 핵심이다. 예전 sanitizeChar는 /\D/를 지워
  // 영문자를 전부 빈 문자열로 만들었고, 그래서 방코드를 아예 칠 수 없었다.
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
  // 서버는 room.code === 입력값으로 정확히 비교하므로, 화면이 케이스를 바꾸면
  // 사용자가 친 값과 서버로 나가는 값이 달라진다.
  assert.equal(normalizeRoomCodeChar("a"), "a")
  assert.equal(normalizeRoomCodeChar("A"), "A")
})

test("normalizeRoomCodeChar는 여러 글자가 들어오면 마지막 글자만 남긴다", () => {
  // 이미 글자가 있는 칸에 타이핑하면 브라우저가 "기존 글자 + 새 글자"를 함께 준다.
  assert.equal(normalizeRoomCodeChar("AB"), "B")
  assert.equal(normalizeRoomCodeChar("2X"), "X")
  assert.equal(normalizeRoomCodeChar("A-"), "A") // 쓸 수 없는 문자를 걷어낸 뒤의 마지막 글자
  assert.equal(normalizeRoomCodeChar("-B"), "B")
})

test("normalizeRoomCodeChar는 쓸 수 없는 값에 대해 빈 문자열을 준다", () => {
  for (const input of ["", " ", "-", "가", "３", null, undefined, 5, {}]) {
    assert.equal(normalizeRoomCodeChar(input), "", `걸러지지 않음: ${String(input)}`)
  }
})

test("normalizeRoomCodeText는 영문자가 섞인 방코드를 그대로 보존한다", () => {
  // 붙여넣기 경로의 회귀 방지. 예전 sanitizeCode는 여기서 영문자를 전부 날렸다.
  assert.equal(normalizeRoomCodeText("AB2C3D"), "AB2C3D")
  assert.equal(normalizeRoomCodeText("ZZZZZZ"), "ZZZZZZ")
  assert.equal(normalizeRoomCodeText("aB2c3D"), "aB2c3D") // 케이스 보존
})

test("normalizeRoomCodeText는 숫자 전용 코드를 그대로 통과시킨다(회귀)", () => {
  assert.equal(normalizeRoomCodeText("123456"), "123456")
})

test("normalizeRoomCodeText는 구분자·공백을 걷어내고 붙여넣기를 살려낸다", () => {
  // "AB2-C3D"처럼 사람이 읽기 좋게 꾸민 코드를 복사해 와도 입력되게 한다.
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
  // 입력 필터와 복사 검증이 서로 다른 규칙을 갖게 되면 "칠 수는 있는데 복사는 안 되는"
  // 코드가 생긴다. 두 함수가 같은 문자 집합을 쓰는지 확인한다.
  for (const raw of ["AB2C3D", "abc123", "123456", "AB2-C3D", "aB2c3D"]) {
    const normalized = normalizeRoomCodeText(raw)
    if (normalized.length !== ROOM_CODE_LENGTH) continue

    assert.equal(isValidRoomCode(normalized), true, `입력은 되는데 유효하지 않음: ${normalized}`)
  }
})

test("복사 실패 안내 문구는 비어 있지 않다", () => {
  // 문구가 비면 role="alert" 영역이 아무것도 읽어주지 않아 오류 노출이 사라진다.
  for (const [key, message] of Object.entries(ROOM_CODE_COPY_ERRORS)) {
    assert.equal(typeof message, "string", `${key} 문구가 문자열이 아님`)
    assert.ok(message.trim().length > 0, `${key} 문구가 비어 있음`)
  }
})
