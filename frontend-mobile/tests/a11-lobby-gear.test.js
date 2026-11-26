// 모바일 로비 프로필 배너 시험: 톱니는 장식(눌러도 /lobby 그대로, "계정 설정" 단추 없음), 배너 누르면 마이페이지
// 목록 A11b 모바일 A11-M-501·502 (돌리기: frontend-mobile 폴더에서 node --test --test-concurrency=1 tests/a11-lobby-gear.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, waitUntil } from "./a00-kit.mjs"
import { economyRoutes, fakeSocket, renderRoute, resetGame, router, serve, useAuthStore } from "./a00-game.mjs"

const { default: LobbyPage } = await import("@m/domains/lobby/pages/LobbyPage.jsx")
const GEAR_SRC = encodeURI("/button/설정톱니바퀴.webp".normalize("NFC"))

let view = null
afterEach(() => { resetGame(view); view = null })

// 로그인한 채 로비 열기
async function openLobby() {
    serve(economyRoutes("p0"))
    serve({ "GET /user/me/profile": { status: 200, body: { success: true, data: { nickname: "가면손님", total_games: 12, account_win_rate: 0.5, highest_win_rate_role: "의사" } } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "가면손님" } })
    view = await renderRoute(fakeSocket(), React.createElement(LobbyPage), { path: "/lobby" })
    await waitUntil(() => buttonNamed("마이페이지") !== null, { label: "프로필 배너" })
}

test("A11-M-501 모바일 로비 톱니 = 순수 장식: '계정 설정' 단추 0개, aria-hidden span, 눌러도 /lobby 그대로", async () => {
    await openLobby()
    assert.equal(buttonNamed("계정 설정"), null, "계정 설정 단추가 남아 있음")
    const banner = buttonNamed("마이페이지")
    const gearImg = document.querySelector(`img[src="${GEAR_SRC}"]`)
    assert.ok(gearImg, "톱니 장식 그림이 없음")
    const gearWrap = gearImg.parentElement
    assert.equal(gearWrap.tagName, "SPAN")
    assert.equal(gearWrap.getAttribute("aria-hidden"), "true")
    assert.equal(banner.contains(gearWrap), false, "톱니가 배너 단추 안에 들어가 누름이 번짐")
    click(gearImg)
    await flush()
    assert.equal(router.state.location.pathname, "/lobby")
})

test("A11-M-502 모바일 배너 누름 → /mypage", async () => {
    await openLobby()
    click(buttonNamed("마이페이지"))
    await flush()
    assert.equal(router.state.location.pathname, "/mypage")
})
