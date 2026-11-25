// 모바일 계정 관리 "비밀번호 변경" 칸 시험: 소셜로만 가입한 계정도 칸 그대로(안내 글 없음), 비번 계정엔 새 비밀번호 확인 칸
// 목록 A11b 모바일 A11-M-507·508 (돌리기: frontend-mobile 폴더에서 node --test tests/a11e-password-section.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { waitUntil } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, serve, useAuthStore } from "./a00-game.mjs"

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

test("A11-M-507 모바일 소셜로만 가입한 계정 → 비번 바꾸기 세 칸이 그대로 보임 (소셜 안내 글은 없음)", async () => {
    await openAccount(false)
    for (const name of ["currentPassword", "newPassword", "newPasswordConfirm"]) {
        assert.ok(field(name), `${name} 칸이 없음`)
    }
    assert.ok(!document.body.textContent.includes("소셜 로그인 계정은 비밀번호가 없습니다."), "소셜 안내 글이 보임")
})

test("A11-M-508 모바일 비번 계정 → 새 비밀번호 확인 칸(new-password)이 있고 안내 글 없음", async () => {
    await openAccount(true)
    const confirm = field("newPasswordConfirm")
    assert.ok(confirm, "새 비밀번호 확인 칸이 없음")
    assert.equal(confirm.getAttribute("autocomplete"), "new-password")
    assert.equal(confirm.getAttribute("type"), "password")
    assert.ok(!document.body.textContent.includes("소셜 로그인 계정은 비밀번호가 없습니다."), "비번 계정인데 소셜 안내 글이 보임")
})
