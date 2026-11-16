// 가입 칸 비번 영문+숫자 섞기 규칙 시험 — 화면 검사가 서버 검사와 같은 값에서 같은 결과·같은 문구인지
// 목록 A11a 화면 상태 A11-F-096~101 (2026-11-16 결정 다섯째 2)
import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import "../helpers/domSetup.mjs"

const { validateSignupForm, validatePassword } = await import("../../src/domains/auth/validation/signupValidation.js")
// 서버 검사도 같이 불러 견줌 (읽기만)
const require = createRequire(import.meta.url)
const server = require("../../../backend/validations/auth/signup.js")

const MIX_MESSAGE = "비밀번호는 영문과 숫자를 모두 포함해야 합니다."
// 비번만 바꿔 넣는 가입 칸 값 (나머지는 맞는 값)
const form = (password) => ({
  email: "tester@example.com", nickname: "시험사람", birthDate: "2000-01-01", password, passwordConfirm: password,
})

// 길이·바이트는 다 맞고 글자 종류만 다른 값
const CASES = [
  ["096", "영문만 8자", "abcdefgh", false],
  ["097", "숫자만 8자", "12345678", false],
  ["098", "영문+숫자 8자", "abcdefg1", true],
  ["099", "영문+숫자+기호", "Mask-2026!", true],
  ["100", "한글+영문 1+숫자 1", "가면무도회살a1", true],
  ["101", "한글만 8자", "가면무도회살인사", false],
]

for (const [no, name, pw, ok] of CASES) {
  test(`A11-F-${no} 가입 비번 ${name} → 화면 ${ok ? "통과" : "거절"}, 서버와 결과·문구 같음`, () => {
    const screen = validateSignupForm(form(pw))
    assert.equal(screen.ok, ok)
    if (!ok) assert.equal(screen.message, MIX_MESSAGE)
    // 비번 하나만 보는 검사(재설정·비번 바꾸기가 씀)도 같은 답
    assert.equal(validatePassword(pw).ok, ok)
    const back = server.validateSignupPayload(form(pw))
    assert.equal(back.ok, ok)
    assert.equal(back.message ?? null, screen.message ?? null)
  })
}
