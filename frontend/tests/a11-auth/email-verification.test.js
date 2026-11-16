// 가입 이메일 인증 상태 시험 — 받기·확인 누름에 따라 단계·남은 초·문구·보낸 요청이 어떻게 바뀌나
// 목록 A11a 화면 상태 A11-F-009~037 (서버는 가짜 답, 시간은 가짜 시계)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  rtl, EMAIL, NETWORK, serve, sent, deferred, resetAll, settle,
} from "./a11Kit.mjs"

const { useSignupEmailVerification } = await import("../../src/domains/auth/hooks/useSignupEmailVerification.js")
const { sendButtonLabel, pickNotice } = await import("../../src/domains/auth/utils/emailVerification/notice.js")

const CODE_PATH = "/auth/signup/email-code"
const VERIFY_PATH = "/auth/signup/email-code/verify"
const T0 = Date.UTC(2026, 10, 16, 3, 0, 0)
// 서버 받기 성공 답 (F-31 2-1 모양)
const SENT_OK = { status: 200, body: { ok: true, resendAfterSec: 60, expiresInSec: 600 } }
const PROOF = "proof-시험값-abc123"

test.beforeEach(() => resetAll())
test.afterEach(() => {
  resetAll()
  mock.timers.reset()
})

// 가짜 시계 켜기 (1초마다 다시 그리는 시계와 지금 시각)
const useClock = () => mock.timers.enable({ apis: ["setInterval", "Date"], now: T0 })
// 1초씩 넘김 (다시 그림이 그때그때 끝나게)
async function tickSeconds(n) {
  for (let i = 0; i < n; i += 1) rtl.act(() => { mock.timers.tick(1000) })
  await settle(1)
}

function start(email = EMAIL) {
  return rtl.renderHook((props) => useSignupEmailVerification(props), { initialProps: { email, active: true } })
}
const now = (hook) => hook.result.current
const view = (hook) => now(hook).signupEmailVerification
async function press(fn) { await rtl.act(async () => { await fn() }) }
async function requestCode(hook) { await press(() => now(hook).handleRequestSignupCode()) }
async function verify(hook) { await press(() => now(hook).handleVerifySignupCode()) }
function typeCode(hook, value) { rtl.act(() => now(hook).handleSignupCodeChange({ target: { value } })) }

// 받기 성공까지
async function toCodeSent(hook) {
  serve({ [`POST ${CODE_PATH}`]: SENT_OK })
  await requestCode(hook)
  assert.equal(view(hook).stage, "codeSent")
}

test("A11-F-009 형식 맞는 이메일로 받기 누름 → 보내는 중·요청 1번", async () => {
  const late = deferred()
  serve({ [`POST ${CODE_PATH}`]: late.promise })
  const hook = start()
  let pending
  rtl.act(() => { pending = now(hook).handleRequestSignupCode() })
  assert.equal(view(hook).stage, "sending")
  assert.equal(sent("POST", CODE_PATH).length, 1)
  late.resolve(SENT_OK)
  await rtl.act(async () => { await pending })
})

test("A11-F-010 보내는 중에 또 누름 → 요청 그대로 1번", async () => {
  const late = deferred()
  serve({ [`POST ${CODE_PATH}`]: late.promise })
  const hook = start()
  let pending
  rtl.act(() => { pending = now(hook).handleRequestSignupCode() })
  await requestCode(hook)
  assert.equal(sent("POST", CODE_PATH).length, 1)
  late.resolve(SENT_OK)
  await rtl.act(async () => { await pending })
})

test("A11-F-011 형식 틀린 이메일(a@b)로 받기 → 요청 0번, 처음 단계 그대로", async () => {
  serve({ [`POST ${CODE_PATH}`]: SENT_OK })
  const hook = start("a@b")
  await requestCode(hook)
  assert.equal(sent("POST", CODE_PATH).length, 0)
  assert.equal(view(hook).stage, "unverified")
})

test("A11-F-012 받기 성공 → 보냄 단계, 다시 보내기 60초, 번호 끝 = 지금+600초", async () => {
  useClock()
  const hook = start()
  await toCodeSent(hook)
  assert.equal(sent("POST", CODE_PATH)[0].body.email, EMAIL)
  assert.equal(view(hook).resendRemainingSec, 60)
  assert.equal(view(hook).codeRemainingSec, 600)
})

test("A11-F-013 받기 → 429 RESEND_TOO_SOON 30초 → 보냄 단계, 남은 초 30", async () => {
  useClock()
  serve({ [`POST ${CODE_PATH}`]: { status: 429, body: { ok: false, code: "RESEND_TOO_SOON", resendAfterSec: 30 } } })
  const hook = start()
  await requestCode(hook)
  assert.equal(view(hook).stage, "codeSent")
  assert.equal(view(hook).resendRemainingSec, 30)
})

test("A11-F-014 받기 → 429 RATE_LIMITED → 처음 단계 + 요청 많음 문구", async () => {
  serve({ [`POST ${CODE_PATH}`]: { status: 429, body: { ok: false, code: "RATE_LIMITED" } } })
  const hook = start()
  await requestCode(hook)
  assert.equal(view(hook).stage, "unverified")
  assert.equal(view(hook).message, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.")
})

test("A11-F-015 받기 → 통신 끊김 → 처음 단계 + 통신 실패 문구", async () => {
  serve({ [`POST ${CODE_PATH}`]: NETWORK })
  const hook = start()
  await requestCode(hook)
  assert.equal(view(hook).stage, "unverified")
  assert.equal(view(hook).message, "서버와 통신할 수 없습니다. 다시 시도해주세요.")
})

test("A11-F-016 보냄 단계에서 확인 누름 → 확인 중·요청 1번", async () => {
  const hook = start()
  await toCodeSent(hook)
  const late = deferred()
  serve({ [`POST ${VERIFY_PATH}`]: late.promise })
  typeCode(hook, "123456")
  let pending
  rtl.act(() => { pending = now(hook).handleVerifySignupCode() })
  assert.equal(view(hook).stage, "verifying")
  assert.equal(sent("POST", VERIFY_PATH).length, 1)
  assert.deepEqual(sent("POST", VERIFY_PATH)[0].body, { email: EMAIL, code: "123456" })
  late.resolve({ status: 200, body: { ok: true, signupProof: PROOF } })
  await rtl.act(async () => { await pending })
})

test("A11-F-017 다시 보내기 남은 초 0 → 다시 받기 요청 1번 더, 적던 번호 지움", async () => {
  useClock()
  const hook = start()
  await toCodeSent(hook)
  typeCode(hook, "111111")
  await tickSeconds(60)
  assert.equal(view(hook).resendRemainingSec, 0)
  await requestCode(hook)
  assert.equal(sent("POST", CODE_PATH).length, 2)
  assert.equal(view(hook).code, "")
})

test("A11-F-018 다시 보내기 남은 초 10 → 요청 안 나감", async () => {
  useClock()
  const hook = start()
  await toCodeSent(hook)
  await tickSeconds(50)
  assert.equal(view(hook).resendRemainingSec, 10)
  await requestCode(hook)
  assert.equal(sent("POST", CODE_PATH).length, 1)
})

test("A11-F-019 남은 초가 1초씩 줄어 60초 뒤 0, 그때 다시 받기 됨", async () => {
  useClock()
  const hook = start()
  await toCodeSent(hook)
  await tickSeconds(1)
  assert.equal(view(hook).resendRemainingSec, 59)
  await tickSeconds(59)
  assert.equal(view(hook).resendRemainingSec, 0)
  await requestCode(hook)
  assert.equal(sent("POST", CODE_PATH).length, 2)
})

test("A11-F-020 보냄 단계에서 600초 지남 → 만료 단계 + 만료 문구", async () => {
  useClock()
  const hook = start()
  await toCodeSent(hook)
  await tickSeconds(600)
  assert.equal(view(hook).stage, "codeExpired")
  assert.equal(view(hook).message, "인증번호가 만료되었습니다. 다시 받아주세요.")
})

test("A11-F-021 확인 성공(signupProof) → 인증됨, 가입 보내기 됨", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: { status: 200, body: { ok: true, signupProof: PROOF } } })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "verified")
  assert.equal(now(hook).hasValidSignupProof, true)
  assert.deepEqual(now(hook).buildSignupPayload(), { email: EMAIL, signupProof: PROOF })
})

test("A11-F-022 확인 → 400 CODE_INVALID 남은 3 → 보냄 단계 + 남은 횟수 3", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: { status: 400, body: { ok: false, code: "CODE_INVALID", attemptsRemaining: 3 } } })
  typeCode(hook, "000000")
  await verify(hook)
  assert.equal(view(hook).stage, "codeSent")
  assert.equal(view(hook).attemptsRemaining, 3)
})

test("A11-F-023 확인 → 400 CODE_EXPIRED → 만료 단계", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: { status: 400, body: { ok: false, code: "CODE_EXPIRED" } } })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "codeExpired")
})

test("A11-F-024 확인 → 429 TOO_MANY_ATTEMPTS → 잠김 + 초과 문구, 확인은 안 되고 다시 받기만 됨", async () => {
  useClock()
  const hook = start()
  await toCodeSent(hook)
  serve({
    [`POST ${CODE_PATH}`]: SENT_OK,
    [`POST ${VERIFY_PATH}`]: { status: 429, body: { ok: false, code: "TOO_MANY_ATTEMPTS" } },
  })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "locked")
  assert.equal(view(hook).message, "오입력 횟수를 초과했습니다. 다시 받아주세요.")
  // 확인 다시 → 요청 안 나감
  await verify(hook)
  assert.equal(sent("POST", VERIFY_PATH).length, 1)
  // 대기 끝나면 다시 받기는 나감
  await tickSeconds(60)
  await requestCode(hook)
  assert.equal(sent("POST", CODE_PATH).length, 2)
})

test("A11-F-025 확인 → 통신 끊김 → 보냄 단계 + 다시 시도 문구, 적은 번호 그대로", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: NETWORK })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "codeSent")
  assert.equal(view(hook).message, "서버와 통신할 수 없습니다. 다시 시도해주세요.")
  assert.equal(view(hook).code, "123456")
})

// 이메일 한 글자 바꾼 뒤 비워졌는지 (증명·번호·남은 초·끝 시각)
function assertCleared(hook) {
  assert.equal(view(hook).stage, "unverified")
  assert.equal(view(hook).code, "")
  assert.equal(view(hook).resendRemainingSec, 0)
  assert.equal(view(hook).codeRemainingSec, null)
  assert.equal(now(hook).hasValidSignupProof, false)
  assert.equal(now(hook).buildSignupPayload(), null)
}

test("A11-F-026 보냄 단계에서 이메일 한 글자 바꿈 → 처음으로, 번호·남은 초·끝 시각 비움", async () => {
  useClock()
  const hook = start()
  await toCodeSent(hook)
  typeCode(hook, "123456")
  hook.rerender({ email: "tester2@example.com", active: true })
  assertCleared(hook)
})

test("A11-F-027 인증됨에서 이메일 한 글자 바꿈 → 처음으로, 증명 비움", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: { status: 200, body: { ok: true, signupProof: PROOF } } })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "verified")
  hook.rerender({ email: "tester2@example.com", active: true })
  assertCleared(hook)
})

test("A11-F-028 확인 답이 200인데 ok 아님 → 통신 실패 안내, 적은 번호 그대로 (인증 안 됨)", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: { status: 200, body: { ok: false } } })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "codeSent")
  assert.equal(view(hook).message, "서버와 통신할 수 없습니다. 다시 시도해주세요.")
  assert.equal(view(hook).code, "123456")
})

test("A11-F-029 확인 답이 모르는 code + 400 → 통신 실패 안내, 적은 번호 그대로", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: { status: 400, body: { ok: false, code: "SOMETHING_NEW" } } })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "codeSent")
  assert.equal(view(hook).message, "서버와 통신할 수 없습니다. 다시 시도해주세요.")
  assert.equal(view(hook).code, "123456")
})

test("A11-F-030 인증됨 뒤 localStorage·sessionStorage 어디에도 증명 글자 없음", async () => {
  const hook = start()
  await toCodeSent(hook)
  serve({ [`POST ${VERIFY_PATH}`]: { status: 200, body: { ok: true, signupProof: PROOF } } })
  typeCode(hook, "123456")
  await verify(hook)
  assert.equal(view(hook).stage, "verified")
  const stored = []
  for (const store of [window.localStorage, window.sessionStorage]) {
    for (let i = 0; i < store.length; i += 1) stored.push(store.getItem(store.key(i)))
  }
  assert.equal(stored.some((v) => String(v).includes(PROOF)), false)
})

test("A11-F-031 받기 단추 글자: 보내는 중 → \"발송 중...\"", () => {
  assert.equal(sendButtonLabel("sending", 0), "발송 중...")
})
test("A11-F-032 받기 단추 글자: 처음 → \"인증번호 받기\"", () => {
  assert.equal(sendButtonLabel("unverified", 0), "인증번호 받기")
})
test("A11-F-033 받기 단추 글자: 남은 12초 → \"재발송 (12초)\"", () => {
  assert.equal(sendButtonLabel("codeSent", 12), "재발송 (12초)")
})
test("A11-F-034 받기 단추 글자: 0초 → \"재발송\"", () => {
  assert.equal(sendButtonLabel("codeSent", 0), "재발송")
})

test("A11-F-035 안내 줄: 인증됨 → 완료 문구 하나", () => {
  assert.equal(pickNotice({ isVerified: true, stage: "verified", message: "", codeRemainingSec: null }).text, "이메일 인증이 완료되었습니다.")
})
test("A11-F-036 안내 줄: 오류 글 있음 → 그 글 (남은 시간보다 먼저)", () => {
  const msg = "인증번호가 만료되었습니다. 다시 받아주세요."
  assert.equal(pickNotice({ isVerified: false, stage: "codeSent", message: msg, codeRemainingSec: 45 }).text, msg)
})
test("A11-F-037 안내 줄: 보냄 단계 남은 45초 → \"남은 시간 45초\"", () => {
  assert.equal(pickNotice({ isVerified: false, stage: "codeSent", message: "", codeRemainingSec: 45 }).text, "남은 시간 45초")
})
