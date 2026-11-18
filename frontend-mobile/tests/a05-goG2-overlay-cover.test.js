// 모바일 연출 창을 가리는 겹 창 시험: 화면이 잠기는 연출("밤이 되었습니다"·낮 시작 글 창·암살 영상·사망 선택 창)·밤 차례 안내가 뜨면 설정·전적 시트(방 코드·신고 창)와 넓은 배치의 채팅 크게 보기가 닫힘, 끝난 뒤 저절로 다시 안 뜸
// 목록 A05b 모바일 A05-M-509~518 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-goG2-overlay-cover.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { act } from "./helpers/dom.mjs"
import { buttonNamed, click, flush } from "./a00-kit.mjs"
import {
    NAMES, confirmEntrances, dayResolved, fakeSocket, fire, nextDay, renderPage, resetGame, seat, turnStarted, useAuthStore, useInGameStore,
} from "./a00-game.mjs"

// 역할 창을 이미 본 것으로 (uuid 모양 판을 따로 차릴 때 씀, seat가 하는 일과 같음)
const { markRoleRevealSeen: markSeen } = await import("@/domains/game/ingame/utils/ingameSessionMemory.js")

let view = null
const realMatchMedia = window.matchMedia
afterEach(() => { resetGame(view); view = null; window.matchMedia = realMatchMedia })

// 창이 떠 있는지 (참거짓만 비교에 넣음 — 화면 요소를 넣으면 실패 글 만들다 메모리가 터짐)
const shown = (id) => document.querySelector(`[data-testid="${id}"]`) !== null
const dialogShown = (label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`) !== null
const entranceShown = () => dialogShown("단계 전환 안내")
const nightTurnShown = () => document.querySelector("[data-night-turn-role]") !== null
const dawnShown = (kind) => document.querySelector(`[data-ingame-dawn-report="${kind}"]`) !== null
const killVideoShown = () => document.querySelector("[data-ingame-night-success-kill]") !== null
const closeupShown = () => dialogShown("채팅 클로즈업")
const voteStatusShown = () => dialogShown("투표 현황")
// 안내 창 안 "확인" 단추가 있는지
const entranceHasConfirm = () => {
    const box = document.querySelector('[role="dialog"][aria-label="단계 전환 안내"]')
    return box !== null && [...box.querySelectorAll("button")].some((b) => b.textContent.trim() === "확인")
}

// 이름으로 단추 눌러 창 열기
async function open(name) {
    const button = buttonNamed(name)
    assert.ok(button, `"${name}" 단추가 없음 (준비 잘못)`)
    click(button)
    await flush()
}
// n명 판 화면 (나는 0번 자리), 처음 뜬 단계 안내는 확인으로 닫음
async function page(seatOptions) {
    const socket = fakeSocket()
    seat(seatOptions)
    view = await renderPage(socket)
    await confirmEntrances()
    return socket
}
// 폰 가로·태블릿 배치로 (넓은 배치 물음에만 "맞음"이라 답함, 시험 끝에 되돌림)
function useWideScreen() {
    window.matchMedia = (query) => ({
        matches: String(query).includes("min-width: 48rem"), media: query,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    })
}
// 낮 판정(동점) → 밤: "밤이 되었습니다" 안내가 뜸
const toNight = (socket, n) => fire(socket, "day_vote_resolved", dayResolved({ outcome: "TIE", alive: n, abstain: 0 }))

test("A05-M-509 설정 시트를 연 채 \"밤이 되었습니다\" 안내가 뜸 (6명 판) → 설정 시트 닫힘, 안내 창 \"확인\" 있음, 확인 뒤에도 저절로 안 뜸", async () => {
    const socket = await page({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    await open("인게임 설정")
    assert.equal(shown("settings-sheet"), true, "설정 시트가 안 열림 (준비 잘못)")
    await toNight(socket, 6)
    assert.equal(entranceHasConfirm(), true, "밤 안내 창이 안 뜸 (준비 잘못)")
    assert.equal(shown("settings-sheet"), false, "설정 시트가 안내 창 위에 남음")
    await confirmEntrances()
    assert.deepEqual({ entrance: entranceShown(), settings: shown("settings-sheet") }, { entrance: false, settings: false })
})

test("A05-M-510 전적 시트를 연 채 밤 차례 안내가 뜸 (7명 판, 나는 의사) → 전적 시트 닫힘", async () => {
    const socket = await page({ n: 7, role: "DOCTOR", phase: "NIGHT" })
    await open("플레이어별 전적목록")
    assert.equal(shown("record-sheet"), true, "전적 시트가 안 열림 (준비 잘못)")
    await fire(socket, "night_turn_started", turnStarted({ role: "DOCTOR" }))
    assert.equal(nightTurnShown(), true, "밤 차례 안내가 안 뜸 (준비 잘못)")
    assert.equal(shown("record-sheet"), false, "전적 시트가 밤 차례 안내 위에 남음")
})

test("A05-M-511 설정 시트 위 방 코드 창까지 연 채 낮 시작 글 창(아무 일 없음)이 뜸 (8명 판) → 방 코드 창·설정 시트 둘 다 닫힘", async () => {
    const socket = await page({ n: 8, phase: "NIGHT" })
    await open("인게임 설정")
    await open("방 코드 보기")
    assert.equal(shown("room-code-sheet"), true, "방 코드 창이 안 열림 (준비 잘못)")
    await fire(socket, "night_result_applied", nextDay({ n: 8, deadline: Date.now() + 60_000 }))
    assert.equal(dawnShown("QUIET"), true, "낮 시작 글 창이 안 뜸 (준비 잘못)")
    assert.deepEqual({ roomCode: shown("room-code-sheet"), settings: shown("settings-sheet") }, { roomCode: false, settings: false })
})

// 신고는 판 id·사람 id가 uuid 모양일 때만 됨 → 서버처럼 uuid 모양으로 판을 차림 (도우미 seat는 "p0" 꼴이라 여기서 따로)
const REAL_GAME = "8f0c2b1e-4a1d-4c3e-9b2a-000000000005"
const realId = (i) => `8f0c2b1e-4a1d-4c3e-9b2a-1000000000${String(i).padStart(2, "0")}`
async function realIdNightPage(n) {
    const socket = fakeSocket()
    useAuthStore.setState({ isLoggedIn: true, user: { uuid: realId(0), nickname: NAMES[0] } })
    markSeen(REAL_GAME, realId(0))
    const players = Array.from({ length: n }, (_, i) => ({
        uuid: realId(i), nickname: NAMES[i], isAlive: true, isConnected: true, isParticipating: true, themeIndex: i,
    }))
    const self = { uuid: realId(0), nickname: NAMES[0], role: "CITIZEN", team: "CITIZEN", hasActedThisPhase: false }
    useInGameStore.getState().setGamePayload({
        gameId: REAL_GAME,
        state: { id: REAL_GAME, phase: "NIGHT", dayIndex: 1, nightTurnRole: null, nightTurnDeadline: null, players, self },
    })
    view = await renderPage(socket)
    await confirmEntrances()
    return socket
}

test("A05-M-512 전적 시트에서 신고 창까지 연 채 암살 영상이 뜸 (6명 판) → 신고 창·전적 시트 둘 다 닫힘, 영상 뒤 전적 시트를 다시 열어도 신고 창 안 뜸", async () => {
    const socket = await realIdNightPage(6)
    await open("플레이어별 전적목록")
    await open(`${NAMES[2]} 신고`)
    assert.equal(shown("report-sheet"), true, "신고 창이 안 열림 (준비 잘못)")
    await fire(socket, "night_result_applied", {
        gameId: REAL_GAME, phase: "DAY", dayIndex: 2,
        players: Array.from({ length: 6 }, (_, i) => ({ uuid: realId(i), alive: i !== 4 })),
        victimUuid: realId(4), deathReveals: [{ victimUuid: realId(4), source: "JOKER" }],
        dayPhaseDeadline: Date.now() + 60_000,
    })
    assert.equal(killVideoShown(), true, "암살 영상이 안 뜸 (준비 잘못)")
    assert.deepEqual({ report: shown("report-sheet"), records: shown("record-sheet") }, { report: false, records: false })
    // 영상 끝 → "낮이 되었습니다" 확인 → 전적 시트를 다시 엶
    act(() => { document.querySelector("[data-ingame-night-success-source-video]")?.dispatchEvent(new window.Event("ended")) })
    await flush()
    await confirmEntrances()
    await open("플레이어별 전적목록")
    assert.deepEqual({ records: shown("record-sheet"), report: shown("report-sheet") }, { records: true, report: false })
})

test("A05-M-513 죽은 사람의 밤 안내는 잠그지 않음 (7명 판, 나는 죽음): 설정 시트를 연 채 밤이 됨 → 설정 시트 그대로", async () => {
    const socket = await page({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE", dead: [0] })
    // 죽은 채 들어오면 사망 선택 창이 먼저 뜸 → 관전 계속을 골라 닫음 (창이 떠 있으면 설정 시트가 바로 닫힘)
    await open("관전 계속하기")
    await open("인게임 설정")
    assert.equal(shown("settings-sheet"), true, "설정 시트가 안 열림 (준비 잘못)")
    await toNight(socket, 7)
    assert.equal(useInGameStore.getState().state.phase, "NIGHT", "밤으로 안 넘어감 (준비 잘못)")
    assert.equal(shown("settings-sheet"), true, "잠그지 않는 안내인데 설정 시트가 닫힘")
})

test("A05-M-514 투표 현황 창은 밤 안내가 떠도 그대로 (5명 판): 전원 기권 → 밤 안내 → 창 남음, 확인 뒤에도 남음", async () => {
    const socket = await page({ n: 5, phase: "DAY", dayPhase: "DAY_VOTE" })
    await open("투표 현황 열기")
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 5, abstain: 5 }))
    assert.equal(entranceShown(), true, "밤 안내 창이 안 뜸 (준비 잘못)")
    assert.equal(voteStatusShown(), true, "투표 현황 창이 닫힘")
    await confirmEntrances()
    assert.equal(voteStatusShown(), true, "확인 뒤 투표 현황 창이 닫힘")
})

test("A05-M-515 넓은 배치: 채팅 크게 보기를 연 채 \"밤이 되었습니다\" 안내가 뜸 (6명 판) → 크게 보기 닫힘, 안내 창 \"확인\" 있음, 확인 뒤에도 저절로 안 뜸", async () => {
    useWideScreen()
    const socket = await page({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    await open("채팅 크게 보기")
    assert.equal(closeupShown(), true, "크게 보기가 안 열림 (준비 잘못)")
    await toNight(socket, 6)
    assert.equal(entranceHasConfirm(), true, "밤 안내 창이 안 뜸 (준비 잘못)")
    assert.equal(closeupShown(), false, "크게 보기가 안내 창 위에 남음")
    await confirmEntrances()
    assert.equal(closeupShown(), false, "확인 뒤 크게 보기가 저절로 다시 뜸")
})

test("A05-M-516 넓은 배치: 채팅 크게 보기를 연 채 암살 영상이 뜸 (8명 판) → 크게 보기 닫힘", async () => {
    useWideScreen()
    const socket = await page({ n: 8, phase: "NIGHT" })
    await open("채팅 크게 보기")
    assert.equal(closeupShown(), true, "크게 보기가 안 열림 (준비 잘못)")
    await fire(socket, "night_result_applied", nextDay({ n: 8, dead: [2], victim: 2, deadline: Date.now() + 60_000 }))
    assert.equal(killVideoShown(), true, "암살 영상이 안 뜸 (준비 잘못)")
    assert.equal(closeupShown(), false, "크게 보기가 암살 영상 위에 남음")
})

// 판 도중 내가 죽은 판 상태가 옴 (끊겨 탈락 등 — 영상 없이 사망 선택 창만 뜨는 길), seat가 스냅샷 받기와 같은 일을 함
async function selfDiesBySnapshot(n) {
    act(() => { seat({ n, phase: "DAY", dayPhase: "DAY_VOTE", dead: [0] }) })
    await flush()
}
const deadChoiceShown = () => buttonNamed("관전 계속하기") !== null

test("A05-M-517 설정 시트를 연 채 사망 선택 창이 뜸 (6명 판, 판 상태에 내 죽음이 옴) → 설정 시트 닫힘, 관전 계속을 골라도 저절로 안 뜸", async () => {
    await page({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    await open("인게임 설정")
    assert.equal(shown("settings-sheet"), true, "설정 시트가 안 열림 (준비 잘못)")
    await selfDiesBySnapshot(6)
    assert.equal(deadChoiceShown(), true, "사망 선택 창이 안 뜸 (준비 잘못)")
    assert.equal(shown("settings-sheet"), false, "설정 시트가 사망 선택 창 위에 남음")
    await open("관전 계속하기")
    assert.deepEqual({ deadChoice: deadChoiceShown(), settings: shown("settings-sheet") }, { deadChoice: false, settings: false })
})

test("A05-M-518 넓은 배치: 채팅 크게 보기를 연 채 사망 선택 창이 뜸 (7명 판) → 크게 보기 닫힘, 관전 계속을 골라도 저절로 안 뜸", async () => {
    useWideScreen()
    await page({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE" })
    await open("채팅 크게 보기")
    assert.equal(closeupShown(), true, "크게 보기가 안 열림 (준비 잘못)")
    await selfDiesBySnapshot(7)
    assert.equal(deadChoiceShown(), true, "사망 선택 창이 안 뜸 (준비 잘못)")
    assert.equal(closeupShown(), false, "크게 보기가 사망 선택 창 위에 남음")
    await open("관전 계속하기")
    assert.equal(closeupShown(), false, "관전 계속 뒤 크게 보기가 저절로 다시 뜸")
})
