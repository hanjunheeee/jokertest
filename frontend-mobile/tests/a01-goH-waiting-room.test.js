// 모바일 대기방 시험: 위 줄 방 이름·앉은 수/정원, 자리의 "준비완료"·"대기중" 글, 추방 단추 잠긴 까닭 글(끊김이면 끊김 글)
// 목록 A01a 모바일 A01-M-H1·H2·H5~H12, A01b 모바일 A01-M-H3·H4 — 결정(2026-11-16 오전 둘째 1·2·3번)·모음 글 C-019 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-goH-waiting-room.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, flush, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderRoute, resetGame, useAuthStore } from "./a00-game.mjs"

const { default: GameMatchingPage } = await import("@m/domains/game/matching/pages/GameMatchingPage.jsx")
const { default: HostActions } = await import("@m/domains/game/matching/components/layout/HostActions.jsx")
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

test("A01-M-H1 방 title '가람의 방' → 위 줄에 그 글, title 칸이 없으면 방 이름 글 없음", async () => {
    await openWaitingRoom(roomOf({ title: "가람의 방" }))
    assert.equal(textOf(byTestId("matching-room-title")), "가람의 방")
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom()
    await openWaitingRoom(roomOf())
    assert.equal(byTestId("matching-room-title"), null)
})

test("A01-M-H2 정원 8 방에 3명 → 자리 칸 3개 그대로, 숫자 '3/8', 인원 머리말은 '파티 인원 3명' 그대로", async () => {
    await openWaitingRoom(roomOf())
    const capacity = byTestId("matching-party-capacity")
    assert.ok(capacity, "앉은 수/정원 글이 없음")
    assert.equal(capacity.querySelector('[aria-hidden="true"]').textContent, "3/8")
    assert.ok(capacity.textContent.includes("앉은 사람 3명, 정원 8명"), "읽어 주는 글이 없음")
    assert.equal(document.querySelectorAll('[aria-label="파티 인원 3명"]').length, 1)
    // 자리 칸은 앉은 사람만큼 (준비 글이 붙은 칸 수)
    const seatTexts = [...document.querySelectorAll("img")]
        .map((img) => img.parentElement)
        .filter((wrap) => /^(준비완료|대기중)$/.test(textOf(wrap)))
    assert.equal(seatTexts.length, 3)
})

test("A01-M-H3 자리 글: 준비한 사람 '준비완료', 안 한 사람 '대기중' (그림만으로 가리지 않음)", async () => {
    await openWaitingRoom(roomOf())
    const seats = [...document.querySelectorAll("img")]
        .map((img) => img.parentElement)
        .filter((wrap) => /^(준비완료|대기중)$/.test(textOf(wrap)))
    assert.deepEqual(seats.map((seat) => textOf(seat)), ["준비완료", "대기중", "대기중"])
    // 준비한 칸만 data-ready
    assert.deepEqual(seats.map((seat) => seat.hasAttribute("data-ready")), [true, false, false])
})

test("A01-M-H4 [버그 7] 잠긴 까닭 글을 넘기면 그 글이 보임 (끊긴 창 = 끊김 글), 안 넘기면 '확인하는 중' 글", () => {
    const base = { visible: true, hidden: false, canEditSettings: true, isKickHost: true, canKick: false, onOpenSettings: () => {}, onOpenKickModal: () => {} }
    view = render(React.createElement(HostActions, { ...base, kickLockedReason: "서버와 연결되어 있지 않아 추방할 수 없습니다." }))
    assert.equal(textOf(view.container.querySelector('[data-testid="kick-locked-reason"]')), "서버와 연결되어 있지 않아 추방할 수 없습니다.")
    assert.equal(buttonNamed("참가자 추방", view.container).disabled, true)
    view.unmount()
    view = render(React.createElement(HostActions, base))
    assert.equal(textOf(view.container.querySelector('[data-testid="kick-locked-reason"]')), "방 정보를 서버에서 확인하는 중이라 아직 추방할 수 없습니다.")
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

test("A01-M-H5 3명 방 방장: '게임시작' 꺼짐 + 까닭 글 '5명부터 시작할 수 있습니다. (지금 3명)', 단추가 그 글을 가리킴", async () => {
    await openWaitingRoom(roomWith(3))
    const start = buttonNamed("게임시작")
    assert.ok(start, "게임시작 단추가 없음")
    assert.equal(start.disabled, true)
    const reason = byTestId("start-locked-reason")
    assert.equal(textOf(reason), "5명부터 시작할 수 있습니다. (지금 3명)")
    assert.equal(start.getAttribute("aria-describedby"), reason.id)
})

test("A01-M-H6 5명 방 전원 준비 방장: '게임시작' 켜짐, 까닭 글 없음", async () => {
    await openWaitingRoom(roomWith(5, 5))
    assert.equal(buttonNamed("게임시작").disabled, false)
    assert.equal(byTestId("start-locked-reason"), null)
})

test("A01-M-H8 5명 방 준비 3명 방장: '게임시작' 꺼짐 + 까닭 글 '모두 준비해야 시작할 수 있습니다. (준비 3/5)', 단추가 그 글을 가리킴", async () => {
    await openWaitingRoom(roomWith(5, 3))
    const start = buttonNamed("게임시작")
    assert.equal(start.disabled, true)
    const reason = byTestId("start-locked-reason")
    assert.equal(textOf(reason), "모두 준비해야 시작할 수 있습니다. (준비 3/5)")
    assert.equal(start.getAttribute("aria-describedby"), reason.id)
})

test("A01-M-H9 3명 방 + 준비도 안 됨(둘 다 걸림): 인원 글이 먼저", async () => {
    await openWaitingRoom(roomWith(3, 1))
    assert.equal(textOf(byTestId("start-locked-reason")), "5명부터 시작할 수 있습니다. (지금 3명)")
})

test("A01-M-H7 3명 방 손님: '게임시작' 단추도 까닭 글도 없음", async () => {
    const room = roomWith(3)
    const socket = fakeSocket({ acks: { get_current_room: { ok: true, room } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "pB", nickname: "나래" } })
    useMatchingStore.getState().setRoom(room)
    view = await renderRoute(socket, React.createElement(GameMatchingPage), { path: "/game-matching" })
    await flush(10)
    assert.equal(buttonNamed("게임시작"), null)
    assert.equal(byTestId("start-locked-reason"), null)
})

// 서버가 방 값에 실어 보낸 시작 최소 인원(minPlayers)을 씀 (모바일도 데스크톱 훅 그대로), 없거나 이상한 값이면 5명
test("A01-M-H10 방 값 minPlayers 6 + 5명 전원 준비 방장: '게임시작' 꺼짐 + 까닭 글 '6명부터 시작할 수 있습니다. (지금 5명)', 단추가 그 글을 가리킴", async () => {
    await openWaitingRoom({ ...roomWith(5, 5), canStart: false, minPlayers: 6 })
    const start = buttonNamed("게임시작")
    assert.equal(start.disabled, true)
    const reason = byTestId("start-locked-reason")
    assert.equal(textOf(reason), "6명부터 시작할 수 있습니다. (지금 5명)")
    assert.equal(start.getAttribute("aria-describedby"), reason.id)
})

test("A01-M-H11 방 값 minPlayers 4 + 4명 전원 준비(canStart 참) 방장: '게임시작' 켜짐, 까닭 글 없음", async () => {
    await openWaitingRoom({ ...roomWith(4, 4), canStart: true, minPlayers: 4 })
    assert.equal(buttonNamed("게임시작").disabled, false)
    assert.equal(byTestId("start-locked-reason"), null)
})

test("A01-M-H12 방 값 minPlayers가 숫자 아님(\"6\") + 3명 방 방장: 5명 기준 '5명부터 시작할 수 있습니다. (지금 3명)'", async () => {
    await openWaitingRoom({ ...roomWith(3), minPlayers: "6" })
    assert.equal(buttonNamed("게임시작").disabled, true)
    assert.equal(textOf(byTestId("start-locked-reason")), "5명부터 시작할 수 있습니다. (지금 3명)")
})
