// 모바일 방 들어가기 시험(합친 화면): 방 목록 고르기·입장(공개 방·코드 방), 코드로 참가(성공·실패 양피지 알림), 방 만들기 성공 → 대기방
// 목록 A01 모바일 A01-M-612~617, 2026-11-24 되돌린 화면(baa5c898)에 맞춘 새 시험 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-m6-room-entry.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, typeInto, waitUntil } from "./a00-kit.mjs"
import { fakeSocket, parchmentText, renderRoute, resetGame, router, useAuthStore } from "./a00-game.mjs"

const { default: MultiplayEntryPage } = await import("@m/domains/game/mode/pages/MultiplayEntryPage.jsx")
const { default: RoomInvitePage } = await import("@m/domains/game/mode/pages/RoomInvitePage.jsx")
const { default: GameSetupPage } = await import("@m/domains/game/setup/pages/GameSetupPage.jsx")
const { useMatchingStore } = await import("@/domains/game/matching/store/matchingStore.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()
})

// 목록에 오는 방 한 개 (서버 get_public_rooms 한 줄 모양)
function listRoom(extra = {}) {
    return { id: "r1", stage: 1, current: 3, max: 8, title: "가람의 방", accessType: "public", status: "waiting", settings: {}, ...extra }
}
// 들어간 방 (room_joined·create_room 답 모양)
function joinedRoom(roomId = "r1") {
    return {
        roomId, roomCode: "AB12CD",
        players: [
            { uuid: "pA", nickname: "가람", isReady: false, membershipId: "m-pA" },
            { uuid: "p0", nickname: "나", isReady: false, membershipId: "m-p0" },
        ],
        hostUuid: "pA", reservedHostUuid: null, roomInstanceId: "inst-1", bootEpoch: "boot-1", canStart: false,
        accessType: "open", settingsVersion: 1,
        settings: { maxPlayers: 8, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
    }
}

// 로그인한 채 그 화면 (로비 입장 정리·방 묻기는 "남은 것 없음"으로 답)
async function open(Page, path, acks = {}, options = {}) {
    const socket = fakeSocket({ acks: { enter_lobby: { ok: true, redirect: null }, get_current_room: { ok: true, room: null }, ...acks } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: "나" } })
    view = await renderRoute(socket, React.createElement(Page), { path, ...options })
    await flush(8)
    return socket
}
const elsewhere = () => document.querySelector("[data-elsewhere]")?.getAttribute("data-elsewhere") ?? null
const card = (title) => [...document.querySelectorAll("li > button[aria-pressed]")].find((b) => b.getAttribute("aria-label").includes(title)) ?? null

test("A01-M-612 방 목록: 공개 방 카드 고름 → '선택한 방 입장' 켜짐 → 누르면 join_public_room {roomId}·'입장 중', room_joined 오면 대기방(/game-matching)", async () => {
    const socket = await open(MultiplayEntryPage, "/multiplay", { get_public_rooms: { ok: true, rooms: [listRoom(), listRoom({ id: "r2", title: "나래의 방" })] } })
    assert.ok(card("가람의 방") && card("나래의 방"), `카드: ${buttonNames().join(" | ")}`)
    const enter = () => document.querySelector('button[aria-label="선택한 방 입장"]') ?? buttonNamed("입장 중")
    assert.equal(enter().disabled, true, "고르기 전인데 입장 단추가 켜짐")
    click(card("가람의 방"))
    await flush(2)
    assert.equal(card("가람의 방").getAttribute("aria-pressed"), "true")
    assert.equal(enter().disabled, false)
    click(enter())
    await flush(3)
    assert.deepEqual(socket.sentOf("join_public_room"), [{ roomId: "r1" }])
    assert.ok(buttonNamed("입장 중"), `단추: ${buttonNames().join(" | ")}`)
    await act(async () => { socket.fire("room_joined", joinedRoom("r1")) })
    await flush(5)
    await waitUntil(() => elsewhere() === "/game-matching", { label: "대기방으로 이동" })
    assert.equal(useMatchingStore.getState().roomId, "r1")
})

test("A01-M-613 방 목록: 코드 방 카드 고름 → 단추 '코드 입력' → 누르면 코드 입력 화면(/roomInvite), 방에 들어가기 요청은 안 보냄", async () => {
    const socket = await open(MultiplayEntryPage, "/multiplay", { get_public_rooms: { ok: true, rooms: [listRoom({ accessType: "code", title: "코드 방" })] } })
    click(card("코드 방"))
    await flush(2)
    const enter = buttonNamed("코드 입력")
    assert.ok(enter, `단추: ${buttonNames().join(" | ")}`)
    click(enter)
    await flush(3)
    assert.equal(elsewhere(), "/roomInvite")
    assert.deepEqual(router.state.location.state, { roomId: "r1" })
    assert.equal(socket.sentOf("join_public_room").length, 0)
})

test("A01-M-614 방 목록 위 줄: '방 만들기' → /game-setup, '코드로 참가' → /roomInvite", async () => {
    await open(MultiplayEntryPage, "/multiplay", { get_public_rooms: { ok: true, rooms: [] } })
    click(buttonNamed("방 만들기"))
    await flush(3)
    assert.equal(elsewhere(), "/game-setup")
    await act(async () => { await router.navigate("/multiplay") })
    await flush(5)
    click(buttonNamed("코드로 참가"))
    await flush(3)
    assert.equal(elsewhere(), "/roomInvite")
})

test("A01-M-615 코드로 참가: 'ab12cd' 입력 → '참여하기' → join_room_by_code {roomCode:'AB12CD'}, room_joined 오면 대기방", async () => {
    const socket = await open(RoomInvitePage, "/roomInvite")
    const input = document.querySelector('input[aria-label="방 코드 6자리"]')
    assert.ok(input, "코드 칸이 없음")
    // 다섯 자리면 안 보냄
    typeInto(input, "ab12c")
    click(buttonNamed("참여하기"))
    await flush(2)
    assert.equal(socket.sentOf("join_room_by_code").length, 0, "다섯 자리인데 보냄")
    typeInto(input, "ab12cd")
    click(buttonNamed("참여하기"))
    await flush(3)
    assert.deepEqual(socket.sentOf("join_room_by_code"), [{ roomCode: "AB12CD" }])
    await act(async () => { socket.fire("room_joined", joinedRoom("r9")) })
    await flush(5)
    await waitUntil(() => elsewhere() === "/game-matching", { label: "대기방으로 이동" })
    assert.equal(useMatchingStore.getState().roomId, "r9")
})

test("A01-M-616 코드로 참가 실패: room_join_failed(서버 글) → 양피지 알림 창에 그 글, 화면은 코드 입력 그대로", async () => {
    const socket = await open(RoomInvitePage, "/roomInvite", {}, { parchment: true })
    typeInto(document.querySelector('input[aria-label="방 코드 6자리"]'), "zz99zz")
    click(buttonNamed("참여하기"))
    await flush(3)
    assert.equal(socket.sentOf("join_room_by_code").length, 1)
    await act(async () => { socket.fire("room_join_failed", { code: "M6_TEST_REFUSED", message: "시험용 거절 글입니다." }) })
    await flush(3)
    assert.equal(parchmentText()?.includes("시험용 거절 글입니다."), true, `알림: ${parchmentText()}`)
    assert.equal(elsewhere(), null)
    assert.equal(router.state.location.pathname, "/roomInvite")
})

test("A01-M-617 방 만들기: '게임 만들기' → create_room 1번, 답 {ok, room} → 대기방(/game-matching), 방 값 들어감", async () => {
    const socket = await open(GameSetupPage, "/game-setup", { create_room: { ok: true, room: joinedRoom("r-new") } })
    const create = buttonNamed("게임 만들기")
    assert.ok(create, `단추: ${buttonNames().join(" | ")}`)
    click(create)
    await flush(5)
    assert.equal(socket.sentOf("create_room").length, 1)
    assert.equal(typeof socket.sentOf("create_room")[0], "object")
    await waitUntil(() => elsewhere() === "/game-matching", { label: "대기방으로 이동" })
    assert.equal(useMatchingStore.getState().roomId, "r-new")
})
