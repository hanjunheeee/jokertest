// 가입 이메일 중복 확인을 너무 많이 눌러 서버가 429로 답할 때 서버 글이 보이는지 시험 (그 밖 실패는 그대로 "중복 확인에 실패했습니다.")
// 목록 A11a 화면 상태 A11-F-102~104, 화면 부품 A11-F-283·930
import test from "node:test"
import assert from "node:assert/strict"
import { h, rtl, EMAIL, serve, resetAll } from "./a11Kit.mjs"

const { useEmailCheck } = await import("../../src/domains/auth/hooks/login/useEmailCheck.js")
const { default: SignupFields } = await import("../../src/domains/auth/components/SignupForm/SignupFields.jsx")

const CHECK = "/auth/check-email"
const SERVER_TEXT = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
const FAILED_TEXT = "중복 확인에 실패했습니다. 다시 시도해주세요."

test.beforeEach(() => resetAll())
test.afterEach(() => resetAll())

async function checkWith(answer) {
  serve({ [`GET ${CHECK}`]: answer })
  const hook = rtl.renderHook(() => useEmailCheck(EMAIL))
  await rtl.act(async () => { await hook.result.current.check() })
  return hook.result.current
}

test("A11-F-102 중복 확인 429 + 서버 글 → 실패 상태, 보일 글 = 서버 글", async () => {
  const text = "시험용 서버 글: 잠시 뒤 다시"
  const r = await checkWith({ status: 429, body: { ok: false, code: "RATE_LIMITED", message: text } })
  assert.equal(r.status, "error")
  assert.equal(r.errorMessage, text)
})

test("A11-F-103 중복 확인 429 글 없음 → 보일 글 = \"요청이 너무 많습니다. 잠시 후 다시 시도해주세요.\"", async () => {
  const r = await checkWith({ status: 429, body: { ok: false, code: "RATE_LIMITED" } })
  assert.equal(r.status, "error")
  assert.equal(r.errorMessage, SERVER_TEXT)
})

test("A11-F-104 중복 확인 500 → 실패 상태, 따로 보일 글 없음(화면 기본 실패 글)", async () => {
  const r = await checkWith({ status: 500, body: { success: false, message: "내부 글" } })
  assert.equal(r.status, "error")
  assert.equal(r.errorMessage, null)
})

// 가입 칸을 그리고 이메일을 넣은 채 "이메일 중복확인"을 누름
async function clickCheck(answer) {
  serve({ [`GET ${CHECK}`]: answer })
  rtl.render(h(SignupFields, { formData: { email: EMAIL, password: "", passwordConfirm: "", nickname: "", birthDate: "" }, handleInputChange: () => {} }))
  await rtl.act(async () => { rtl.fireEvent.click(rtl.screen.getByRole("button", { name: "이메일 중복확인" })) })
  await rtl.act(async () => { await new Promise((resolve) => setImmediate(resolve)) })
}

test("A11-F-283 가입 칸 중복 확인 429 → 결과 줄에 서버 글, 500이면 그대로 실패 글", async () => {
  await clickCheck({ status: 429, body: { ok: false, code: "RATE_LIMITED", message: SERVER_TEXT } })
  assert.ok(rtl.screen.getByText(SERVER_TEXT))
  assert.equal(rtl.screen.queryByText(FAILED_TEXT), null)
  rtl.cleanup()
  await clickCheck({ status: 500, body: {} })
  assert.ok(rtl.screen.getByText(FAILED_TEXT))
})

test("A11-F-930 가입 칸 중복 확인 429 긴 글 → 결과 줄이 한 줄 고정 아님 (고정이면 앞부분이 단추 밑에 숨음)", async () => {
  await clickCheck({ status: 429, body: { ok: false, code: "RATE_LIMITED", message: SERVER_TEXT } })
  const line = rtl.screen.getByText(SERVER_TEXT)
  // 줄 바꿈 막기·줄어들기 막기가 있으면 칸보다 긴 글이 왼쪽(단추 쪽)으로 삐져나감
  assert.doesNotMatch(line.className, /whitespace-nowrap|shrink-0/)
})
