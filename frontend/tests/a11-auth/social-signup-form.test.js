// 소셜 가입 칸 부품 시험 — 칸 구성·불러오는 중·막힌 상태 글·생일 빈 값·닉네임 겹침·취소·증명 잃음·약관·닉네임 규칙
// 목록 A11a 화면 부품 A11-F-256~265, A11-F-271~274 (주소에 socialIntent를 넣고 진짜 로그인 화면을 그림)
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, rtl, EMAIL, NICK, BIRTH, TERMS, serve, sent, deferred, resetAll, settle, renderRoutes,
} from "./a11Kit.mjs"

const { default: LoginPage } = await import("../../src/domains/auth/pages/LoginPage.jsx")
const { screen, fireEvent } = rtl

const INTENT = "/auth/social/signup/intent"
const COMPLETE = "/auth/social/signup/complete"
const PROOF = "proof-시험값-social1"

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

const label = {
  email: "이메일을 입력하세요",
  nickname: "사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)",
  birthDate: "생년월일을 선택하세요",
  code: "인증번호를 입력하세요",
}
const input = (name) => screen.getByLabelText(label[name])
async function click(el) { await rtl.act(async () => { fireEvent.click(el) }) }
function type(name, value) { rtl.act(() => { fireEvent.change(input(name), { target: { value } }) }) }
const submitButton = () => screen.getByRole("button", { name: /^(가입 완료|처리 중\.\.\.)$/ })

const intentAnswer = (emailVerificationRequired) => ({ status: 200, body: { success: true, data: { emailVerificationRequired } } })

// 소셜 가입 칸을 그림 (약관 목록은 늘 줌)
async function renderSocial(intent, extra = {}) {
  serve({
    [`POST ${INTENT}`]: intent,
    "GET /auth/terms": { status: 200, body: { success: true, data: { terms: TERMS } } },
    ...extra,
  })
  const view = renderRoutes([
    { path: "/login", element: h(LoginPage) },
    { path: "/lobby", element: h("p", null, "로비 화면") },
  ], { at: "/login?socialIntent=tok-a11" })
  await settle()
  return view
}
async function agreeAll() { await click(screen.getByRole("checkbox", { name: "전체 동의" })) }
async function pressSubmit() {
  await click(submitButton())
  await settle()
}

test("A11-F-256 이메일 확인된 가입 정보 → 닉네임·생일·약관만 (이메일·인증 칸 없음)", async () => {
  await renderSocial(intentAnswer(false))
  assert.ok(input("nickname"))
  assert.ok(input("birthDate"))
  assert.ok(screen.getByRole("group", { name: "약관 동의" }))
  assert.equal(screen.queryByLabelText(label.email), null)
  assert.equal(screen.queryByRole("button", { name: "인증번호 받기" }), null)
})

test("A11-F-257 이메일 없는 가입 정보 → 이메일 칸 + 인증 칸 더", async () => {
  await renderSocial(intentAnswer(true))
  assert.ok(input("email"))
  assert.ok(screen.getByRole("button", { name: "인증번호 받기" }))
  assert.ok(input("nickname"))
})

test("A11-F-258 가입 정보 답 오기 전 → \"가입 정보를 불러오는 중입니다\" 안내, 보내기 막힘", async () => {
  const late = deferred()
  await renderSocial(late.promise)
  assert.ok(screen.getByText(/^가입 정보를 불러오는 중입니다/))
  assert.equal(submitButton().disabled, true)
  late.resolve(intentAnswer(false))
  await settle()
})

test("A11-F-259 만료 → \"소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.\" + 로그인으로", async () => {
  // 서버가 만료일 때 주는 답 그대로
  await renderSocial({ status: 400, body: { success: false, message: "가입 가능 시간이 만료되었습니다. 다시 로그인해주세요.", code: "INTENT_EXPIRED" } })
  assert.equal(screen.getByRole("alert").textContent.trim(), "소셜 로그인 세션이 만료되었습니다. 다시 시도해주세요.")
  assert.ok(screen.getByRole("button", { name: "로그인 화면으로" }))
})

test("A11-F-260 이미 처리됨 → 안내 + 로그인으로", async () => {
  await renderSocial({ status: 409, body: { success: false, message: "이미 처리된 가입 요청입니다.", code: "INTENT_CONSUMED" } })
  assert.ok(screen.getByRole("alert").textContent.trim().length > 0)
  assert.ok(screen.getByRole("button", { name: "로그인 화면으로" }))
  assert.equal(screen.queryByLabelText(label.nickname), null)
})

test("A11-F-261 이메일 충돌 → \"이미 가입된 이메일입니다…\"", async () => {
  await renderSocial(intentAnswer(false), {
    [`POST ${COMPLETE}`]: { status: 409, body: { success: false, message: "이미 가입된 이메일입니다. 기존 계정으로 로그인한 뒤 소셜 계정을 연결해주세요.", code: "EMAIL_CONFLICT" } },
  })
  type("nickname", NICK)
  type("birthDate", BIRTH)
  await agreeAll()
  await pressSubmit()
  assert.ok(screen.getByRole("alert").textContent.trim().startsWith("이미 가입된 이메일입니다"))
  assert.ok(screen.getByRole("button", { name: "로그인 화면으로" }))
})

test("A11-F-262 생일 없이 보냄 → \"생년월일을 입력해주세요.\", 요청 0번", async () => {
  await renderSocial(intentAnswer(false))
  type("nickname", NICK)
  await agreeAll()
  await pressSubmit()
  assert.equal(screen.getByRole("alert").textContent.trim(), "생년월일을 입력해주세요.")
  assert.equal(sent("POST", COMPLETE).length, 0)
})

test("A11-F-263 409 \"이미 사용 중인 닉네임입니다.\" → 칸 아래 글, 입력 그대로", async () => {
  await renderSocial(intentAnswer(false), {
    [`POST ${COMPLETE}`]: { status: 409, body: { success: false, message: "이미 사용 중인 닉네임입니다." } },
  })
  type("nickname", NICK)
  type("birthDate", BIRTH)
  await agreeAll()
  await pressSubmit()
  assert.equal(screen.getByRole("alert").textContent.trim(), "이미 사용 중인 닉네임입니다.")
  assert.equal(input("nickname").value, NICK)
  assert.equal(input("birthDate").value, BIRTH)
})

test("A11-F-264 \"취소\" → 로그인 칸, 주소에서 socialIntent 지움 [지금 동작]", async () => {
  const { router } = await renderSocial(intentAnswer(false))
  await click(screen.getByRole("button", { name: "취소하고 로그인 화면으로" }))
  assert.ok(screen.getByRole("button", { name: "로그인" }))
  assert.equal(new URLSearchParams(router.state.location.search).get("socialIntent"), null)
})

test("A11-F-265 소셜 가입 SIGNUP_PROOF_INVALID → 인증 칸 \"인증번호 받기\"로, 오류 글", async () => {
  await renderSocial(intentAnswer(true), {
    "POST /auth/signup/email-code": { status: 200, body: { ok: true, resendAfterSec: 60, expiresInSec: 600 } },
    "POST /auth/signup/email-code/verify": { status: 200, body: { ok: true, signupProof: PROOF } },
    [`POST ${COMPLETE}`]: { status: 401, body: { success: false, message: "이메일 인증 증명이 유효하지 않습니다.", code: "SIGNUP_PROOF_INVALID" } },
  })
  type("email", EMAIL)
  await click(screen.getByRole("button", { name: "인증번호 받기" }))
  await settle()
  type("code", "123456")
  await click(screen.getByRole("button", { name: "확인" }))
  await settle()
  assert.ok(screen.getByText("이메일 인증이 완료되었습니다."))
  type("nickname", NICK)
  type("birthDate", BIRTH)
  await agreeAll()
  await pressSubmit()
  assert.equal(sent("POST", COMPLETE).length, 1)
  assert.ok(screen.getByRole("button", { name: "인증번호 받기" }))
  assert.equal(screen.getByRole("alert").textContent.trim(), "이메일 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해주세요.")
})

test("A11-F-271 소셜 가입 칸에도 약관·만 14세 줄", async () => {
  await renderSocial(intentAnswer(false))
  assert.ok(screen.getByRole("group", { name: "약관 동의" }))
  assert.ok(screen.getByRole("checkbox", { name: /만 14세 이상입니다$/ }))
  assert.ok(screen.getByRole("checkbox", { name: /이용약관 동의$/ }))
})

test("A11-F-272 약관 안 고르고 보냄 → \"필수 약관에 동의해주세요.\", 요청 0번", async () => {
  await renderSocial(intentAnswer(false))
  type("nickname", NICK)
  type("birthDate", BIRTH)
  await pressSubmit()
  assert.equal(screen.getByRole("alert").textContent.trim(), "필수 약관에 동의해주세요.")
  assert.equal(sent("POST", COMPLETE).length, 0)
})

// 닉네임만 틀리게 넣고 보냄
async function badNickname(nickname, message) {
  await renderSocial(intentAnswer(false))
  type("nickname", nickname)
  type("birthDate", BIRTH)
  await agreeAll()
  await pressSubmit()
  assert.equal(screen.getByRole("alert").textContent.trim(), message)
  assert.equal(sent("POST", COMPLETE).length, 0)
}

test("A11-F-273 소셜 가입 닉네임 1자 → \"닉네임은 2~8자여야 합니다.\", 요청 0번", async () => {
  await badNickname("가", "닉네임은 2~8자여야 합니다.")
})

test("A11-F-274 소셜 가입 닉네임 \"가_나\" → 글자 종류 문구, 요청 0번", async () => {
  await badNickname("가_나", "닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.")
})
