// 소셜 로그인·소셜 가입 풀이 시험 — 실패 code → 문구, 로그인 주소 → 화면 모드, 가입 정보·가입 보내기 실패 → 상태·문구
// 목록 A11a 화면 상태 A11-F-063~077 (가입 실패는 가짜 서버 답을 진짜 요청 함수로 받아 풂)
import test from "node:test"
import assert from "node:assert/strict"
import { serve, resetAll } from "./a11Kit.mjs"

const { mapSocialErrorCode, resolveSocialLoginView, intentErrorView, submitErrorView } = await import("../../src/domains/auth/utils/socialErrors.js")
const { getSocialSignupIntentApi, completeSocialSignupApi } = await import("../../src/domains/auth/api/auth.api.js")

const DEFAULT_MESSAGE = "소셜 로그인에 실패했습니다. 다시 시도해주세요."

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

test("A11-F-063 OAUTH_CANCELLED → \"소셜 로그인을 취소했습니다.\"", () => {
  assert.equal(mapSocialErrorCode("OAUTH_CANCELLED"), "소셜 로그인을 취소했습니다.")
})
test("A11-F-064 EMAIL_CONFLICT → 기존 계정으로 로그인 뒤 연결 안내", () => {
  assert.equal(mapSocialErrorCode("EMAIL_CONFLICT"), "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 연결해주세요.")
})
test("A11-F-065 ACCOUNT_BANNED → \"정지된 계정입니다. 운영정책을 확인해주세요.\"", () => {
  assert.equal(mapSocialErrorCode("ACCOUNT_BANNED"), "정지된 계정입니다. 운영정책을 확인해주세요.")
})
test("A11-F-066 GOOGLE_OAUTH_NOT_CONFIGURED → 기본 문구 아닌 제 문구", () => {
  const message = mapSocialErrorCode("GOOGLE_OAUTH_NOT_CONFIGURED")
  assert.equal(typeof message, "string")
  assert.notEqual(message, DEFAULT_MESSAGE)
})
test("A11-F-067 모르는 code → 기본 문구", () => {
  assert.equal(mapSocialErrorCode("NOT_A_REAL_CODE"), DEFAULT_MESSAGE)
})
test("A11-F-068 \"toString\" → 기본 문구 (물려받은 이름에 안 걸림)", () => {
  assert.equal(mapSocialErrorCode("toString"), DEFAULT_MESSAGE)
})

test("A11-F-069 주소에 socialIntent → 소셜 가입 모드", () => {
  assert.deepEqual(resolveSocialLoginView({ socialIntent: "tok-1", socialError: null }), { mode: "socialSignup", intentToken: "tok-1" })
})
test("A11-F-070 주소에 socialError만 → 실패 문구 모드", () => {
  assert.deepEqual(resolveSocialLoginView({ socialIntent: null, socialError: "OAUTH_CANCELLED" }), { mode: "socialError", message: "소셜 로그인을 취소했습니다." })
})
test("A11-F-071 둘 다 없음 → 보통 로그인", () => {
  assert.deepEqual(resolveSocialLoginView({ socialIntent: null, socialError: null }), { mode: "default" })
})

// 가짜 서버 답을 진짜 요청 함수로 받아 실패 값을 꺼냄
async function intentError(status, body) {
  serve({ "POST /auth/social/signup/intent": { status, body } })
  try {
    await getSocialSignupIntentApi({ intentToken: "tok-1" })
  } catch (error) {
    return error
  }
  throw new Error("실패해야 하는 요청이 성공함")
}
async function completeError(status, body) {
  serve({ "POST /auth/social/signup/complete": { status, body } })
  try {
    await completeSocialSignupApi({ intentToken: "tok-1", nickname: "시험사람", birthDate: "2000-01-01" })
  } catch (error) {
    return error
  }
  throw new Error("실패해야 하는 요청이 성공함")
}

test("A11-F-072 가입 정보 INTENT_EXPIRED·INTENT_INVALID → 둘 다 만료 상태", async () => {
  const expired = intentErrorView(await intentError(400, { success: false, message: "가입 가능 시간이 만료되었습니다. 다시 로그인해주세요.", code: "INTENT_EXPIRED" }))
  const invalid = intentErrorView(await intentError(400, { success: false, message: "가입 정보가 없습니다.", code: "INTENT_INVALID" }))
  assert.equal(expired.status, "expired")
  assert.equal(invalid.status, "expired")
})

test("A11-F-073 가입 정보 INTENT_CONSUMED → 이미 처리됨 상태", async () => {
  const v = intentErrorView(await intentError(409, { success: false, message: "이미 처리된 가입 요청입니다.", code: "INTENT_CONSUMED" }))
  assert.equal(v.status, "cancelled")
})

test("A11-F-074 가입 정보 500 + code → code 안 믿고 불러오기 실패 문구", async () => {
  const v = intentErrorView(await intentError(500, { success: false, message: "서버 내부에서 에러가 발생했습니다.", code: "INTENT_EXPIRED" }))
  assert.equal(v.status, undefined)
  assert.equal(v.message, "가입 정보를 불러오지 못했습니다. 다시 시도해주세요.")
})

test("A11-F-075 가입 보내기 EMAIL_CONFLICT → 충돌 상태", async () => {
  const v = submitErrorView(await completeError(409, { success: false, message: "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.", code: "EMAIL_CONFLICT" }))
  assert.equal(v.status, "conflict")
})

test("A11-F-076 가입 보내기 SIGNUP_PROOF_INVALID → 증명 잃음 + 만료·사용됨 안내", async () => {
  const v = submitErrorView(await completeError(401, { success: false, message: "이메일 인증 증명이 유효하지 않습니다.", code: "SIGNUP_PROOF_INVALID" }))
  assert.equal(v.proofLost, true)
  assert.equal(v.message, "이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요.")
})

test("A11-F-077 가입 보내기 500 → \"서버와 통신할 수 없습니다. 다시 시도해주세요.\"", async () => {
  // 운영 서버의 500 답 모양 (code 없음, 고정 문구)
  const v = submitErrorView(await completeError(500, { success: false, message: "서버 내부에서 에러가 발생했습니다." }))
  assert.equal(v.message, "서버와 통신할 수 없습니다. 다시 시도해주세요.")
})
