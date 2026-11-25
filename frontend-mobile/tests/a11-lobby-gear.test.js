// 모바일 로비 프로필 배너 시험: 톱니는 "계정 설정" 단추(누르면 계정 관리 /account), 배너 누르면 마이페이지
// 목록 A11b 모바일 A11-M-501·502, 합친 화면(2026-11-24 되돌림)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a11-lobby-gear.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, waitUntil } from "./a00-kit.mjs"
import { economyRoutes, fakeSocket, renderRoute, resetGame, router, serve, useAuthStore } from "./a00-game.mjs"

const { default: LobbyPage } = await import("@m/domains/lobby/pages/LobbyPage.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

// 로그인한 채 로비, 내 프로필 답 (서버 /user/me/profile 모양)
async function openLobby() {
    serve(economyRoutes("p0"))
    serve({ "GET /user/me/profile": { status: 200, body: { success: true, data: { nickname: "가면손님", total_games: 12, account_win_rate: 0.5, highest_win_rate_role: "의사" } } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "가면손님" } })
    view = await renderRoute(fakeSocket(), React.createElement(LobbyPage), { path: "/lobby" })
    await waitUntil(() => buttonNamed("마이페이지") !== null, { label: "프로필 배너" })
}

test("A11-M-501 모바일 로비 톱니 = '계정 설정' 단추: 배너 옆 겹친 단추, 누르면 /account", async () => {
    await openLobby()
    const gear = buttonNamed("계정 설정")
    assert.ok(gear, "톱니 단추가 없음")
    const banner = buttonNamed("마이페이지")
    assert.equal(gear.parentElement, banner.parentElement, "톱니가 배너 옆에 없음")
    assert.equal(banner.contains(gear), false, "톱니가 배너 단추 안에 있음")
    click(gear)
    await flush()
    assert.equal(router.state.location.pathname, "/account")
})

test("A11-M-502 모바일 배너 누름 → /mypage", async () => {
    await openLobby()
    click(buttonNamed("마이페이지"))
    await flush()
    assert.equal(router.state.location.pathname, "/mypage")
})
