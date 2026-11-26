// 모바일 비번 칸 모양·소셜 전용 계정 칸 시험: 새 비번 칸은 16px 이상 글자(app-input-text)·new-password, 현재 비번 칸 current-password, 소셜 전용은 탈퇴에 이메일 칸·이메일 바꾸기에 비번 칸 없음
// 목록 A11b 모바일 A11-M-505·506 (돌리기: frontend-mobile 폴더에서 node --test tests/a11-account-fields.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { waitUntil } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, serve, useAuthStore } from "./a00-game.mjs"

const { default: NewPasswordForm } = await import("@m/domains/auth/components/recovery/NewPasswordForm.jsx")
const { default: AccountPage } = await import("@m/domains/user/pages/AccountPage.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

const field = (name) => document.querySelector(`input[name="${name}"]`)

// 계정 관리 화면 (내 계정 답: 이메일·비번 있는 계정인지)
async function openAccount(hasLocalPassword) {
    serve({
        "GET /user/me/account": { status: 200, body: { success: true, data: { email: "m1-user@example.com", hasLocalPassword } } },
        "GET /user/me/profile": { status: 200, body: { success: true, data: { nickname: "가면손님" } } },
    })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "가면손님" } })
    view = await renderRoute(fakeSocket(), React.createElement(AccountPage), { path: "/account" })
    await waitUntil(() => !document.body.textContent.includes("불러오는 중"), { label: "내 계정 불러오기" })
}

test("A11-M-505 비번 칸 모양: 재설정 새 비번 칸 16px 이상 글자 class·new-password, 계정 관리 현재 비번 칸 current-password", async () => {
    view = render(React.createElement(NewPasswordForm, { status: "ready", password: "", setPassword: () => {}, passwordConfirm: "", setPasswordConfirm: () => {}, formError: null }))
    for (const name of ["password", "passwordConfirm"]) {
        const input = field(name)
        assert.ok(input, `재설정 ${name} 칸이 없음`)
        assert.equal(input.getAttribute("autocomplete"), "new-password")
        assert.ok(input.classList.contains("app-input-text"), `${name} 칸에 16px 이상 글자 class가 없음: ${input.className}`)
    }
    view.unmount()
    view = null
    await openAccount(true)
    const current = field("currentPassword")
    assert.ok(current, "계정 관리 현재 비번 칸이 없음")
    assert.equal(current.getAttribute("autocomplete"), "current-password")
    assert.ok(current.classList.contains("app-input-text"), `현재 비번 칸에 app-input-text가 없음: ${current.className}`)
    assert.equal(current.classList.contains("app-text-scaled"), false, `app-text-scaled가 16px 고정을 덮어씀: ${current.className}`)
})

test("A11-M-506 소셜 전용 계정 칸: hasLocalPassword false → 탈퇴는 이메일 칸, 이메일 바꾸기에 비번 칸 없음", async () => {
    await openAccount(false)
    assert.ok(field("withdrawConfirmEmail"), "탈퇴 이메일 칸이 없음")
    assert.ok(field("withdrawPassword") === null, "소셜 전용인데 탈퇴 비번 칸이 있음")
    assert.ok(field("newEmail"), "이메일 바꾸기 칸이 없음")
    assert.ok(field("emailChangePassword") === null, "소셜 전용인데 이메일 바꾸기 비번 칸이 있음")
})
