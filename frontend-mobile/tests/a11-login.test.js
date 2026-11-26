// 모바일 로그인·가입 화면 시험: 소셜 시작 주소(client=mobile), 소셜 실패 줄, 가입 막힘은 양피지 창, 비번 칸 자동완성, 인증 칸 오류 줄
// 목록 A11a 모바일 A11-M-001~006 (돌리기: frontend-mobile 폴더에서 node --test tests/a11-login.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf, typeInto, waitUntil } from "./a00-kit.mjs"
import { fakeLocation, fakeSocket, parchmentText, renderRoute, resetGame, serve } from "./a00-game.mjs"

const { default: SocialButtons } = await import("@m/domains/auth/components/login/SocialButtons.jsx")
const { default: LoginPage } = await import("@m/domains/auth/pages/LoginPage.jsx")
const { resolveSocialLoginView } = await import("@/domains/auth/utils/socialErrors.js")

let view = null
afterEach(() => { resetGame(view); view = null })

// 가입 이메일 인증 길 (서버 답 모양은 PC 시험 a11-auth와 같음)
const SEND = "POST /auth/signup/email-code"
const VERIFY = "POST /auth/signup/email-code/verify"

// 로그인 화면을 그 주소로 그림 (alert는 앱처럼 양피지 안내 창으로)
async function openLogin(path = "/login") {
    serve({ "GET /auth/terms": { status: 200, body: { success: true, data: { terms: [] } } } })
    view = await renderRoute(fakeSocket(), React.createElement(LoginPage), { path, parchment: true })
    await flush(5)
}
const field = (name) => document.querySelector(`input[name="${name}"]`)

// 가입 칸으로 바꾸고 칸 채우기
async function toSignupForm(values) {
    click(buttonNamed("회원가입"))
    await flush()
    for (const [name, value] of Object.entries(values)) {
        assert.ok(field(name), `${name} 칸이 없음`)
        typeInto(field(name), value)
    }
}
// 인증번호 받기 → 번호 넣기 → 확인
async function verifyEmail(code) {
    click(document.querySelector('[data-testid="signup-code-send"]'))
    await flush(5)
    const input = document.querySelector('[data-testid="signup-code-input"]') ?? field("signupEmailCode")
    assert.ok(input, "인증번호 칸이 안 열림")
    typeInto(input, code)
    click(document.querySelector('[data-testid="signup-code-verify"]'))
    await flush(5)
}

for (const [id, provider, label, remember] of [["A11-M-001", "google", "Google 로그인", true], ["A11-M-002", "discord", "Discord 로그인", false]]) {
    test(`${id} 모바일 소셜 시작 주소: ${provider} (유지 ${remember ? "켬" : "끔"}) → …/auth/${provider}?rememberMe=${remember}&client=mobile`, () => {
        const location = fakeLocation("/login")
        view = render(React.createElement(SocialButtons, { rememberMe: remember }))
        click(buttonNamed(label))
        assert.equal(location.assigned.length, 1, "페이지 이동이 안 일어남")
        assert.match(location.assigned[0], new RegExp(`/auth/${provider}\\?rememberMe=${remember}&client=mobile$`))
    })
}

test("A11-M-003 모바일 소셜 실패 줄: /login?socialError=EMAIL_CONFLICT → role=alert 줄에 PC와 같은 문구", async () => {
    await openLogin("/login?socialError=EMAIL_CONFLICT")
    const expected = resolveSocialLoginView({ socialIntent: null, socialError: "EMAIL_CONFLICT" }).message
    assert.ok(typeof expected === "string" && expected.length > 0, "PC 문구를 못 얻음")
    const alerts = [...document.querySelectorAll('[role="alert"]')].map(textOf)
    assert.ok(alerts.includes(expected), `알림 줄: ${JSON.stringify(alerts)} / PC: ${expected}`)
})

test("A11-M-004 모바일 가입 막힘은 양피지 창: 비번 7자로 가입 → 브라우저 알림 대신 양피지 창에 '비밀번호는 8~64자여야 합니다.'", async () => {
    serve({
        [SEND]: { status: 200, body: { ok: true, resendAfterSec: 60, expiresInSec: 600 } },
        [VERIFY]: { status: 200, body: { ok: true, signupProof: "proof-m1" } },
    })
    await openLogin()
    await toSignupForm({ email: "m1-test@example.com", password: "abc1234", passwordConfirm: "abc1234", nickname: "모바일", birthDate: "2000-01-01" })
    await verifyEmail("123456")
    const submit = buttonNamed("회원가입", document.querySelector('[aria-label="회원가입 입력"]'))
    assert.ok(submit, "가입 단추가 없음")
    assert.equal(submit.disabled, false, "인증 뒤에도 가입 단추가 잠김")
    click(submit)
    await waitUntil(() => parchmentText() !== null, { label: "양피지 안내 창" })
    assert.ok(parchmentText().includes("비밀번호는 8~64자여야 합니다."), `안내 창 글: ${parchmentText()}`)
})

test("A11-M-005 모바일 비번 칸 autoComplete: 로그인 current-password / 가입 두 칸 new-password", async () => {
    await openLogin()
    assert.equal(field("password").getAttribute("autocomplete"), "current-password")
    click(buttonNamed("회원가입"))
    await flush()
    assert.equal(field("password").getAttribute("autocomplete"), "new-password")
    assert.equal(field("passwordConfirm").getAttribute("autocomplete"), "new-password")
})

test("A11-M-006 모바일 인증 칸 오류 줄: 틀린 번호 → 인증 칸 아래 '인증번호가 올바르지 않습니다.' + 남은 횟수", async () => {
    serve({
        [SEND]: { status: 200, body: { ok: true, resendAfterSec: 60, expiresInSec: 600 } },
        [VERIFY]: { status: 400, body: { ok: false, code: "CODE_INVALID", attemptsRemaining: 3 } },
    })
    await openLogin()
    await toSignupForm({ email: "m1-test@example.com" })
    await verifyEmail("000000")
    const notice = document.querySelector('[data-testid="signup-email-verification-notice"]')
    assert.ok(notice, "인증 안내 줄이 없음")
    assert.ok(textOf(notice).includes("인증번호가 올바르지 않습니다."), `안내 줄: ${textOf(notice)}`)
    assert.match(textOf(notice), /3/, "남은 횟수가 없음")
    // 인증 칸보다 아래
    const input = document.querySelector('[data-testid="signup-code-input"]') ?? field("signupEmailCode")
    assert.ok(input.compareDocumentPosition(notice) & window.Node.DOCUMENT_POSITION_FOLLOWING, "안내 줄이 인증 칸 위에 있음")
})

test("A11-M-007 모바일 가입 인증번호 칸 6자리 제한: signup-code-input maxLength가 6", async () => {
    serve({
        [SEND]: { status: 200, body: { ok: true, resendAfterSec: 60, expiresInSec: 600 } },
    })
    await openLogin()
    await toSignupForm({ email: "m1-limit@example.com" })
    click(document.querySelector('[data-testid="signup-code-send"]'))
    await flush(5)
    const input = document.querySelector('[data-testid="signup-code-input"]') ?? field("signupEmailCode")
    assert.ok(input, "인증번호 칸이 안 열림")
    assert.equal(input.getAttribute("maxlength"), "6")
})
