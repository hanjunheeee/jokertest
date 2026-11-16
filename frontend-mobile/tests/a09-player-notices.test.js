// 모바일 채팅방 알림 줄 시험: 끊기면 "연결이 끊겼습니다" 한 줄, 끊긴 사람이 탈락하면 "죽었습니다" 한 줄 더, 돌아오면 새 줄 없음, 처음 들어올 땐 옛 끊김 안 쏟아짐
// 목록 A09 모바일 A09-M-007~010 (돌리기: frontend-mobile 폴더에서 node --test tests/a09-player-notices.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { GAME, NAMES, fakeSocket, fire, renderPage, resetGame, seat, uuidOf } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 채팅방 알림 줄 글들 (말풍선 말고 시스템 줄)
const noticeLines = () => [...document.querySelectorAll("[data-talk-list] [role=log] > li")]
    .filter((li) => li.getAttribute("data-talk-line") === "system").map((li) => li.textContent.trim())

async function dayPage(options = {}) {
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", deadline: Date.now() + 60_000, ...options })
    view = await renderPage(socket)
    return socket
}
// 다른 사람 끊김·다시 붙음 알림 (서버 session_player_connection_changed 모양)
const connection = (i, isConnected) => ({ gameId: GAME, uuid: uuidOf(i), isConnected })

test("A09-M-007 끊김 채팅 줄: 연결 → 끊김 → '○○님의 연결이 끊겼습니다' 한 줄", async () => {
    const socket = await dayPage()
    assert.deepEqual(noticeLines(), [])
    await fire(socket, "session_player_connection_changed", connection(2, false))
    assert.deepEqual(noticeLines(), [`${NAMES[2]}님의 연결이 끊겼습니다`])
})

test("A09-M-008 끊긴 사람이 탈락하면 죽음 줄: 끊김 → 탈락 → '○○님이 죽었습니다' 한 줄 더", async () => {
    const socket = await dayPage()
    await fire(socket, "session_player_connection_changed", connection(3, false))
    await fire(socket, "player_eliminated", {
        gameId: GAME, phase: "DAY", dayIndex: 1,
        players: Array.from({ length: 6 }, (_, i) => ({ uuid: uuidOf(i), alive: i !== 3 })),
        victimUuid: uuidOf(3),
    })
    assert.deepEqual(noticeLines(), [`${NAMES[3]}님의 연결이 끊겼습니다`, `${NAMES[3]}님이 죽었습니다`])
})

test("A09-M-009 [지금 동작] 돌아오면 줄 없음: 끊김 → 돌아옴 → 새 줄 없음", async () => {
    const socket = await dayPage()
    await fire(socket, "session_player_connection_changed", connection(4, false))
    await fire(socket, "session_player_connection_changed", connection(4, true))
    assert.deepEqual(noticeLines(), [`${NAMES[4]}님의 연결이 끊겼습니다`])
})

test("A09-M-010 처음 들어올 때 옛 끊김이 안 쏟아짐: 이전 명단 없이 끊긴 사람 둘 → 줄 0", async () => {
    await dayPage({ disconnected: [2, 5] })
    assert.deepEqual(noticeLines(), [])
})
