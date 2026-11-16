// 소셜 가입 칸의 이메일 인증 상태 시험 — 서버가 인증을 요구할 때·안 요구할 때 보내기가 어떻게 되나
// 목록 A11a 화면 상태 A11-F-078~079 (소셜 가입 상태 훅을 라우터 안에서 돌림)
import test from "node:test"
import assert from "node:assert/strict"
import { rtl, NICK, BIRTH, TERMS, serve, sent, resetAll, settle, renderHookInRouter } from "./a11Kit.mjs"

const { useSocialSignup } = await import("../../src/domains/auth/hooks/useSocialSignup.js")

const COMPLETE = "/auth/social/signup/complete"

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

// 가입 정보(intent) 답과 약관 목록을 정하고 훅을 돌림, 약관은 전부 고름
async function start(emailVerificationRequired) {
  serve({
    "POST /auth/social/signup/intent": { status: 200, body: { success: true, data: { emailVerificationRequired } } },
    "GET /auth/terms": { status: 200, body: { success: true, data: { terms: TERMS } } },
    [`POST ${COMPLETE}`]: { status: 200, body: { success: true, data: { user: { uuid: "u-social-1", nickname: NICK, role: "USER" } } } },
  })
  const view = renderHookInRouter(() => useSocialSignup("tok-a11"), { at: "/login?socialIntent=tok-a11" })
  await settle()
  assert.equal(view.result.current.intentStatus, "ready")
  rtl.act(() => view.result.current.signupTerms.toggleAll())
  return view
}

test("A11-F-078 인증 필요한 가입 정보 → 인증 없이 보내기 = 요청 0번 + \"이메일 인증을 완료해주세요.\"", async () => {
  const { result } = await start(true)
  await rtl.act(async () => { await result.current.submit({ nickname: NICK, birthDate: BIRTH }) })
  assert.equal(sent("POST", COMPLETE).length, 0)
  assert.equal(result.current.errorMessage, "이메일 인증을 완료해주세요.")
})

test("A11-F-079 인증 필요 없는 가입 정보 → 이메일 인증 없이 보냄", async () => {
  const { result } = await start(false)
  await rtl.act(async () => { await result.current.submit({ nickname: NICK, birthDate: BIRTH }) })
  const calls = sent("POST", COMPLETE)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.email, undefined)
  assert.equal(calls[0].body.signupProof, undefined)
  assert.equal(calls[0].body.nickname, NICK)
})
