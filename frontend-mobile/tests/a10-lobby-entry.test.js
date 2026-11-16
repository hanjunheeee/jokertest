// 모바일 로비 입장 정리 시험: 로비·게임 모드·방 목록·방 설정 화면은 들어올 때 enter_lobby 한 번, 대기방·코드 입력은 안 보냄, 판으로 되돌림, 정리 답이면 방 정보 비움
// 목록 A10 모바일 A10-M-001~008 (돌리기: frontend-mobile 폴더에서 node --test tests/a10-lobby-entry.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { flush, waitUntil } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, router, useAuthStore } from "./a00-game.mjs"

const { default: LobbyPage } = await import("@m/domains/lobby/pages/LobbyPage.jsx")
const { default: GameModePage } = await import("@m/domains/game/mode/pages/GameModePage.jsx")
const { default: MultiplayEntryPage } = await import("@m/domains/game/mode/pages/MultiplayEntryPage.jsx")
const { default: GameSetupPage } = await import("@m/domains/game/setup/pages/GameSetupPage.jsx")
const { default: GameMatchingPage } = await import("@m/domains/game/matching/pages/GameMatchingPage.jsx")
const { default: RoomInvitePage } = await import("@m/domains/game/mode/pages/RoomInvitePage.jsx")
const { useMatchingStore } = await import("@/domains/game/matching/store/matchingStore.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()
})

// 로그인한 채 그 화면에 들어감 (enterLobby = enter_lobby 답)
async function open(path, Page, { enterLobby = { ok: true, redirect: null }, acks = {} } = {}) {
    const socket = fakeSocket({ acks: { enter_lobby: enterLobby, get_public_rooms: { ok: true, rooms: [] }, get_current_room: { ok: true, room: null }, ...acks } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "가람" } })
    view = await renderRoute(socket, React.createElement(Page), { path })
    await flush(5)
    return socket
}

const SENDS = [
    ["A10-M-001", "/lobby", LobbyPage],
    ["A10-M-002", "/gameMode", GameModePage],
    ["A10-M-003", "/multiplay", MultiplayEntryPage],
    ["A10-M-004", "/game-setup", GameSetupPage],
]
for (const [id, path, Page] of SENDS) {
    test(`${id} 모바일 네 화면은 들어올 때 보냄: ${path} → enter_lobby 1개`, async () => {
        const socket = await open(path, Page)
        assert.equal(socket.sentOf("enter_lobby").length, 1)
    })
}

test("A10-M-005 모바일 대기방은 안 보냄: /game-matching → enter_lobby 0개", async () => {
    const socket = await open("/game-matching", GameMatchingPage)
    assert.equal(socket.sentOf("enter_lobby").length, 0)
})

test("A10-M-006 모바일 코드 입력은 안 보냄: /roomInvite → enter_lobby 0개", async () => {
    const socket = await open("/roomInvite", RoomInvitePage)
    assert.equal(socket.sentOf("enter_lobby").length, 0)
})

test("A10-M-007 모바일 로비 → 판으로 되돌림: /lobby + 답 INGAME → 주소 /ingame", async () => {
    await open("/lobby", LobbyPage, { enterLobby: { ok: true, redirect: "INGAME", gameId: "g-m1" } })
    await waitUntil(() => router.state.location.pathname === "/ingame", { label: "판 화면으로 이동" })
})

test("A10-M-008 모바일 정리 답 → 방 정보 비움: /multiplay + 방 스토어 값 + 정리 답 → 방 스토어 빔", async () => {
    useMatchingStore.getState().setRoom({
        roomId: "room-old", roomCode: "OLD123", players: [{ uuid: "p0", nickname: "가람", isReady: false, membershipId: "m-p0" }],
        hostUuid: "p0", roomInstanceId: "inst-old", bootEpoch: "boot-old", canStart: false, accessType: "code", settingsVersion: 1,
        settings: { maxPlayers: 5, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
    })
    assert.equal(useMatchingStore.getState().roomId, "room-old", "준비: 방 스토어 값이 안 들어감")
    await open("/multiplay", MultiplayEntryPage)
    await waitUntil(() => useMatchingStore.getState().roomId === null, { label: "방 스토어 비움" })
    assert.equal(router.state.location.pathname, "/multiplay", "정리 뒤 다른 화면으로 끌려감")
})
