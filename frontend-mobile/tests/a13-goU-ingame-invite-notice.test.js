// 모바일 판 화면 초대 안내 시험: 판 화면·로비 어디서 초대를 받아도 판 화면 안내 줄은 없고 초대는 받은 초대 목록(스토어)에만 (합친 화면: 판 화면 초대 안내 없앰)
// 목록 A13-M-509·511·512, 합친 화면(2026-11-24 되돌림)에 맞춤 (docs/게임_의도_2026-11-15/시험목록/A13-친구-알림-초대.md), 결정 2026-11-16 낮 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-goU-ingame-invite-notice.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { flush } from "./a00-kit.mjs"
import { fakeSocket, renderPage, renderRoute, resetGame, seat, uuidOf } from "./a00-game.mjs"

const { useGameInviteStore } = await import("@/domains/lobby/store/gameInvite.store.js")
const { default: LobbyPage } = await import("@m/domains/lobby/pages/LobbyPage.jsx")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    useGameInviteStore.getState().__resetForTests()
})

// 서버가 보내는 초대 줄 (받는 사람 = 나)
function inviteRow(receiverId, { id = "inv-1", senderName = "민수", revision = 1, seq = "5" } = {}) {
    return {
        inviteId: id, senderId: `s-${id}`, senderName, receiverId, status: "PENDING", revision, creationSeq: seq,
        createdAt: "2026-11-16T00:00:00.000Z", expiresAt: new Date(Date.now() + 180_000).toISOString(),
        decidedAt: null, endReason: null, entryOutcome: null,
    }
}

// 초대 스토어를 내 계정으로 맞추고 목록을 받은 것으로 둠 (앱이 붙자마자 하는 일)
function inviteStoreReady(invites = []) {
    useGameInviteStore.getState().syncAccount()
    useGameInviteStore.setState({ snapshotLoaded: true, status: "ready", invites, restorePending: false })
}

// 소켓 game_invite_received가 오면 앱이 하는 일 (friendSocket handlers.inviteReceived의 목록 넣기)
async function inviteArrives(receiverId, invite) {
    act(() => {
        useGameInviteStore.getState().receiveLiveInvite(receiverId, invite, { kind: "game-invite", eventId: `game-invite:${invite.inviteId}:received`, accountId: receiverId, origin: "live" })
    })
    await flush()
}

// 죽은 나(첫 자리)로 낮 판 화면
async function deadOnInGame({ before = [] } = {}) {
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", dead: [0] })
    inviteStoreReady(before)
    view = await renderPage(fakeSocket())
    return uuidOf(0)
}

const noticeBoxes = () => [...document.querySelectorAll("[data-ingame-invite-notice]")]

test("A13-M-509 모바일 판 화면에서 초대 사건 → 판 화면 안내 줄 없음, 초대는 받은 초대 목록(스토어)에만", async () => {
    const me = await deadOnInGame()
    await inviteArrives(me, inviteRow(me))
    assert.equal(noticeBoxes().length, 0)
    assert.equal(document.body.textContent.includes("로비로 가면 수락"), false)
    assert.deepEqual(useGameInviteStore.getState().invites.map((i) => i.inviteId), ["inv-1"])
})

test("A13-M-511 모바일 판 화면 오기 전부터 있던 초대 → 안내 없음", async () => {
    const me = uuidOf(0)
    await deadOnInGame({ before: [inviteRow(me, { id: "old-1", seq: "3" })] })
    assert.equal(noticeBoxes().length, 0)
})

test("A13-M-512 모바일 로비 화면에서 초대 사건 → 판 화면 안내 없음, 초대는 받은 초대 목록(스토어)에만", async () => {
    seat({ n: 6 })
    const me = uuidOf(0)
    inviteStoreReady()
    view = await renderRoute(fakeSocket(), React.createElement(LobbyPage), { path: "/lobby" })
    await inviteArrives(me, inviteRow(me))
    assert.equal(noticeBoxes().length, 0)
    assert.equal(document.body.textContent.includes("로비로 가면 수락"), false)
    assert.deepEqual(useGameInviteStore.getState().invites.map((i) => i.inviteId), ["inv-1"])
})
