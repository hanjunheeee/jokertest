// 가입 칸 입력 규칙 시험 — 화면 검사가 서버 검사와 같은 값에서 같은 결과·같은 문구인지
// 목록 A11a 화면 상태 A11-F-001~008
import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import "../helpers/domSetup.mjs"

const { validateSignupForm } = await import("../../src/domains/auth/validation/signupValidation.js")
// 서버 검사도 같이 불러 견줌 (읽기만)
const require = createRequire(import.meta.url)
const server = require("../../../backend/validations/auth/signup.js")

// 비번만 바꿔 넣는 가입 칸 값 (나머지는 맞는 값)
const form = (password, passwordConfirm = password) => ({
  email: "tester@example.com", nickname: "시험사람", birthDate: "2000-01-01", password, passwordConfirm,
})
const LENGTH_MESSAGE = "비밀번호는 8~64자여야 합니다."
// 길이 경계 값 (끝 한 자는 숫자 — 영문+숫자 규칙엔 안 걸리고 길이만 보게)
const mixed = (length) => `${"a".repeat(length - 1)}1`

test("A11-F-001 비번 7자 → 화면이 거절, 서버와 같은 문구", () => {
  const r = validateSignupForm(form(mixed(7)))
  assert.equal(r.ok, false)
  assert.equal(r.message, LENGTH_MESSAGE)
})

test("A11-F-002 비번 8자 → 통과", () => {
  assert.equal(validateSignupForm(form(mixed(8))).ok, true)
})

test("A11-F-003 비번 64자 → 통과", () => {
  assert.equal(validateSignupForm(form(mixed(64))).ok, true)
})

test("A11-F-004 비번 65자 → 화면이 거절, 서버와 같은 문구", () => {
  const r = validateSignupForm(form(mixed(65)))
  assert.equal(r.ok, false)
  assert.equal(r.message, LENGTH_MESSAGE)
})

test("A11-F-005 한글 23자 + a1b(72바이트) 비번 → 통과", () => {
  assert.equal(validateSignupForm(form(`${"가".repeat(23)}a1b`)).ok, true)
})

test("A11-F-006 한글 24자 + a1b(75바이트) 비번 → 72바이트 문구로 거절", () => {
  const r = validateSignupForm(form(`${"가".repeat(24)}a1b`))
  assert.equal(r.ok, false)
  assert.equal(r.message, "비밀번호는 72바이트를 넘을 수 없습니다.")
})

test("A11-F-007 비번 확인 칸 다름 → 확인 문구", () => {
  const r = validateSignupForm(form("testpass1", "testpass2"))
  assert.equal(r.ok, false)
  assert.equal(r.message, "비밀번호 확인이 일치하지 않습니다.")
})

// 같은 입력표 하나로 화면·서버 둘 다 돌려 줄마다 견줌 (서버 생일은 Date라 통과 여부·문구만 봄)
const SHARED_ROWS = [
  form(mixed(7)), form(mixed(8)), form(mixed(64)), form(mixed(65)),
  form(`${"가".repeat(23)}a1b`), form(`${"가".repeat(24)}a1b`), form(" abcdef1"), form("abcdef1"),
  form("testpass1", "testpass2"), form("testpass1", ""),
  { ...form("testpass1"), nickname: "가" }, { ...form("testpass1"), nickname: "가나" },
  { ...form("testpass1"), nickname: "가나다라마바사아" }, { ...form("testpass1"), nickname: "가나다라마바사아자" },
  { ...form("testpass1"), nickname: "가나_다" }, { ...form("testpass1"), nickname: "   " },
  { ...form("testpass1"), birthDate: "2010-02-30" }, { ...form("testpass1"), birthDate: "2010/01/01" },
  { ...form("testpass1"), birthDate: "2012-02-29" }, { ...form("testpass1"), birthDate: "2013-02-29" },
]

test("A11-F-008 공용 입력표 20줄 → 줄마다 화면·서버 통과 여부·문구가 같음", () => {
  assert.equal(SHARED_ROWS.length, 20)
  const differ = []
  SHARED_ROWS.forEach((row, i) => {
    const screen = validateSignupForm(row)
    const back = server.validateSignupPayload(row)
    if (screen.ok !== back.ok || (screen.message ?? null) !== (back.message ?? null)) {
      differ.push(`${i + 1}줄: 화면 ${screen.ok}/${screen.message} · 서버 ${back.ok}/${back.message}`)
    }
  })
  assert.deepEqual(differ, [])
})
