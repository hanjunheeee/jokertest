// 이메일 바꾸기 상태 시험 (훅 useEmailChangeForm + useMyAccount: 빈칸·번호 받기·다시 받기 대기·번호 확인·바뀐 주소)
// 목록 A11b 화면 상태 A11-F-570~577
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { installFetch, flushUi, submitEvent } = await import("./a11Kit.mjs")
const { useEmailChangeForm } = await import("../../src/domains/user/hooks/member/useEmailChangeForm.js")
const { useMyAccount } = await import("../../src/domains/user/hooks/member/useMyAccount.js")

const ACCOUNT = "/user/me/account"
const CODE = "/user/me/email/code"
const VERIFY = "/user/me/email/verify"
const OLD_EMAIL = "old-user@example.com"
const NEW_EMAIL = "new-user@example.com"
const PW = "TestOnly-Pass-1"
const SENT = { status: 200, body: { success: true, data: { expiresInSec: 600, resendAfterSec: 60 } } }

test.afterEach(() => cleanup())

// 계정 관리 화면처럼 계정 정보 훅 + 이메일 바꾸기 훅을 같이 씀
async function mount({ codeAnswer = SENT, verifyAnswer, hasLocalPassword = true } = {}) {
  const net = installFetch({
    [`GET ${ACCOUNT}`]: { status: 200, body: { success: true, data: { email: OLD_EMAIL, hasLocalPassword } } },
    [`POST ${CODE}`]: codeAnswer,
    [`POST ${VERIFY}`]: verifyAnswer,
  })
  const hook = renderHook(() => {
    const mine = useMyAccount()
    const form = useEmailChangeForm({ account: mine.account, onChanged: mine.setEmail })
    return { mine, form }
  })
  await flushUi()
  assert.equal(hook.result.current.mine.account?.email, OLD_EMAIL, "준비: 계정 정보 받음")
  return { net, hook }
}

// 새 주소·현재 비번 넣고 번호 받기
async function sendCode(hook, { email = NEW_EMAIL, password = PW } = {}) {
  act(() => hook.result.current.form.setNewEmail(email))
  act(() => hook.result.current.form.setCurrentPassword(password))
  await act(async () => { await hook.result.current.form.sendCode(submitEvent()) })
  await flushUi()
}

// 번호 넣고 확인
async function verify(hook, code) {
  act(() => hook.result.current.form.setCode(code))
  await act(async () => { await hook.result.current.form.verifyCode(submitEvent()) })
  await flushUi()
}

test("A11-F-570 새 이메일 빈칸 → '새 이메일을 입력해주세요.', 서버 안 부름", async () => {
  const { net, hook } = await mount()
  await sendCode(hook, { email: "" })
  assert.equal(hook.result.current.form.msg?.text, "새 이메일을 입력해주세요.")
  assert.equal(net.to("POST", CODE).length, 0)
})

test("A11-F-571 비번 계정인데 현재 비번 빈칸 → '현재 비밀번호를 입력해주세요.'", async () => {
  const { net, hook } = await mount()
  await sendCode(hook, { password: "" })
  assert.equal(hook.result.current.form.msg?.text, "현재 비밀번호를 입력해주세요.")
  assert.equal(net.to("POST", CODE).length, 0)
})

test("A11-F-572 번호 받기 성공 → 번호 넣는 단계(codeSent)", async () => {
  const { net, hook } = await mount()
  await sendCode(hook)
  assert.equal(hook.result.current.form.stage, "codeSent")
  assert.deepEqual(net.to("POST", CODE)[0].body, { newEmail: NEW_EMAIL, currentPassword: PW })
})

test("A11-F-573 RESEND_TOO_SOON + resendAfterSec 42 → 문구 끝 '(42초 뒤)'", async () => {
  const { hook } = await mount({
    codeAnswer: { status: 429, body: { success: false, code: "RESEND_TOO_SOON", message: "42초 뒤에 다시 보낼 수 있습니다.", resendAfterSec: 42 } },
  })
  await sendCode(hook)
  assert.ok(hook.result.current.form.msg?.text.endsWith("(42초 뒤)"), `문구: ${hook.result.current.form.msg?.text}`)
})

test("A11-F-574 번호가 숫자 아님 → '인증번호를 숫자로 입력해주세요.', 서버 안 부름", async () => {
  const { net, hook } = await mount({ verifyAnswer: { status: 200, body: { success: true, data: { email: NEW_EMAIL } } } })
  await sendCode(hook)
  await verify(hook, "12ab56")
  assert.equal(hook.result.current.form.msg?.text, "인증번호를 숫자로 입력해주세요.")
  assert.equal(net.to("POST", VERIFY).length, 0)
})

test("A11-F-575 번호 확인 성공 → '이메일이 변경되었습니다.' + 지금 이메일이 새 값", async () => {
  const { hook } = await mount({
    verifyAnswer: { status: 200, body: { success: true, data: { email: NEW_EMAIL }, message: "이메일이 변경되었습니다." } },
  })
  await sendCode(hook)
  await verify(hook, "123456")
  assert.equal(hook.result.current.form.msg?.text, "이메일이 변경되었습니다.")
  assert.equal(hook.result.current.mine.account?.email, NEW_EMAIL)
})

test("A11-F-576 CODE_INVALID + attemptsRemaining 3 → '(남은 횟수 3)'", async () => {
  const { hook } = await mount({
    verifyAnswer: { status: 400, body: { success: false, code: "CODE_INVALID", message: "인증번호가 올바르지 않습니다.", attemptsRemaining: 3 } },
  })
  await sendCode(hook)
  await verify(hook, "000000")
  assert.match(hook.result.current.form.msg?.text ?? "", /\(남은 횟수 3\)/)
  assert.equal(hook.result.current.mine.account?.email, OLD_EMAIL)
})

test("A11-F-577 503 MAIL_SEND_FAILED → 서버 문구", async () => {
  const text = "인증번호 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요."
  const { hook } = await mount({ codeAnswer: { status: 503, body: { success: false, code: "MAIL_SEND_FAILED", message: text } } })
  await sendCode(hook)
  assert.equal(hook.result.current.form.msg?.text, text)
  assert.equal(hook.result.current.form.stage, "input")
})
