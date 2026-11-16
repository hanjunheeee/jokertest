// 일반 가입 칸 부품 시험 — 칸 구성·중복 확인 줄·인증 칸 단계와 글·가입 막힘 알림·가입 성공 뒤 로그인 칸
// 목록 A11a 화면 부품 A11-F-216~242, A11-F-276~282 (jsdom에 진짜 로그인 화면을 그려 가입 칸으로 바꿈)
import test, { mock } from "node:test"
import assert from "node:assert/strict"
import {
  h, rtl, EMAIL, PW, NICK, BIRTH, TERMS, alerts, serve, addRoutes, sent, deferred, resetAll, settle, renderRoutes,
} from "./a11Kit.mjs"

const { default: LoginPage } = await import("../../src/domains/auth/pages/LoginPage.jsx")
const { screen, fireEvent } = rtl

const CODE_PATH = "/auth/signup/email-code"
const VERIFY_PATH = "/auth/signup/email-code/verify"
const SENT_OK = { status: 200, body: { ok: true, resendAfterSec: 60, expiresInSec: 600 } }
const PROOF = "proof-시험값-form01"
const T0 = Date.UTC(2026, 10, 16, 3, 0, 0)

test.beforeEach(() => resetAll())
test.afterEach(() => {
  resetAll()
  mock.timers.reset()
})

const label = {
  email: "이메일을 입력하세요",
  // 가입 비번 칸은 규칙 안내가 붙음, 로그인 칸은 그대로 (2026-11-16 결정 다섯째 2)
  password: "비밀번호를 입력하세요 (8~64자, 영문·숫자 포함)",
  loginPassword: "비밀번호를 입력하세요",
  passwordConfirm: "비밀번호를 다시 입력하세요",
  nickname: "사용할 닉네임을 입력하세요 (2~8자, 한글/영문/숫자)",
  birthDate: "생년월일을 선택하세요",
  code: "인증번호를 입력하세요",
}
const input = (name) => screen.getByLabelText(label[name])
async function click(el) { await rtl.act(async () => { fireEvent.click(el) }) }
function type(name, value) { rtl.act(() => { fireEvent.change(input(name), { target: { value } }) }) }
const signupButton = () => screen.getByRole("button", { name: "회원가입" })
const sendButton = () => screen.getByTestId("signup-code-send")
const verifyButton = () => screen.getByRole("button", { name: "확인" })
const notice = () => screen.queryByTestId("signup-email-verification-notice")?.textContent ?? null

// 로그인 화면을 그리고 가입 칸으로 바꿈 (약관 목록은 늘 줌)
async function renderSignup(extra = {}) {
  serve({ "GET /auth/terms": { status: 200, body: { success: true, data: { terms: TERMS } } }, ...extra })
  const view = renderRoutes([
    { path: "/login", element: h(LoginPage) },
    { path: "/lobby", element: h("p", null, "로비 화면") },
  ], { at: "/login" })
  await click(screen.getByRole("button", { name: "회원가입" }))
  await settle()
  return view
}
function fillAll() {
  type("email", EMAIL)
  type("password", PW)
  type("passwordConfirm", PW)
  type("nickname", NICK)
  type("birthDate", BIRTH)
}
async function sendCode() {
  await click(sendButton())
  await settle()
}
async function verifyWith(answer) {
  addRoutes({ [`POST ${VERIFY_PATH}`]: answer })
  type("code", "123456")
  await click(verifyButton())
  await settle()
}
// 다 채우고 약관 고르고 인증까지
async function readyToSignup(extra = {}) {
  const view = await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK, ...extra })
  fillAll()
  await click(screen.getByRole("checkbox", { name: "전체 동의" }))
  await sendCode()
  await verifyWith({ status: 200, body: { ok: true, signupProof: PROOF } })
  assert.equal(notice(), "이메일 인증이 완료되었습니다.")
  return view
}
// 가입 칸 form 제출 (Enter로 보내는 길과 같음)
async function submitForm() {
  await rtl.act(async () => { fireEvent.submit(input("email").closest("form")) })
  await settle()
}

test("A11-F-216 가입 칸 구성: 이메일·중복확인·인증번호 받기·비번·비번 확인·닉네임·생일·약관 칸·가입 단추", async () => {
  await renderSignup()
  for (const name of ["email", "password", "passwordConfirm", "nickname", "birthDate"]) assert.ok(input(name))
  assert.ok(screen.getByRole("button", { name: "이메일 중복확인" }))
  assert.ok(screen.getByRole("button", { name: "인증번호 받기" }))
  assert.ok(screen.getByRole("group", { name: "약관 동의" }))
  assert.ok(signupButton())
})

test("A11-F-217 가입 비번 두 칸 다 autoComplete = new-password", async () => {
  await renderSignup()
  assert.equal(input("password").getAttribute("autocomplete"), "new-password")
  assert.equal(input("passwordConfirm").getAttribute("autocomplete"), "new-password")
})

test("A11-F-218 가입 비번 두 칸 다 보기 단추", async () => {
  await renderSignup()
  assert.equal(screen.getAllByRole("button", { name: "비밀번호 보기" }).length, 2)
})

test("A11-F-219 생일 칸은 날짜 칸 (type=date)", async () => {
  await renderSignup()
  assert.equal(input("birthDate").getAttribute("type"), "date")
})

test("A11-F-220 닉네임 칸 안내 글 \"(2~8자, 한글/영문/숫자)\"", async () => {
  await renderSignup()
  assert.ok(input("nickname").getAttribute("placeholder").includes("(2~8자, 한글/영문/숫자)"))
})

// 중복 확인 누른 뒤 결과 줄
async function checkResult(answer) {
  await renderSignup({ "GET /auth/check-email": answer })
  type("email", EMAIL)
  await click(screen.getByRole("button", { name: "이메일 중복확인" }))
  await settle()
}

test("A11-F-221 중복 확인 중 → \"이메일 확인 중...\"", async () => {
  const late = deferred()
  await renderSignup({ "GET /auth/check-email": late.promise })
  type("email", EMAIL)
  await click(screen.getByRole("button", { name: "이메일 중복확인" }))
  assert.ok(screen.getByText("이메일 확인 중..."))
  late.resolve({ status: 200, body: { success: true, data: { available: true } } })
  await settle()
})

test("A11-F-222 중복 확인 → \"사용할 수 있는 이메일입니다.\"", async () => {
  await checkResult({ status: 200, body: { success: true, data: { available: true } } })
  assert.ok(screen.getByText("사용할 수 있는 이메일입니다."))
})

test("A11-F-223 중복 확인 → \"이미 사용 중인 이메일입니다.\"", async () => {
  await checkResult({ status: 200, body: { success: true, data: { available: false } } })
  assert.ok(screen.getByText("이미 사용 중인 이메일입니다."))
})

test("A11-F-224 중복 확인 실패 → \"중복 확인에 실패했습니다. 다시 시도해주세요.\"", async () => {
  await checkResult({ status: 500, body: { success: false, message: "서버 내부에서 에러가 발생했습니다." } })
  assert.ok(screen.getByText("중복 확인에 실패했습니다. 다시 시도해주세요."))
})

test("A11-F-225 중복 확인 결과 줄 감싼 곳 aria-live=polite", async () => {
  await checkResult({ status: 200, body: { success: true, data: { available: true } } })
  assert.ok(screen.getByText("사용할 수 있는 이메일입니다.").closest("[aria-live=\"polite\"]"))
})

test("A11-F-226 \"사용할 수 있는 이메일입니다.\" 보인 뒤 이메일 한 글자 바꿈 → 그 줄 없어짐", async () => {
  await checkResult({ status: 200, body: { success: true, data: { available: true } } })
  type("email", "tester2@example.com")
  assert.equal(screen.queryByText("사용할 수 있는 이메일입니다."), null)
})

test("A11-F-227 인증 칸 처음 → \"인증번호 받기\"만, 번호 칸 없음", async () => {
  await renderSignup()
  assert.ok(screen.getByRole("button", { name: "인증번호 받기" }))
  assert.equal(screen.queryByLabelText(label.code), null)
})

test("A11-F-228 받은 뒤 → 번호 칸 + 확인 단추 + \"재발송 (60초)\" 꺼짐", async () => {
  mock.timers.enable({ apis: ["setInterval", "Date"], now: T0 })
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  assert.ok(input("code"))
  assert.ok(verifyButton())
  assert.equal(sendButton().getAttribute("aria-label"), "재발송 (60초)")
  assert.equal(sendButton().disabled, true)
})

test("A11-F-229 받은 뒤 \"남은 시간 600초\", 1초 지나 \"599초\" (가짜 시계)", async () => {
  mock.timers.enable({ apis: ["setInterval", "Date"], now: T0 })
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  assert.equal(notice(), "남은 시간 600초")
  rtl.act(() => { mock.timers.tick(1000) })
  await settle(1)
  assert.equal(notice(), "남은 시간 599초")
})

test("A11-F-230 틀린 번호 → \"인증번호가 올바르지 않습니다.\" + 남은 횟수", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  await verifyWith({ status: 400, body: { ok: false, code: "CODE_INVALID", attemptsRemaining: 4 } })
  assert.ok(notice().startsWith("인증번호가 올바르지 않습니다."))
  assert.match(notice(), /4/)
})

test("A11-F-231 만료 → \"인증번호가 만료되었습니다. 다시 받아주세요.\"", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  await verifyWith({ status: 400, body: { ok: false, code: "CODE_EXPIRED" } })
  assert.equal(notice(), "인증번호가 만료되었습니다. 다시 받아주세요.")
})

test("A11-F-232 5번 넘음 → \"오입력 횟수를 초과했습니다. 다시 받아주세요.\" + 확인 단추 꺼짐", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  await verifyWith({ status: 429, body: { ok: false, code: "TOO_MANY_ATTEMPTS" } })
  assert.equal(notice(), "오입력 횟수를 초과했습니다. 다시 받아주세요.")
  assert.equal(verifyButton().disabled, true)
})

test("A11-F-233 확인 성공 → \"이메일 인증이 완료되었습니다.\", 번호 칸 꺼짐(못 씀)", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  await verifyWith({ status: 200, body: { ok: true, signupProof: PROOF } })
  assert.equal(notice(), "이메일 인증이 완료되었습니다.")
  const codeInput = screen.queryByLabelText(label.code)
  assert.ok(codeInput === null || codeInput.disabled === true)
})

test("A11-F-234 인증 전 가입 누름 → 요청 0번 + \"이메일 인증을 완료해주세요.\" 알림", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  fillAll()
  await click(screen.getByRole("checkbox", { name: "전체 동의" }))
  // 단추는 꺼져 있음 (F-31 2-3a 버튼 비활성) → 누름 + Enter 제출 둘 다 해 봄
  assert.equal(signupButton().disabled, true)
  await click(signupButton())
  await submitForm()
  assert.equal(sent("POST", "/auth/signup").length, 0)
  assert.deepEqual(alerts, ["이메일 인증을 완료해주세요."])
})

test("A11-F-235 인증 완료 뒤 이메일 고침 → 완료 줄 없음·\"인증번호 받기\" 다시", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  await verifyWith({ status: 200, body: { ok: true, signupProof: PROOF } })
  type("email", "tester2@example.com")
  assert.equal(screen.queryByText("이메일 인증이 완료되었습니다."), null)
  assert.ok(screen.getByRole("button", { name: "인증번호 받기" }))
})

test("A11-F-236 번호 칸 → inputmode numeric·최대 6자 [지금 동작]", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  assert.equal(input("code").getAttribute("inputmode"), "numeric")
  assert.equal(input("code").getAttribute("maxlength"), "6")
})

// 인증까지 끝낸 뒤 칸 하나를 틀리게 바꿔 가입 누름 → 그 칸 문구 알림 하나, 요청 0번
async function blockedBy(changes, message, { viaForm = false } = {}) {
  await readyToSignup()
  for (const [name, value] of Object.entries(changes)) type(name, value)
  if (viaForm) await submitForm()
  else {
    await click(signupButton())
    await settle()
  }
  assert.deepEqual(alerts, [message])
  assert.equal(sent("POST", "/auth/signup").length, 0)
}

test("A11-F-237 비번 7자로 가입 → \"비밀번호는 8~64자여야 합니다.\" 알림, 요청 0번", async () => {
  await blockedBy({ password: "testpas", passwordConfirm: "testpas" }, "비밀번호는 8~64자여야 합니다.")
})
test("A11-F-238 비번 확인 다름 → \"비밀번호 확인이 일치하지 않습니다.\" 알림, 요청 0번", async () => {
  await blockedBy({ passwordConfirm: "testpass2" }, "비밀번호 확인이 일치하지 않습니다.")
})
test("A11-F-239 닉네임 9자 → \"닉네임은 2~8자여야 합니다.\" 알림, 요청 0번", async () => {
  await blockedBy({ nickname: "가나다라마바사아자" }, "닉네임은 2~8자여야 합니다.")
})
test("A11-F-240 닉네임 \"가_나\" → \"닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.\" 알림, 요청 0번", async () => {
  await blockedBy({ nickname: "가_나" }, "닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.")
})
test("A11-F-241 생일 빈 값 → \"생년월일을 입력해주세요.\" 알림, 요청 0번", async () => {
  await blockedBy({ birthDate: "" }, "생년월일을 입력해주세요.")
})
test("A11-F-242 이메일 빈 값 → \"이메일을 입력해주세요.\" 알림, 요청 0번", async () => {
  // 이메일을 비우면 인증이 풀려 단추가 꺼짐 → Enter 제출 길로 봄
  await blockedBy({ email: "" }, "이메일을 입력해주세요.", { viaForm: true })
})

test("A11-F-276 가입 이메일 칸 autoComplete = email", async () => {
  await renderSignup()
  assert.equal(input("email").getAttribute("autocomplete"), "email")
})

test("A11-F-277 이메일 빈 채 \"중복확인\" → 요청 0번, 결과 줄 없음", async () => {
  await renderSignup()
  await click(screen.getByRole("button", { name: "이메일 중복확인" }))
  await settle()
  assert.equal(sent("GET", "/auth/check-email").length, 0)
  for (const text of ["이메일 확인 중...", "사용할 수 있는 이메일입니다.", "이미 사용 중인 이메일입니다.", "중복 확인에 실패했습니다. 다시 시도해주세요."]) {
    assert.equal(screen.queryByText(text), null)
  }
})

test("A11-F-278 보내는 중 → \"발송 중...\" 단추 꺼짐", async () => {
  const late = deferred()
  await renderSignup({ [`POST ${CODE_PATH}`]: late.promise })
  type("email", EMAIL)
  await click(sendButton())
  assert.equal(sendButton().getAttribute("aria-label"), "발송 중...")
  assert.equal(sendButton().disabled, true)
  late.resolve(SENT_OK)
  await settle()
})

test("A11-F-279 다시 보내기 대기 중 → \"재발송 (N초)\" 단추 꺼짐", async () => {
  await renderSignup({ [`POST ${CODE_PATH}`]: SENT_OK })
  type("email", EMAIL)
  await sendCode()
  assert.match(sendButton().getAttribute("aria-label"), /^재발송 \(\d+초\)$/)
  assert.equal(sendButton().disabled, true)
})

test("A11-F-280 가입 성공 알림 뒤 로그인 칸 → 비번 칸이 비어 있음 [지금 동작]", async () => {
  await readyToSignup({ "POST /auth/signup": { status: 200, body: { success: true, message: "회원가입이 완료되었습니다." } } })
  await click(signupButton())
  await settle()
  assert.deepEqual(alerts, ["회원가입이 완료되었습니다! 로그인해주세요."])
  assert.ok(screen.getByRole("button", { name: "로그인" }))
  assert.equal(input("loginPassword").value, "")
})

test("A11-F-281 가입 비번 칸 안내 글에 \"8~64자, 영문·숫자 포함\"", async () => {
  await renderSignup()
  assert.equal(input("password").getAttribute("placeholder"), "비밀번호를 입력하세요 (8~64자, 영문·숫자 포함)")
})

test("A11-F-282 비번 영문만 8자로 가입 → \"비밀번호는 영문과 숫자를 모두 포함해야 합니다.\" 알림, 요청 0번", async () => {
  await blockedBy({ password: "testpass", passwordConfirm: "testpass" }, "비밀번호는 영문과 숫자를 모두 포함해야 합니다.")
})
