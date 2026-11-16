// 모바일 재판 창을 가리는 겹 창 시험: 투표 현황 창·설정 시트(방 코드 창)·전적 시트(신고 창)를 연 채 재판이 열리면 닫힘, 재판 뒤 저절로 다시 안 뜸
// 목록 A04 모바일 A04-M-013~018 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-goG2-tribunal-cover.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush } from "./a00-kit.mjs"
import {
    NAMES, confirmEntrances, dayResolved, fakeSocket, fire, renderPage, resetGame, seat, tribunalBox, tribunalEntry, tribunalResolved,
    useAuthStore, useInGameStore,
} from "./a00-game.mjs"

// 역할 창을 이미 본 것으로 (uuid 모양 판을 따로 차릴 때 씀, seat가 하는 일과 같음)
const { markRoleRevealSeen: markSeen } = await import("@/domains/game/ingame/utils/ingameSessionMemory.js")

let view = null
afterEach(() => { resetGame(view); view = null })

// 겹 창이 떠 있는지 (body로 띄운 것까지 찾음) — 비교엔 참거짓·글만 넣음 (화면 요소를 넣으면 실패 글 만들다 메모리가 터짐)
const statusDialog = () => document.querySelector('[role="dialog"][aria-label="투표 현황"]')
const voteStatusShown = () => statusDialog() !== null
const shown = (id) => document.querySelector(`[data-testid="${id}"]`) !== null
const tribunalShown = () => tribunalBox() !== null
const outcomeText = () => statusDialog()?.querySelector('[data-testid="vote-status-outcome"]')?.textContent.trim() ?? null

// n명 판 1일 낮 투표 화면 (나는 0번 자리 시민)
async function dayVotePage(n) {
    const socket = fakeSocket()
    seat({ n, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    return socket
}
// 이름으로 단추 눌러 창 열기
async function open(name) {
    const button = buttonNamed(name)
    assert.ok(button, `"${name}" 단추가 없음 (준비 잘못)`)
    click(button)
    await flush()
}
// 재판 열기 (피고 = 3번 자리) → 재판 창과 유죄·무죄 단추가 있는지까지 봄
async function openTribunal(socket, n) {
    await fire(socket, "day_vote_resolved", tribunalEntry({ n, defendant: 3 }))
    assert.ok(tribunalShown(), "재판 창이 안 뜸 (준비 잘못)")
    for (const name of ["유죄", "무죄"]) assert.ok(buttonNamed(name, tribunalBox()), `재판 창에 ${name} 단추가 없음`)
}
// 재판 끝(무죄) → 밤, "밤이 되었습니다" 안내는 확인으로 닫음
async function closeTribunal(socket) {
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 3, outcome: "NOT_GUILTY" }))
    assert.equal(tribunalShown(), false, "재판 창이 안 닫힘 (준비 잘못)")
    await confirmEntrances()
}

test("A04-M-013 투표 현황 창을 연 채 재판이 열림 (6명 판) → 투표 현황 창 닫힘, 재판 창의 유죄·무죄 단추만 남음", async () => {
    const socket = await dayVotePage(6)
    await open("투표 현황 열기")
    assert.ok(voteStatusShown(), "투표 현황 창이 안 열림 (준비 잘못)")
    await openTribunal(socket, 6)
    assert.equal(voteStatusShown(), false, "투표 현황 창이 재판 창 위에 남음")
})

test("A04-M-014 재판이 끝나도 투표 현황 창은 저절로 다시 안 뜸 (7명 판) → 밤에 창 없음, 다시 열면 결과 \"재판 회부\"", async () => {
    const socket = await dayVotePage(7)
    await open("투표 현황 열기")
    await openTribunal(socket, 7)
    await closeTribunal(socket)
    assert.equal(voteStatusShown(), false, "재판이 끝나자 투표 현황 창이 저절로 다시 뜸")
    await open("투표 현황 열기")
    assert.equal(outcomeText(), "재판 회부")
})

test("A04-M-015 재판 없는 판정이면 투표 현황 창 그대로 (5명 판): 동점 → 밤 → 창 남고 결과 \"동점\"", async () => {
    const socket = await dayVotePage(5)
    await open("투표 현황 열기")
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TIE", alive: 5, abstain: 0 }))
    assert.equal(tribunalShown(), false, "동점인데 재판 창이 뜸 (준비 잘못)")
    assert.equal(outcomeText(), "동점")
})

test("A04-M-016 설정 시트를 연 채 재판이 열림 (8명 판) → 설정 시트 닫힘, 재판 끝난 뒤에도 저절로 안 뜸", async () => {
    const socket = await dayVotePage(8)
    await open("인게임 설정")
    assert.ok(shown("settings-sheet"), "설정 시트가 안 열림 (준비 잘못)")
    await openTribunal(socket, 8)
    assert.equal(shown("settings-sheet"), false, "설정 시트가 재판 창 위에 남음")
    await closeTribunal(socket)
    assert.equal(shown("settings-sheet"), false, "재판이 끝나자 설정 시트가 저절로 다시 뜸")
})

test("A04-M-017 설정 시트 위 방 코드 창까지 연 채 재판이 열림 (10명 판) → 방 코드 창·설정 시트 둘 다 닫힘", async () => {
    const socket = await dayVotePage(10)
    await open("인게임 설정")
    await open("방 코드 보기")
    assert.ok(shown("room-code-sheet"), "방 코드 창이 안 열림 (준비 잘못)")
    await openTribunal(socket, 10)
    assert.deepEqual(
        { roomCode: shown("room-code-sheet"), settings: shown("settings-sheet") },
        { roomCode: false, settings: false },
    )
})

// 신고는 판 id·사람 id가 uuid 모양일 때만 됨 → 서버처럼 uuid 모양으로 판을 차림 (도우미 seat는 "p0" 꼴이라 여기서 따로)
const REAL_GAME = "8f0c2b1e-4a1d-4c3e-9b2a-000000000001"
const realId = (i) => `8f0c2b1e-4a1d-4c3e-9b2a-1000000000${String(i).padStart(2, "0")}`
async function realIdDayVotePage(n) {
    const socket = fakeSocket()
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: realId(0), nickname: NAMES[0] } })
    markSeen(REAL_GAME, realId(0))
    const players = Array.from({ length: n }, (_, i) => ({
        uuid: realId(i), nickname: NAMES[i], isAlive: true, isConnected: true, isParticipating: true, themeIndex: i,
    }))
    const self = { uuid: realId(0), nickname: NAMES[0], role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false }
    useInGameStore.getState().setGamePayload({
        gameId: REAL_GAME,
        state: { id: REAL_GAME, phase: "DAY", dayIndex: 1, dayPhase: "DAY_VOTE", dayPhaseDeadline: Date.now() + 60_000, players, self },
    })
    view = await renderPage(socket)
    return socket
}

test("A04-M-018 전적 시트에서 신고 창까지 연 채 재판이 열림 (6명 판) → 신고 창·전적 시트 둘 다 닫힘, 전적 시트를 다시 열어도 신고 창은 안 뜸", async () => {
    const socket = await realIdDayVotePage(6)
    await open("플레이어별 전적목록")
    await open(`${NAMES[2]} 신고`)
    assert.ok(shown("report-sheet"), "신고 창이 안 열림 (준비 잘못)")
    await fire(socket, "day_vote_resolved", { ...tribunalEntry({ n: 6, defendant: realId(3) }), gameId: REAL_GAME })
    assert.ok(tribunalShown(), "재판 창이 안 뜸 (준비 잘못)")
    assert.deepEqual(
        { report: shown("report-sheet"), records: shown("record-sheet") },
        { report: false, records: false },
    )
    await fire(socket, "tribunal_vote_resolved", {
        gameId: REAL_GAME, dayIndex: 1, phase: "NIGHT", defendantUuid: realId(3), outcome: "NOT_GUILTY", executedUuid: null,
    })
    assert.equal(tribunalShown(), false, "재판 창이 안 닫힘 (준비 잘못)")
    await confirmEntrances()
    await open("플레이어별 전적목록")
    assert.ok(shown("record-sheet"), "전적 시트가 다시 안 열림")
    assert.equal(shown("report-sheet"), false, "전적 시트를 다시 열자 신고 창이 저절로 뜸")
})
