// 모바일 대기방 시험: 방 이름·앉은 수/정원·파티 인원 머리말, 자리별 준비완료/대기중 배지, 방장 시작 단추 사전 잠금·까닭 글
// 목록 A01a·A01b 모바일 대기방 의도 일치 검증용 시험 파일
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

// 서버 방 값 모양: 정원 8, 3명 앉음(방장 가람은 준비함)
function roomOf(extra = {}) {
    return {
        roomId: "room-m2",
        roomCode: "AB12CD",
        title: "가람의 방",
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

// 방장 가람으로 대기방 화면 렌더링
async function openWaitingRoom(room) {
    const socket = fakeSocket({ acks: { get_current_room: { ok: true, room } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "pA", nickname: "가람" } })
    useMatchingStore.getState().setRoom(room)
    view = await renderRoute(socket, React.createElement(GameMatchingPage), { path: "/game-matching" })
    await flush(10)
}

const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`)
// 판 안 자리 칸 목록
const seats = () => [...document.querySelectorAll("div.items-end.justify-center > div.flex-col.items-center")]
// 자리 그림이 준비 실루엣인지 확인
const seatReady = (seat) => !decodeURIComponent(seat.querySelector("img").getAttribute("src")).normalize("NFC").includes("미준비")

test("A01-M-H2 정원 8 방에 3명 → 머리말에 방 이름 '가람의 방'·'파티 인원 3명'·정원 '3/8' 모두 표시", async () => {
    await openWaitingRoom(roomOf())
    assert.equal(textOf(byTestId("matching-room-title")), "가람의 방")
    const party = document.querySelector('[aria-label="파티 인원 3명"]')
    assert.ok(party, "위 줄 인원 머리말이 없음")
    assert.equal(textOf(party), "파티 인원 3명")
    const cap = byTestId("matching-party-capacity")
    assert.ok(cap, "앉은 수/정원 칸이 없음")
    assert.equal(textOf(cap.querySelector('[aria-hidden="true"]')), "3/8")
    assert.ok(textOf(cap).includes("앉은 사람 3명, 정원 8명"))
    assert.equal(seats().length, 3)
})

test("A01-M-H3 자리 그림: 준비한 사람은 준비 실루엣·data-ready·'준비완료', 미준비는 '대기중' 배지 표시", async () => {
    await openWaitingRoom(roomOf())
    const list = seats()
    assert.deepEqual(list.map(seatReady), [true, false, false])
    assert.deepEqual(list.map((seat) => seat.hasAttribute("data-ready")), [true, false, false])
    assert.deepEqual(list.map((seat) => textOf(seat)), ["준비완료", "대기중", "대기중"])
    assert.deepEqual(list.map((seat) => seat.querySelector("img").getAttribute("alt")), ["준비 완료한 참가자", "준비 전 참가자", "준비 전 참가자"])
})

// 방장 가람 + 손님 n-1명 방 생성
function roomWith(n, readyCount = 0) {
    const names = ["가람", "나래", "다솜", "라온", "마루"]
    const ids = ["pA", "pB", "pC", "pD", "pE"]
    return roomOf({
        players: ids.slice(0, n).map((uuid, i) => ({ uuid, nickname: names[i], isReady: i < readyCount, membershipId: `m-${uuid}` })),
        canStart: n >= 5 && readyCount >= n,
    })
}

test("A01-M-H4 3명 방 방장: '게임시작' 사전 잠금 + '5명부터 시작할 수 있습니다. (지금 3명)' 표시", async () => {
    await openWaitingRoom(roomWith(3, 3))
    assert.equal(buttonNamed("게임시작").disabled, true)
    assert.equal(textOf(byTestId("start-locked-reason")), "5명부터 시작할 수 있습니다. (지금 3명)")
})

test("A01-M-H5 5명 중 3명 준비 방장: '게임시작' 사전 잠금 + '모두 준비해야 시작할 수 있습니다. (준비 3/5)' 표시", async () => {
    await openWaitingRoom(roomWith(5, 3))
    assert.equal(buttonNamed("게임시작").disabled, true)
    assert.equal(textOf(byTestId("start-locked-reason")), "모두 준비해야 시작할 수 있습니다. (준비 3/5)")
})

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

test("A01-M-H11 방 값 minPlayers 4 반영: 3명이면 '4명부터…' 잠금, 4명 전원 준비면 켜짐", async () => {
    await openWaitingRoom({ ...roomWith(3, 3), canStart: false, minPlayers: 4 })
    assert.equal(buttonNamed("게임시작").disabled, true)
    assert.equal(textOf(byTestId("start-locked-reason")), "4명부터 시작할 수 있습니다. (지금 3명)")
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()

    await openWaitingRoom({ ...roomWith(4, 4), canStart: true, minPlayers: 4 })
    assert.equal(buttonNamed("게임시작").disabled, false)
    assert.equal(byTestId("start-locked-reason"), null)
})
