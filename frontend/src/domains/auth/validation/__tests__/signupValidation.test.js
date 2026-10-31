import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

import {
  NICKNAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
  validateNickname,
  validateBirthDate,
  validatePassword,
  validatePasswordConfirm,
  validateSignupForm,
  parseIsoDateUtc,
} from "../signupValidation.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, "..", "..", "..", "..", "..", "..", "tests", "fixtures", "f02-signup-validation.json")
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"))

test("AC-01: fixture 경계값과 동일한 min/max를 사용한다", () => {
  assert.equal(NICKNAME_MIN_LENGTH, fixture.nickname.minLength)
  assert.equal(NICKNAME_MAX_LENGTH, fixture.nickname.maxLength)
})

test("AC-01: fixture의 유효한 닉네임은 모두 통과한다", () => {
  for (const value of fixture.nickname.valid) {
    assert.equal(validateNickname(value).ok, true, `"${value}"는 통과해야 합니다`)
  }
})

test("AC-01: fixture의 무효한 닉네임은 모두 거부된다", () => {
  for (const { value, reason } of fixture.nickname.invalid) {
    assert.equal(validateNickname(value).ok, false, `"${value}"는 거부되어야 합니다 (${reason})`)
  }
})

test("AC-01: 1자/9자 경계는 거부, 2자/8자 경계는 허용된다", () => {
  assert.equal(validateNickname("가").ok, false)
  assert.equal(validateNickname("일이삼사오육칠팔구").ok, false)
  assert.equal(validateNickname("가나").ok, true)
  assert.equal(validateNickname("일이삼사오육칠팔").ok, true)
})

test("AC-03: fixture의 유효한 생년월일은 모두 통과한다", () => {
  for (const value of fixture.birthDate.valid) {
    assert.equal(validateBirthDate(value).ok, true, `"${value}"는 통과해야 합니다`)
  }
})

test("AC-03: fixture의 무효한 생년월일(빈값/형식오류/존재하지 않는 날짜)은 모두 거부된다", () => {
  for (const { value, reason } of fixture.birthDate.invalid) {
    assert.equal(validateBirthDate(value).ok, false, `"${value}"는 거부되어야 합니다 (${reason})`)
  }
})

test("AC-03: 미래 날짜는 거부된다", () => {
  const now = new Date()
  const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const iso = tomorrowUtc.toISOString().slice(0, 10)
  assert.equal(validateBirthDate(iso).ok, false)
})

test("AC-03: 파싱된 날짜는 UTC 자정을 가리켜 시간대 차이로 하루가 이동하지 않는다", () => {
  const parsed = parseIsoDateUtc("2000-06-15")
  assert.equal(parsed.getUTCFullYear(), 2000)
  assert.equal(parsed.getUTCMonth(), 5)
  assert.equal(parsed.getUTCDate(), 15)
  assert.equal(parsed.toISOString().slice(0, 10), "2000-06-15")
})

test("AC-04: fixture의 유효한 비밀번호는 모두 통과한다", () => {
  for (const value of fixture.password.valid) {
    assert.equal(validatePassword(value).ok, true, `길이 ${value.length}는 통과해야 합니다`)
  }
})

test("AC-04: fixture의 무효한 비밀번호는 모두 거부된다", () => {
  for (const { value, reason } of fixture.password.invalid) {
    assert.equal(validatePassword(value).ok, false, `"${reason}" 케이스는 거부되어야 합니다`)
  }
})

test("F-04 AC-04: bcrypt 72바이트를 넘는 비밀번호는 거부된다(멀티바이트 문자 포함)", () => {
  assert.equal(validatePassword("가".repeat(25)).ok, false)
  assert.equal(validatePassword("가".repeat(24)).ok, true)
})

test("AC-04: 비밀번호와 비밀번호 확인이 다르면 거부된다", () => {
  assert.equal(validatePasswordConfirm("pw12345678", "pw12345678").ok, true)
  assert.equal(validatePasswordConfirm("pw12345678", "different").ok, false)
})

test("AC-04: validateSignupForm은 비밀번호 확인 불일치를 거부한다", () => {
  const result = validateSignupForm({
    email: "a@b.com",
    password: "pw12345678",
    passwordConfirm: "다른값입니다12",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
  })
  assert.equal(result.ok, false)
})

test("AC-04: validateSignupForm은 모든 조건을 만족하면 통과한다", () => {
  const result = validateSignupForm({
    email: "a@b.com",
    password: "pw12345678",
    passwordConfirm: "pw12345678",
    nickname: "테스트닉",
    birthDate: "2000-01-01",
  })
  assert.equal(result.ok, true)
})
