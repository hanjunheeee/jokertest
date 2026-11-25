// 모바일 계정 관리 비밀번호 바꾸기 시험(합친 화면 + 확인 칸): 새 비번과 확인 칸이 다르면 안 보내고 글, 같으면 PATCH /user/me/password 한 번(확인 칸 값은 안 보냄)
// 목록 A11 모바일 A11-M-601~602, 2026-11-24 되돌린 화면(baa5c898) + 새 비밀번호 확인 칸(newPasswordConfirm)에 맞춘 새 시험 (돌리기: frontend-mobile 폴더에서 node --test tests/a11-m6-password-change.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { flush, typeInto, waitUntil } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, sentHttp, serve, useAuthStore } from "./a00-game.mjs"

const { default: AccountPage } = await import("@m/domains/user/pages/AccountPage.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

const field = (name) => document.querySelector(`input[name="${name}"]`)

// 비번 있는 계정으로 계정 관리 화면 (비번 바꾸기 답은 성공, 다시 로그인은 안 하라고 함)
async function openAccount() {
    serve({
        "GET /user/me/account": { status: 200, body: { success: true, data: { email: "m6-user@example.com", hasLocalPassword: true } } },
        "GET /user/me/profile": { status: 200, body: { success: true, data: { nickname: "가면손님" } } },
        "PATCH /user/me/password": { status: 200, body: { success: true, data: { reloginRequired: false } } },
    })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "가면손님" } })
    view = await renderRoute(fakeSocket(), React.createElement(AccountPage), { path: "/account" })
    await waitUntil(() => !document.body.textContent.includes("불러오는 중"), { label: "내 계정 불러오기" })
}

// 세 칸을 채우고 비밀번호 칸 폼을 보냄
async function submitPassword({ current, next, confirm }) {
    typeInto(field("currentPassword"), current)
    typeInto(field("newPassword"), next)
    typeInto(field("newPasswordConfirm"), confirm)
    const form = field("newPasswordConfirm").closest("form")
    await act(async () => { form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })) })
    await flush(5)
}

test("A11-M-601 새 비번 'abcd1234'·확인 'abcd1235'(다름) → PATCH 0번, '비밀번호 확인이 일치하지 않습니다.'", async () => {
    await openAccount()
    await submitPassword({ current: "oldpass12", next: "abcd1234", confirm: "abcd1235" })
    assert.equal(sentHttp("PATCH", "/user/me/password").length, 0, "확인 칸이 다른데 보냄")
    assert.ok(document.body.textContent.includes("비밀번호 확인이 일치하지 않습니다."), "다름 안내 글이 없음")
})

test("A11-M-602 새 비번·확인 칸이 같음 → PATCH /user/me/password 1번 {currentPassword, newPassword}만, 성공 글·칸 비움", async () => {
    await openAccount()
    await submitPassword({ current: "oldpass12", next: "abcd1234", confirm: "abcd1234" })
    const sent = sentHttp("PATCH", "/user/me/password")
    assert.equal(sent.length, 1)
    assert.deepEqual(sent[0].body, { currentPassword: "oldpass12", newPassword: "abcd1234" })
    assert.ok(document.body.textContent.includes("비밀번호가 변경되었습니다."), "성공 글이 없음")
    assert.equal(field("newPasswordConfirm").value, "")
})
