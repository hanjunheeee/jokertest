// 모바일 대기방 시험: 위 줄 "파티 인원 N명"·자리 실루엣 수, 준비한 자리만 준비 실루엣(data-ready), 방장 "게임시작"은 미리 안 꺼짐
// 목록 A01a 모바일 A01-M-H2·H6·H7·H11, A01b 모바일 A01-M-H3 — 결정(2026-11-16 오전 둘째 1·2·3번)·모음 글 C-019, 합친 화면(2026-11-24 되돌림)에 맞춤 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-goH-waiting-room.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, flush, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, useAuthStore } from "./a00-game.mjs"

const { default: GameMatchingPage } = await import("@m/domains/game/matching/pages/GameMatchingPage.jsx")
const { useMatchingStore } = await import("@/domains/game/matching/store/matchingStore.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()
})

// 서버 방 값 모양: 정원 8, 3명 앉음(방장 가람은 준비함), title은 넣을 때만
function roomOf(extra = {}) {
    return {
        roomId: "room-m2",
        roomCode: "AB12CD",
        players: [
            { uuid: "pA", nickname: "가람", isReady: true, membershipId: "m-pA" },
            { uuid: "pB", nickname: "나래", isReady: false, membershipId: "m-pB" },
            { uuid: "pC", nickname: "다솜", isReady: false, membershipId: "m-pC" },
        ],
        hostUuid: "pA",
        reservedHostUuid: null,
        roomInstanceId: "inst-m2",
        bootEpoch: "boot-m2",
        canStart: false,
        accessType: "open",
        settingsVersion: 1,
        settings: { maxPlayers: 8, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
        ...extra,
    }
}

// 방장 가람으로 대기방 화면을 그림
async function openWaitingRoom(room) {
    const socket = fakeSocket({ acks: { get_current_room: { ok: true, room } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "pA", nickname: "가람" } })
    useMatchingStore.getState().setRoom(room)
    view = await renderRoute(socket, React.createElement(GameMatchingPage), { path: "/game-matching" })
    await flush(10)
}

const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`)
// 판 안 자리 칸 (한 줄 5칸 줄 안의 실루엣 칸)
const seats = () => [...document.querySelectorAll("div.items-end.justify-center > div.flex-col.items-center")]
// 자리 그림이 준비 실루엣인지 (주소에 "미준비"가 없으면 준비)
const seatReady = (seat) => !decodeURIComponent(seat.querySelector("img").getAttribute("src")).normalize("NFC").includes("미준비")

test("A01-M-H2 정원 8 방에 3명 → 자리 칸 3개 그대로, 위 줄 '파티 인원 3명' (앉은 수/정원 글 칸은 없음)", async () => {
    await openWaitingRoom(roomOf())
    const header = document.querySelector('[aria-label="파티 인원 3명"]')
    assert.ok(header, "위 줄 인원 머리말이 없음")
    assert.equal(textOf(header), "파티 인원 3명")
    assert.equal(byTestId("matching-party-capacity"), null, "앉은 수/정원 칸이 있음")
    assert.equal(seats().length, 3)
})

test("A01-M-H3 자리 그림: 준비한 사람만 준비 실루엣·data-ready, 자리 칸에 '준비완료'·'대기중' 글은 없음", async () => {
    await openWaitingRoom(roomOf())
    const list = seats()
    assert.deepEqual(list.map(seatReady), [true, false, false])
    assert.deepEqual(list.map((seat) => seat.hasAttribute("data-ready")), [true, false, false])
    assert.deepEqual(list.map((seat) => textOf(seat)), ["", "", ""])
})

// 방장 가람 + 손님 n-1명 방, 앞에서부터 readyCount명이 준비함 (전원 준비면 서버처럼 canStart 참)
function roomWith(n, readyCount = 0) {
    const names = ["가람", "나래", "다솜", "라온", "마루"]
    const ids = ["pA", "pB", "pC", "pD", "pE"]
    return roomOf({
        players: ids.slice(0, n).map((uuid, i) => ({ uuid, nickname: names[i], isReady: i < readyCount, membershipId: `m-${uuid}` })),
        canStart: n >= 5 && readyCount >= n,
    })
}

test("A01-M-H6 5명 방 전원 준비 방장: '게임시작' 켜짐, 까닭 글 없음", async () => {
    await openWaitingRoom(roomWith(5, 5))
    assert.equal(buttonNamed("게임시작").disabled, false)
    assert.equal(byTestId("start-locked-reason"), null)
})

test("A01-M-H7 3명 방 손님: '게임시작' 단추도 까닭 글도 없음", async () => {
    const room = roomWith(3)
    const socket = fakeSocket({ acks: { get_current_room: { ok: true, room } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "pB", nickname: "나래" } })
    useMatchingStore.getState().setRoom(room)
    view = await renderRoute(socket, React.createElement(GameMatchingPage), { path: "/game-matching" })
    await flush(10)
    assert.ok(buttonNamed("게임시작") === null)
    assert.equal(byTestId("start-locked-reason"), null)
})

test("A01-M-H11 방 값 minPlayers 4 + 4명 전원 준비(canStart 참) 방장: '게임시작' 켜짐, 까닭 글 없음", async () => {
    await openWaitingRoom({ ...roomWith(4, 4), canStart: true, minPlayers: 4 })
    assert.equal(buttonNamed("게임시작").disabled, false)
    assert.equal(byTestId("start-locked-reason"), null)
})
