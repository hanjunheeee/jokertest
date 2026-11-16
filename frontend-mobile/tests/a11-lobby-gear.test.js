// 모바일 로비 프로필 배너 시험 [버그 1]: 톱니는 장식(단추 아님, 눌러도 주소 그대로), "계정 설정" 단추 없음, 배너 누르면 마이페이지
// 목록 A11b 모바일 A11-M-501·502 (돌리기: frontend-mobile 폴더에서 node --test tests/a11-lobby-gear.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, waitUntil } from "./a00-kit.mjs"
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
// 배너 위에 겹친 톱니 그림 자리 (배너 단추 옆 형제)
function gearSpot() {
    const banner = buttonNamed("마이페이지")
    return [...banner.parentElement.children].find((el) => el !== banner) ?? null
}

test("A11-M-501 [버그 1] 모바일 로비 톱니는 장식: 톱니 그림 누름 → 주소 그대로, 톱니 자리 aria-hidden·단추 아님", async () => {
    await openLobby()
    const gear = gearSpot()
    assert.ok(gear, "톱니 자리가 없음")
    assert.equal(gear.getAttribute("aria-hidden"), "true")
    assert.notEqual(gear.tagName, "BUTTON", "톱니가 단추임")
    assert.equal(gear.querySelector("button"), null, "톱니 안에 단추가 있음")
    act(() => { gear.dispatchEvent(new window.MouseEvent("click", { bubbles: true })) })
    await flush()
    assert.equal(router.state.location.pathname, "/lobby", "톱니를 눌렀는데 주소가 바뀜")
})

test("A11-M-502 [버그 1] 모바일 '계정 설정' 단추 없음: 로비 그림 → '계정 설정' 이름 단추 0개, 배너 누름 → /mypage", async () => {
    await openLobby()
    assert.ok(!buttonNames().some((n) => n.includes("계정 설정")), `로비 단추: ${buttonNames().join(" | ")}`)
    click(buttonNamed("마이페이지"))
    await flush()
    assert.equal(router.state.location.pathname, "/mypage")
})
