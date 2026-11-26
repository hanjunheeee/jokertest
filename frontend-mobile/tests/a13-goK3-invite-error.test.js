// 모바일 대기방 친구 초대 창 실패 시험: 초대 보내기가 거절되면 줄은 "초대하기" 그대로이고 창 안에 거절 까닭 글이 뜸
// 목록 A13 모바일 A13-M-012 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-goK3-invite-error.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, useAuthStore } from "./a00-game.mjs"

const { default: GameMatchingPage } = await import("@m/domains/game/matching/pages/GameMatchingPage.jsx")
const { useMatchingStore } = await import("@/domains/game/matching/store/matchingStore.js")
const { useFriendStore } = await import("@/domains/lobby/store/friend.store.js")
const { useGameInviteStore } = await import("@/domains/lobby/store/gameInvite.store.js")

const FULL_MESSAGE = "방이 가득 차 초대할 수 없습니다."

let view = null
const friendStart = useFriendStore.getState()
const inviteStart = useGameInviteStore.getState()
afterEach(() => {
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()
    useFriendStore.setState(friendStart, true)
    useGameInviteStore.setState(inviteStart, true)
})

// 정원 6, 3명 앉은 방 (방장 가람)
const room = {
    roomId: "room-k3",
    roomCode: "KK33AA",
    players: [
        { uuid: "pA", nickname: "가람", isReady: true, membershipId: "m-pA" },
        { uuid: "pB", nickname: "나래", isReady: false, membershipId: "m-pB" },
        { uuid: "pC", nickname: "다솜", isReady: false, membershipId: "m-pC" },
    ],
    hostUuid: "pA",
    reservedHostUuid: null,
    roomInstanceId: "inst-k3",
    bootEpoch: "boot-k3",
    canStart: false,
    accessType: "open",
    settingsVersion: 1,
    settings: { maxPlayers: 6, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
}

// 대기방을 그리고 위 줄 "친구 초대"로 창을 엶 (친구 목록 받기는 요청 없이 끝나게 바꿔 둠)
async function openInviteSheet() {
    const socket = fakeSocket({ acks: { get_current_room: { ok: true, room } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "pA", nickname: "가람" } })
    useMatchingStore.getState().setRoom(room)
    view = await renderRoute(socket, React.createElement(GameMatchingPage), { path: "/game-matching" })
    await flush(10)
    const open = buttonNamed("친구 초대")
    assert.ok(open, "친구 초대 단추가 없음")
    click(open)
    await flush(5)
}

test("A13-M-012 초대 보내기가 '가득 참'으로 거절 → 줄은 '초대중'이 안 되고 '라온 게임 초대' 그대로, 창 안에 거절 까닭 글 표시", async () => {
    useFriendStore.setState({
        friends: [{ id: "f1", name: "라온", online: true }],
        friendsError: null,
        fetchFriends: async () => {},
    })
    let asked = 0
    useGameInviteStore.setState({ sendInvite: async () => { asked += 1; return { ok: false, reason: "error", message: FULL_MESSAGE } } })
    await openInviteSheet()
    const invite = buttonNamed("라온 게임 초대")
    assert.ok(invite, "라온 줄 초대 단추가 없음")
    click(invite)
    await flush(5)
    assert.equal(asked, 1, "초대를 안 보냄")
    assert.ok(buttonNamed("라온 게임 초대"), "거절됐는데 줄이 '초대중'으로 바뀜")
    assert.ok(buttonNamed("라온 초대 보내는 중") === null)
    assert.equal(textOf(document.body).includes(FULL_MESSAGE), true, "창 안에 실패 글이 안 보임")
})