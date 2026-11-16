// 관리자 로그인 화면 시험(문 2 — 아이디·비밀번호·OTP 한 화면): 세 칸·빈 칸 막기·OTP 숫자 6자리·틀림·잠김·권한 없음·세션 끝난 뒤 제자리·이메일 다름
// 목록 docs/게임_의도_2026-11-15/시험목록/A14-관리자.md A14-F-001~012, 돌리기(frontend): node --experimental-test-module-mocks --test tests/admin/a14-login-page.test.js
import test from "node:test"
import assert from "node:assert/strict"
import {
  h, screen, cleanup, openAt, type, press, settle, buttonNamed, bodyText, createFakeServer, ME_OK,
  MEMBER_UUID, detailOf, EMPTY_WALLET,
} from "./a14-kit.mjs"

const { AdminScreens } = await import("../../src/admin/app/AdminApp.jsx")

const LOGIN = "POST /admin-api/auth/login"
const NOT_SIGNED_IN = { ok: false, code: "ADMIN_LOGIN_REQUIRED", message: "로그인이 필요해요." }
// 시험용 가짜 값 (진짜 계정·번호 아님)
const FAKE = { id: "fake-admin", password: "fake-password-for-test", otp: "123456" }

test.afterEach(() => cleanup())

// 로그인 안 된 채로 /login 열기, login: 로그인 요청 답 [상태, 몸]
async function openLogin(login = null) {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 401, NOT_SIGNED_IN)
  if (login) server.answer(LOGIN, login[0], login[1])
  await openAt("/login", h(AdminScreens))
  await settle()
  return server
}

const idField = () => screen.getByLabelText("아이디")
const pwField = () => screen.getByLabelText("비밀번호")
const otpField = () => screen.getByLabelText("OTP 번호 6자리")
const loginButton = () => buttonNamed("로그인")

async function fillAll({ id = FAKE.id, password = FAKE.password, otp = FAKE.otp } = {}) {
  await type(idField(), id)
  await type(pwField(), password)
  await type(otpField(), otp)
}

// 세 칸 채우고 로그인 → 화면에 뜬 알림 글
async function loginAndReadAlert() {
  await fillAll()
  await press(loginButton())
  return screen.queryByRole("alert")?.textContent ?? ""
}

test("A14-F-001 한 화면에 세 칸: 로그인 화면 → 아이디·비밀번호·OTP 칸, 이름표 있음", async () => {
  await openLogin()
  assert.equal(idField().tagName, "INPUT")
  assert.equal(pwField().getAttribute("type"), "password")
  assert.equal(otpField().tagName, "INPUT")
  // 세 칸이 같은 폼 하나 안 (한 화면에서 한 번에 보냄)
  const form = idField().closest("form")
  assert.ok(form !== null && form === pwField().closest("form") && form === otpField().closest("form"), "세 칸이 한 폼에 없음")
})

// 빈 칸이면 로그인 단추 꺼짐 (값 3)
const EMPTY_CASES = [
  ["A14-F-002", "아이디", { id: "" }],
  ["A14-F-003", "비밀번호", { password: "" }],
  ["A14-F-004", "OTP", { otp: "" }],
]
for (const [no, name, over] of EMPTY_CASES) {
  test(`${no} 빈 칸이면 단추 꺼짐: ${name} 빔 → "로그인" 꺼짐`, async () => {
    const server = await openLogin([200, { ...ME_OK }])
    await fillAll(over)
    assert.equal(loginButton().disabled, true)
    await press(loginButton())
    assert.equal(server.calls.filter((c) => `${c.method} ${c.url}` === LOGIN).length, 0)
  })
}

test("A14-F-005 OTP는 숫자만: 글자 섞어 넣음(\"12a3b4\") → 숫자만 남음(\"1234\"), 6자리 전이라 단추 꺼짐", async () => {
  await openLogin()
  await fillAll({ otp: "12a3b4" })
  assert.equal(otpField().value, "1234")
  assert.equal(loginButton().disabled, true)
})

test("A14-F-006 OTP는 6자리까지: 7자리(\"1234567\") → \"123456\"", async () => {
  await openLogin()
  await fillAll({ otp: "1234567" })
  assert.equal(otpField().value, "123456")
  assert.equal(loginButton().disabled, false)
})

test("A14-F-007 틀림 글 하나: 401 ADMIN_LOGIN_FAILED → 맞지 않는 것이 있다는 글 (어느 칸인지 없음)", async () => {
  await openLogin([401, { ok: false, code: "ADMIN_LOGIN_FAILED", message: "" }])
  const alert = await loginAndReadAlert()
  assert.equal(alert, "아이디, 비밀번호, OTP 번호 중 맞지 않는 것이 있어요. 다시 확인해 주세요.")
  // 칸마다 틀림 표시 없음 (어느 칸이 틀렸는지 안 알려 줌)
  for (const field of [idField(), pwField(), otpField()]) assert.equal(field.getAttribute("aria-invalid"), null)
})

// 잠김 남은 분 (값 2): 남은 초 올림
const LOCK_CASES = [
  ["A14-F-008", "retryAfterSec 601", { retryAfterSec: 601 }, "11분 뒤"],
  ["A14-F-009", "값 없음", {}, "15분 뒤"],
]
for (const [no, name, extra, minutes] of LOCK_CASES) {
  test(`${no} 잠김 남은 분: 429 ADMIN_LOGIN_LOCKED ${name} → "${minutes}"`, async () => {
    await openLogin([429, { ok: false, code: "ADMIN_LOGIN_LOCKED", message: "", ...extra }])
    const alert = await loginAndReadAlert()
    assert.ok(alert.includes(minutes), `잠김 글에 "${minutes}" 없음: ${alert}`)
  })
}

test("A14-F-010 Access 없음이면 로그인 칸도 없음: 403 ADMIN_ACCESS_REQUIRED → 권한 없음 화면, 입력 칸 0개", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 403, { ok: false, code: "ADMIN_ACCESS_REQUIRED", message: "" })
  await openAt("/login", h(AdminScreens))
  await settle()
  assert.ok(screen.queryByRole("heading", { name: "접근 권한 없음" }) !== null, "권한 없음 화면이 아님")
  assert.equal(document.querySelectorAll("input, textarea, select").length, 0)
  assert.ok(loginButton() === null, "로그인 단추가 있음")
})

test("A14-F-011 세션 끝나면 로그인으로, 다시 원래 자리: 회원 상세 보던 중 401 → 로그인 → 같은 회원 상세", async () => {
  const server = createFakeServer()
  server.answer("GET /admin-api/auth/me", 200, ME_OK)
  let expired = true
  server.answerWith(`GET /admin-api/members/${MEMBER_UUID}`, () => (expired
    ? { status: 401, body: { ok: false, code: "ADMIN_SESSION_EXPIRED", message: "" } }
    : { status: 200, body: detailOf() }))
  server.answer(`GET /admin-api/members/${MEMBER_UUID}/wallet`, 200, EMPTY_WALLET)
  server.answer(LOGIN, 200, ME_OK)
  await openAt(`/members/${MEMBER_UUID}`, h(AdminScreens))
  await settle(20)
  // 로그인 화면 + 자동 로그아웃 안내
  assert.ok(screen.queryByRole("heading", { name: "관리자 로그인" }) !== null, "로그인 화면으로 안 감")
  assert.ok(bodyText().includes("오래 쓰지 않아 로그아웃됐어요."), "자동 로그아웃 안내 없음")
  expired = false
  await fillAll()
  await press(loginButton())
  await settle(20)
  // 같은 회원 상세로 돌아옴 (닉네임 제목)
  assert.ok(screen.queryByRole("heading", { level: 1, name: "가면1" }) !== null, "원래 회원 상세로 안 돌아옴")
  const detailCalls = server.calls.filter((c) => c.method === "GET" && c.url === `/admin-api/members/${MEMBER_UUID}`)
  assert.equal(detailCalls.length, 2)
})

test("A14-F-012 이메일 다름 글: 403 ADMIN_EMAIL_MISMATCH → 본인 계정으로 로그인하라는 글", async () => {
  await openLogin([403, { ok: false, code: "ADMIN_EMAIL_MISMATCH", message: "" }])
  const alert = await loginAndReadAlert()
  assert.equal(alert, "관리자 메일 확인에 쓴 메일과 이 계정의 메일이 달라요. 본인 계정으로 로그인해 주세요.")
  // 이메일 다름은 권한 없음 화면으로 안 바뀜 (로그인 칸 그대로)
  assert.ok(loginButton() !== null, "로그인 화면이 사라짐")
})
