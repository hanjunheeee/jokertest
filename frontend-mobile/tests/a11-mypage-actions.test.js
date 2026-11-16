// 모바일 마이페이지 바닥 단추 시험: "계정 관리" → /account, "프로필 수정" → 주소 ?sheet=profile-edit + 시트 열림
// 목록 A11b 모바일 A11-M-503·504 (돌리기: frontend-mobile 폴더에서 node --test tests/a11-mypage-actions.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, waitUntil } from "./a00-kit.mjs"
import { economyRoutes, fakeSocket, renderRoute, resetGame, router, serve, useAuthStore } from "./a00-game.mjs"

const { default: MyPage } = await import("@m/domains/user/pages/MyPage.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

async function openMyPage() {
    serve(economyRoutes("p0"))
    serve({ "GET /user/me/profile": { status: 200, body: { success: true, data: { nickname: "가면손님", total_games: 12, account_win_rate: 0.5, highest_win_rate_role: "의사" } } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "가면손님" } })
    view = await renderRoute(fakeSocket(), React.createElement(MyPage), { path: "/mypage", before: ["/lobby"] })
    await waitUntil(() => buttonNamed("계정 관리") !== null, { label: "마이페이지 단추" })
}

test("A11-M-503 마이페이지 '계정 관리': 누름 → /account", async () => {
    await openMyPage()
    click(buttonNamed("계정 관리"))
    await flush()
    assert.equal(router.state.location.pathname, "/account")
})

test("A11-M-504 '프로필 수정' 시트: 누름 → 주소 ?sheet=profile-edit + 시트 열림", async () => {
    await openMyPage()
    click(buttonNamed("프로필 수정"))
    await flush(5)
    assert.equal(router.state.location.pathname, "/mypage")
    assert.equal(new URLSearchParams(router.state.location.search).get("sheet"), "profile-edit")
    const sheet = document.querySelector('[role="dialog"]')
    assert.ok(sheet, "프로필 수정 시트가 안 열림")
    assert.match(sheet.textContent, /프로필/)
})
