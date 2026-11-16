// 모바일 판에서 빠졌을 때 시험: 끊김 1분이 지나 판에서 빠졌다는 답(FORFEITED) → 까닭 글 안내 + 방 목록으로
// 목록 A09 모바일 A09-M-011 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-forfeit.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { waitUntil } from "./a00-kit.mjs"
import { fakeSocket, parchmentText, renderPage, resetGame, router, seat } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

test("A09-M-011 모바일 판에서 빠졌을 때 까닭 글: FORFEITED → 알림 글 + 방 목록", async () => {
    const reason = "연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다."
    const socket = fakeSocket({ acks: { get_session_snapshot: { ok: false, code: "FORFEITED_FROM_SESSION", message: reason } } })
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", deadline: Date.now() + 60_000 })
    view = await renderPage(socket, { parchment: true })
    await waitUntil(() => router.state.location.pathname === "/multiplay", { label: "방 목록으로 이동" })
    await waitUntil(() => parchmentText() !== null, { label: "까닭 안내 창" })
    assert.ok(parchmentText().includes(reason), `안내 글: ${parchmentText()}`)
})
