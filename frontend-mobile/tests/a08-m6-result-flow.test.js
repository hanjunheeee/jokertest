// 모바일 결과 화면 흐름 시험(합친 화면): 연출 → 결과판, "대기방으로"(성공 → 대기방, 거절 → 결과 그대로), "로비로"(확인 → 나가기 → 로비), 결과 없으면 "로비로 돌아가기", 서버가 결과 화면 닫으면(game_result_closed) 로비
// 목록 A08 모바일 A08-M-601~607, A07 모바일 A07-M-601, 2026-11-24 되돌린 화면(baa5c898)에 맞춘 새 시험 (돌리기: frontend-mobile 폴더에서 node --test tests/a08-m6-result-flow.test.js)
import "./helpers/mobileLoader.mjs"
import { React, act } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { GAME, NAMES, answerConfirm, confirms, endGame, fakeSocket, renderRoute, resetGame, seat, skipIntro, useAuthStore, useInGameStore } from "./a00-game.mjs"

const { default: GameResultPage } = await import("@m/domains/game/result/pages/GameResultPage.jsx")
const { useMatchingStore } = await import("@/domains/game/matching/store/matchingStore.js")

let view = null
afterEach(() => {
    resetGame(view)
    view = null
    useMatchingStore.getState().clearRoom?.()
})

const ROLES = ["CITIZEN", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN"]
const rows = () => [...document.querySelectorAll('section[aria-label="가면무도회 참가자 정체"] li')]
const elsewhere = () => document.querySelector("[data-elsewhere]")?.getAttribute("data-elsewhere") ?? null

// 5명 판이 끝난 결과 화면 (나는 0번), acks = 소켓 답
async function openResult(acks = {}) {
    const socket = fakeSocket({ acks })
    seat({ n: 5, phase: "DAY" })
    endGame({ roles: ROLES, winner: "CITIZEN" })
    view = await renderRoute(socket, React.createElement(GameResultPage), { path: "/gameresult" })
    return socket
}
// 돌아갈 방 (return_to_room 답 모양)
function backRoom() {
    return {
        roomId: "room-back", roomCode: "BK12CD",
        players: [{ uuid: "p0", nickname: NAMES[0], isReady: false, membershipId: "m-p0" }],
        hostUuid: "p0", reservedHostUuid: null, roomInstanceId: "inst-b", bootEpoch: "boot-b", canStart: false,
        accessType: "open", settingsVersion: 2,
        settings: { maxPlayers: 8, jokerCount: 1, roleCompositionMode: "auto", dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 90 },
    }
}

test("A08-M-601 결과 화면: 처음엔 연출 영상만(결과판·단추 없음), 영상 끝 → 결과판 5줄 + '대기방으로'·'로비로'", async () => {
    await openResult()
    assert.ok(document.querySelector("video"), "연출 영상이 없음")
    assert.equal(rows().length, 0, "연출 중인데 결과판이 보임")
    assert.ok(buttonNamed("대기방으로") === null, "연출 중인데 단추가 보임")
    await skipIntro()
    assert.equal(rows().length, 5)
    assert.ok(buttonNamed("대기방으로") && buttonNamed("로비로"), `단추: ${buttonNames().join(" | ")}`)
})

test("A07-M-601 결과판 내 줄에만 '내 정보' 배지 (남의 줄엔 없음)", async () => {
    await openResult()
    await skipIntro()
    const badged = rows().filter((li) => textOf(li).includes("내 정보"))
    assert.equal(badged.length, 1, "'내 정보' 배지 줄 수가 다름")
    assert.ok(textOf(badged[0]).includes(NAMES[0]), "배지가 내 줄이 아님")
})

test("A08-M-602 '대기방으로' → return_to_room {gameId} 1번, 답에 방 → 판 지우고 대기방(/game-matching), 방 값 들어감", async () => {
    const socket = await openResult({ return_to_room: { ok: true, room: backRoom() } })
    await skipIntro()
    await act(async () => { buttonNamed("대기방으로").click() })
    await flush(5)
    assert.deepEqual(socket.sentOf("return_to_room"), [{ gameId: GAME }])
    await waitUntil(() => elsewhere() === "/game-matching", { label: "대기방으로 이동" })
    assert.equal(useMatchingStore.getState().roomId, "room-back")
    assert.equal(useInGameStore.getState().gameId, null, "판 값이 남음")
})

test("A08-M-603 '대기방으로' 거절(SESSION_ENDED) + 방도 없음 → 결과 화면 그대로, result-leave-notice(return) 표시, 단추 풀림", async () => {
    const socket = await openResult({ return_to_room: { ok: false, code: "SESSION_ENDED" }, get_current_room: { ok: true, room: null } })
    await skipIntro()
    await act(async () => { buttonNamed("대기방으로").click() })
    await flush(8)
    assert.equal(socket.sentOf("return_to_room").length, 1)
    assert.equal(elsewhere(), null, `다른 화면으로 감: ${elsewhere()}`)
    assert.equal(rows().length, 5, "결과판이 사라짐")
    const notice = document.querySelector('[data-testid="result-leave-notice"]')
    assert.ok(notice, "실패 안내 칸이 없음")
    assert.equal(notice.getAttribute("data-notice-source"), "return")
    assert.equal(textOf(notice), "연결이 끊겨 이 판에서 빠졌습니다. '로비로'를 눌러 주세요.")
    assert.equal(buttonNamed("대기방으로").getAttribute("aria-busy"), null)
})

test("A08-M-604 '로비로' → 확인 창 '로비로 나가시겠습니까?': 오프라인이면 result-leave-notice(exit), 연결 후 확인이면 /lobby", async () => {
    const socket = await openResult({ leave_game_session: { ok: true } })
    await skipIntro()
    answerConfirm(false)
    await act(async () => { buttonNamed("로비로").click() })
    await flush(3)
    assert.equal(confirms.at(-1), "로비로 나가시겠습니까?")
    assert.equal(socket.sentOf("leave_game_session").length, 0, "취소했는데 나가기를 보냄")

    socket.connected = false
    answerConfirm(true)
    await act(async () => { buttonNamed("로비로").click() })
    await flush(3)
    const exitNotice = document.querySelector('[data-testid="result-leave-notice"]')
    assert.ok(exitNotice, "로비로 오프라인 안내가 없음")
    assert.equal(exitNotice.getAttribute("data-notice-source"), "exit")
    assert.equal(textOf(exitNotice), "연결이 끊겨 로비로 가지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요.")

    socket.connected = true
    answerConfirm(true)
    await act(async () => { buttonNamed("로비로").click() })
    await flush(5)
    assert.equal(socket.sentOf("leave_game_session").length, 1)
    assert.equal(socket.sentOf("leave_game_session")[0].gameId, GAME)
    await waitUntil(() => elsewhere() === "/lobby", { label: "로비로 이동" })
})

test("A08-M-605 판 없이 결과 화면(스냅샷 답 '그 판에 없음') → 결과판 없이 '로비로 돌아가기' 하나, 누르면 /lobby", async () => {
    const socket = fakeSocket({ acks: { get_session_snapshot: { ok: false, code: "NOT_A_PARTICIPANT", message: "요청이 거절되었습니다." } } })
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: "p0", nickname: NAMES[0] } })
    view = await renderRoute(socket, React.createElement(GameResultPage), { path: "/gameresult" })
    await waitUntil(() => buttonNamed("로비로 돌아가기") !== null || elsewhere() !== null, { label: "로비로 돌아가기 단추" })
    assert.equal(elsewhere(), null, `다른 화면으로 감: ${elsewhere()}`)
    assert.equal(rows().length, 0)
    assert.ok(buttonNamed("대기방으로") === null)
    click(buttonNamed("로비로 돌아가기"))
    await flush(3)
    assert.equal(elsewhere(), "/lobby")
})

test("A08-M-606 서버가 이 판 결과 화면을 닫음(game_result_closed) → 판·방 값 지우고 로비(/lobby)", async () => {
    const socket = await openResult()
    await skipIntro()
    useMatchingStore.getState().setRoom(backRoom())
    await act(async () => { socket.fire("game_result_closed", { gameId: GAME, reason: "RESULT_TIMEOUT" }) })
    await flush(5)
    assert.equal(elsewhere(), "/lobby")
    assert.equal(useInGameStore.getState().gameId, null, "판 값이 남음")
    assert.equal(useMatchingStore.getState().isInRoom, false, "방 값이 남음")
})

test("A08-M-607 우상단 180초 타이머 표시 + 다른 판 id의 game_result_closed 무시", async () => {
    const socket = await openResult()
    await skipIntro()
    await flush(3)
    const timer = document.querySelector('[data-testid="result-close-timer"]')
    assert.ok(timer, "우상단 180초 타이머가 없음")
    const sec = Number(timer.getAttribute("data-seconds-left"))
    assert.ok(sec >= 175 && sec <= 180, `남은 초 범위 이상: ${sec}`)
    assert.ok(textOf(timer).includes("남은 시간") && /\d+초/.test(textOf(timer)), `타이머 글: ${textOf(timer)}`)

    await act(async () => { socket.fire("game_result_closed", { gameId: "g-other", reason: "RESULT_TIMEOUT" }) })
    await flush(3)
    assert.equal(elsewhere(), null)
    assert.equal(rows().length, 5)
})
