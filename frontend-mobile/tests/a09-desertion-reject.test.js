// 모바일 방 만들기 탈주 거절 시험: "게임 만들기" → DESERTION_COOLDOWN 답 → 탈주 글이 화면에 보임
// 목록 A09 모바일 A09-M-012 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-desertion-reject.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, pageText, waitUntil } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, useAuthStore } from "./a00-game.mjs"

const { default: GameSetupPage } = await import("@m/domains/game/setup/pages/GameSetupPage.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

const COOLDOWN_TEXT = "탈주로 4분 59초 뒤에 참여할 수 있습니다."

test("A09-M-012 모바일 방 만들기 탈주 글: DESERTION_COOLDOWN 답 → 글 보임", async () => {
    const refusal = { ok: false, code: "DESERTION_COOLDOWN", message: COOLDOWN_TEXT, retryAfterMs: 299_000, blockedUntil: new Date(Date.now() + 299_000).toISOString() }
    const socket = fakeSocket({ acks: { create_room: refusal, enter_lobby: { ok: true, redirect: null } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "가람" } })
    view = await renderRoute(socket, React.createElement(GameSetupPage), { path: "/game-setup", parchment: true })
    await flush(5)
    const create = buttonNamed("게임 만들기")
    assert.ok(create, "게임 만들기 단추가 없음")
    click(create)
    await flush(5)
    assert.equal(socket.sentOf("create_room").length, 1, "create_room을 안 보냄")
    await waitUntil(() => pageText().includes(COOLDOWN_TEXT), { label: "탈주 거절 글" })
})
