// 로그인·일반 가입 보내기 상태 시험 — 보내기 전 막힘·가입 성공·증명 문제·로그인 성공과 실패·로그인 유지 값
// 목록 A11a 화면 상태 A11-F-043~054 (로그인 화면 상태 훅을 라우터 안에서 돌림, 서버는 가짜 답)
import test from "node:test"
import assert from "node:assert/strict"
import {
  rtl, EMAIL, PW, NICK, BIRTH, TERMS, alerts, serve, addRoutes, sent, resetAll, settle,
  renderHookInRouter, changeEvent, fakeLocation, useAuthStore,
} from "./a11Kit.mjs"

const { useLoginPage } = await import("../../src/domains/auth/hooks/useLoginPage.js")

const PROOF = "proof-시험값-xyz789"
const SIGNUP_ROUTES = {
  "GET /auth/terms": { status: 200, body: { success: true, data: { terms: TERMS } } },
  "POST /auth/signup/email-code": { status: 200, body: { ok: true, resendAfterSec: 60, expiresInSec: 600 } },
  "POST /auth/signup/email-code/verify": { status: 200, body: { ok: true, signupProof: PROOF } },
}

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

const submitEvent = { preventDefault() {} }
async function act(fn) { await rtl.act(async () => { await fn() }) }

function start(at = "/login") {
  fakeLocation(at)
  return renderHookInRouter(() => useLoginPage(), { at })
}
async function fill(result, values) {
  for (const [name, value] of Object.entries(values)) {
    rtl.act(() => result.current.handleInputChange(changeEvent(name, value)))
  }
}
async function submit(result) { await act(() => result.current.handleSubmit(submitEvent)) }

// 가입 칸으로 바꾸고 맞는 값 채움 (약관·인증은 고르게 함)
async function toSignup(result, { terms = true, verify = true } = {}) {
  addRoutes(SIGNUP_ROUTES)
  rtl.act(() => result.current.setIsSignupMode(true))
  await settle()
  await fill(result, { email: EMAIL, password: PW, passwordConfirm: PW, nickname: NICK, birthDate: BIRTH })
  if (terms) rtl.act(() => result.current.signupTerms.toggleAll())
  if (verify) {
    await act(() => result.current.handleRequestSignupCode())
    rtl.act(() => result.current.handleSignupCodeChange({ target: { value: "123456" } }))
    await act(() => result.current.handleVerifySignupCode())
    assert.equal(result.current.signupEmailVerification.stage, "verified")
  }
}

test("A11-F-043 가입: 입력 규칙 틀림(비번 7자) → 알림 하나, 가입 요청 0번", async () => {
  const { result } = start()
  await toSignup(result)
  await fill(result, { password: "testpas", passwordConfirm: "testpas" })
  await submit(result)
  assert.equal(alerts.length, 1)
  assert.equal(sent("POST", "/auth/signup").length, 0)
})

test("A11-F-044 가입: 약관 안 고름 → 알림 하나, 가입 요청 0번", async () => {
  const { result } = start()
  await toSignup(result, { terms: false })
  await submit(result)
  assert.equal(alerts.length, 1)
  assert.equal(sent("POST", "/auth/signup").length, 0)
})

test("A11-F-045 가입: 이메일 인증 안 됨 → 알림 하나, 가입 요청 0번", async () => {
  const { result } = start()
  await toSignup(result, { verify: false })
  await submit(result)
  assert.equal(alerts.length, 1)
  assert.equal(sent("POST", "/auth/signup").length, 0)
})

test("A11-F-046 가입 성공 → 완료 알림 + 로그인 칸으로 + 인증·약관 비움", async () => {
  const { result } = start()
  await toSignup(result)
  addRoutes({ "POST /auth/signup": { status: 200, body: { success: true, message: "회원가입이 완료되었습니다." } } })
  await submit(result)
  assert.deepEqual(alerts, ["회원가입이 완료되었습니다! 로그인해주세요."])
  const body = sent("POST", "/auth/signup")[0].body
  assert.equal(body.signupProof, PROOF)
  assert.deepEqual(body.agreedTermsVersionIds, [1, 2])
  assert.equal(result.current.isSignupMode, false)
  assert.equal(result.current.signupEmailVerification.stage, "unverified")
  assert.deepEqual(result.current.signupTerms.agreedIds, [])
  assert.equal(result.current.signupTerms.ageConfirmed, false)
})

test("A11-F-047 가입 → 401 SIGNUP_PROOF_REQUIRED → 인증 비움 + 다시 인증 안내", async () => {
  const { result } = start()
  await toSignup(result)
  addRoutes({ "POST /auth/signup": { status: 401, body: { success: false, message: "이메일 인증이 필요합니다.", code: "SIGNUP_PROOF_REQUIRED" } } })
  await submit(result)
  assert.equal(result.current.signupEmailVerification.stage, "unverified")
  assert.deepEqual(alerts, ["이메일 인증이 필요합니다. 다시 인증해주세요."])
})

test("A11-F-048 가입 → 401 SIGNUP_PROOF_INVALID → 인증 비움 + 만료·사용됨 안내", async () => {
  const { result } = start()
  await toSignup(result)
  addRoutes({ "POST /auth/signup": { status: 401, body: { success: false, message: "이메일 인증 증명이 유효하지 않습니다.", code: "SIGNUP_PROOF_INVALID" } } })
  await submit(result)
  assert.equal(result.current.signupEmailVerification.stage, "unverified")
  assert.deepEqual(alerts, ["이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요."])
})

test("A11-F-049 가입 답이 200인데 success 없음 → 통신 실패 알림, 로그인 칸으로 안 감", async () => {
  const { result } = start()
  await toSignup(result)
  addRoutes({ "POST /auth/signup": { status: 200, body: {} } })
  await submit(result)
  assert.deepEqual(alerts, ["서버와 연결할 수 없습니다. 다시 시도해주세요."])
  assert.equal(result.current.isSignupMode, true)
})

const USER = { uuid: "u-a11-1", nickname: NICK, role: "USER" }

test("A11-F-050 로그인 성공 → 스토어에 계정 + 주소 /lobby", async () => {
  serve({
    "POST /auth/login": { status: 200, body: { success: true, data: { user: USER } } },
    "GET /auth/me": { status: 200, body: { success: true, data: { uuid: USER.uuid, role: "USER" } } },
  })
  const { result, router } = start()
  await fill(result, { email: EMAIL, password: PW })
  await submit(result)
  await settle()
  assert.equal(useAuthStore.getState().user?.uuid, USER.uuid)
  assert.equal(router.state.location.pathname, "/lobby")
})

// 로그인 실패: 서버 문구 그대로 알림, 주소·스토어 그대로
async function loginFails(status, message) {
  serve({ "POST /auth/login": { status, body: { success: false, message } } })
  const { result, router } = start()
  await fill(result, { email: EMAIL, password: PW })
  await submit(result)
  await settle()
  assert.deepEqual(alerts, [message])
  assert.equal(router.state.location.pathname, "/login")
  assert.equal(useAuthStore.getState().user, null)
}

test("A11-F-051 로그인 401 → 그 답의 문구 알림, /login 그대로, 스토어 빔", async () => {
  await loginFails(401, "이메일 또는 비밀번호가 일치하지 않습니다.")
})

test("A11-F-052 로그인 423 → 그 답의 문구 알림, /login 그대로, 스토어 빔", async () => {
  await loginFails(423, "비밀번호 연속 오류로 계정이 잠겼습니다. 잠시 후 다시 시도해주세요.")
})

test("A11-F-053 로그인 429 → 그 답의 문구 알림, /login 그대로, 스토어 빔", async () => {
  await loginFails(429, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.")
})

test("A11-F-054 로그인 유지 켬 → 본문 rememberMe:true / 끔 → false", async () => {
  serve({ "POST /auth/login": { status: 401, body: { success: false, message: "이메일 또는 비밀번호가 일치하지 않습니다." } } })
  const { result } = start()
  await fill(result, { email: EMAIL, password: PW })
  rtl.act(() => result.current.setRememberMe(true))
  await submit(result)
  rtl.act(() => result.current.setRememberMe(false))
  await submit(result)
  const bodies = sent("POST", "/auth/login").map((r) => r.body.rememberMe)
  assert.deepEqual(bodies, [true, false])
})
