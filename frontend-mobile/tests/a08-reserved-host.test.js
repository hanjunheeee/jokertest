// 모바일 판 끝 뒤 대기방 시험: 비워 둔 방장 자리(맨 앞 빈 실루엣 + 판 아래 기다림 글), 판 중 설정 시트에 방관리 탭·"다음 게임 설정 유지" 없음
// 목록 A08 모바일 A08-M-006·007 (돌리기: frontend-mobile 폴더에서 node --test tests/a08-reserved-host.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, textOf } from "./a00-kit.mjs"
import { fakeSocket, renderPage, renderRoute, resetGame, seat, useAuthStore } from "./a00-game.mjs"

const { default: GameMatchingPage } = await import("@m/domains/game/matching/pages/GameMatchingPage.jsx")
const { useMatchingStore } = await import("@/domains/game/matching/store/matchingStore.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()
})

// 판 끝 뒤 다시 열린 방 (서버 방 값 모양): 원래 방장 A 자리를 남겨 두고 B·C가 들어옴
function reopenedRoom() {
    return {
        roomId: "room-m1",
        roomCode: "AB12CD",
        players: [
            { uuid: "pB", nickname: "나래", isReady: false, membershipId: "m-pB" },
            { uuid: "pC", nickname: "다솜", isReady: false, membershipId: "m-pC" },
        ],
        hostUuid: null,
        reservedHostUuid: "pA",
        roomInstanceId: "inst-m1",
        bootEpoch: "boot-m1",
        canStart: false,
        accessType: "code",
        settingsVersion: 3,
        settings: { maxPlayers: 8, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
    }
}

test("A08-M-006 방장 자리 비움: reservedHostUuid 있음·2명 → 자리 3칸(맨 앞 '방장 자리' 이름표·비워 둔 방장 자리 + 2명 '대기중') + 기다림 글", async () => {
    const room = reopenedRoom()
    const socket = fakeSocket({ acks: { get_current_room: { ok: true, room } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "pB", nickname: "나래" } })
    useMatchingStore.getState().setRoom(room)
    view = await renderRoute(socket, React.createElement(GameMatchingPage), { path: "/game-matching" })
    await flush(10)
    const seats = [...document.querySelectorAll("div.items-end.justify-center > div.flex-col.items-center")]
    assert.equal(seats.length, 3, "방장 자리 칸을 더한 자리 수가 아님")
    const reserved = document.querySelector('[data-testid="matching-reserved-host-slot"]')
    assert.equal(reserved, seats[0], "맨 앞 자리가 예약석이 아님")
    assert.ok(reserved.hasAttribute("data-reserved-host"))
    assert.equal(reserved.querySelector("img")?.getAttribute("alt"), "비워 둔 방장 자리")
    assert.equal(textOf(seats[0]), "방장 자리")
    assert.deepEqual([textOf(seats[1]), textOf(seats[2])], ["대기중", "대기중"])
    assert.ok(textOf(document.body).includes("방장 자리를 비워 두었습니다. 지난 판 방장이 오지 않으면 먼저 들어온 사람이 방장이 됩니다."), "기다림 글이 없음")
})

test("A08-M-007 설정 시트에 스위치 없음 [결정: 방관리 탭째 없앰]: 방장 판 중 설정 → '방관리' 탭·'다음 게임 설정 유지' 없음", async () => {
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_DISCUSSION", hostUuid: "p0" })
    view = await renderPage(socket)
    click(buttonNamed("인게임 설정"))
    await flush()
    const sheet = document.querySelector('[data-testid="settings-sheet"]')
    assert.ok(sheet, "설정 시트가 안 열림")
    assert.ok(!textOf(sheet).includes("다음 게임 설정 유지"), "'다음 게임 설정 유지' 스위치가 보임")
    assert.ok(!buttonNames(sheet).some((n) => n.includes("방관리")), `설정 시트 탭: ${buttonNames(sheet).join(" | ")}`)
})
