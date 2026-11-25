// 모바일 재판 창 시험: 피고 카드·유죄·무죄, [버그 8] 둘째 날 단추, 피고·죽은 사람·완료 안내, "재판 판정" 단추 없음, 명단에 피고 없을 때
// 목록 A04 모바일 A04-M-001~005·008·011 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-tribunal-gate.test.js)
// 폰 세로 재판: 피고 등장 연출(이름·카드, 단추 없음)이 잠시 뒤 저절로 닫히고, 채팅방 "최후의 변론" 단추로 연 시트에 피고 카드·유죄·무죄·안내 글 (2026-11-24 새 배치)
// 표 거절·시간 초과 글 자리는 지금 시트에 없음 → 그 시험(A04-M-006·007)은 뺌
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, pageText, textOf } from "./a00-kit.mjs"
import {
    NAMES, GAME, confirmEntrances, dayPhaseChanged, fakeSocket, fire, nextDay, openTribunalSheet, renderPage, resetGame, rowButtons, seat, selfProgress,
    tribunalBox, tribunalEntry, tribunalResolved, tribunalSheet, useInGameStore,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// n명 판 1일 투표 → 재판 (피고 자리 defendant), 나는 0번 자리, 죽은 나는 사망 후 선택 창에서 관전 계속을 먼저 고름
async function tribunalPage({ n, me = 0, defendant = 3, dead = [], acks = {} }) {
    const socket = fakeSocket({ acks })
    seat({ n, me, phase: "DAY", dayPhase: "DAY_VOTE", dead })
    view = await renderPage(socket)
    if (dead.includes(me)) {
        click(buttonNamed("관전 계속하기"))
        await flush()
    }
    await fire(socket, "day_vote_resolved", tribunalEntry({ n, defendant }))
    return socket
}
const inSheet = (name) => (tribunalSheet() ? buttonNamed(name, tribunalSheet()) : null)
const sheetText = () => textOf(tribunalSheet())

test("A04-M-001 재판 창이 뜸 (6명 판): 재판 상태 → 피고 등장 연출(이름·카드) → 최후의 변론 시트에 피고 카드·'유죄'·'무죄'", async () => {
    await tribunalPage({ n: 6, defendant: 3 })
    assert.ok(tribunalBox(), "피고 등장 연출이 없음")
    assert.ok(textOf(tribunalBox()).includes(`${NAMES[3]} 님이 범인으로 지목됐습니다.`), `연출 글: ${textOf(tribunalBox())}`)
    assert.ok(tribunalBox().querySelector(`[data-tribunal-defendant="p3"]`), "연출에 피고 카드가 없음")
    await openTribunalSheet()
    assert.ok(tribunalSheet().querySelector(`[data-tribunal-defendant="p3"]`), "시트에 피고 카드가 없음")
    assert.ok(sheetText().includes(NAMES[3]), `피고 이름이 없음: ${sheetText()}`)
    assert.ok(inSheet("유죄"), `유죄 단추가 없음: ${buttonNames(tribunalSheet()).join(" | ")}`)
    assert.ok(inSheet("무죄"), "무죄 단추가 없음")
})

test("A04-M-002 [버그 8] 2일 재판 단추 (7명 판): 1일 냄 → 2일 낮 → 2일 재판 → 단추 켜짐, 완료 글 없음", async () => {
    const socket = await tribunalPage({ n: 7, defendant: 3, acks: { cast_tribunal_vote: { ok: true, gameId: GAME, dayIndex: 1, vote: "GUILTY" } } })
    await openTribunalSheet()
    click(inSheet("유죄"))
    await flush()
    await fire(socket, "session_self_progress", selfProgress({ phase: "TRIBUNAL", dayIndex: 1, self: { hasSubmittedTribunalVote: true }, required: 6 }))
    assert.ok(sheetText().includes("투표가 완료되었습니다."), "1일 표가 안 들어감")
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 3, outcome: "NOT_GUILTY", dayIndex: 1 }))
    await fire(socket, "night_result_applied", nextDay({ n: 7, dayIndex: 2, deadline: Date.now() + 60_000 }))
    // "지난밤 아무 일도 일어나지 않았습니다" 등 안내 창은 사람처럼 확인으로 닫음 (떠 있으면 시트가 안 열림)
    await confirmEntrances()
    await fire(socket, "day_phase_changed", dayPhaseChanged({ dayIndex: 2, deadline: Date.now() + 60_000 }))
    socket.acks.cast_tribunal_vote = { ok: true, gameId: GAME, dayIndex: 2, vote: "GUILTY" }
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 7, defendant: 4, dayIndex: 2 }))
    assert.ok(tribunalBox(), "2일 재판 연출이 없음")
    await openTribunalSheet()
    for (const name of ["유죄", "무죄"]) {
        assert.ok(inSheet(name), `2일 ${name} 단추가 없음: ${sheetText()}`)
        assert.equal(inSheet(name).disabled, false, `2일 ${name} 단추가 꺼짐`)
    }
    assert.ok(!sheetText().includes("투표가 완료되었습니다."), "2일 재판에 1일 완료 글이 남음")
})

test("A04-M-003 피고 글 (5명 판): 내가 피고 → 단추 없음 + 피고 안내", async () => {
    await tribunalPage({ n: 5, defendant: 0 })
    assert.ok(tribunalBox(), "피고 등장 연출이 없음")
    assert.ok(!buttonNamed("유죄", tribunalBox()) && !buttonNamed("무죄", tribunalBox()), "연출에 단추가 보임")
    await openTribunalSheet()
    assert.ok(!inSheet("유죄") && !inSheet("무죄"), "피고에게 단추가 보임")
    assert.ok(sheetText().includes("당신은 피고인입니다. 투표할 수 없습니다."), `피고 안내가 없음: ${sheetText()}`)
})

test("A04-M-004 죽은 사람 글 (8명 판): 내가 죽음 → 사망 안내", async () => {
    await tribunalPage({ n: 8, defendant: 3, dead: [0] })
    assert.ok(tribunalBox(), "피고 등장 연출이 없음")
    await openTribunalSheet()
    assert.ok(!inSheet("유죄") && !inSheet("무죄"), "죽은 사람에게 단추가 보임")
    assert.ok(sheetText().includes("사망한 참가자는 투표할 수 없습니다."), `사망 안내가 없음: ${sheetText()}`)
})

test("A04-M-005 완료 글 (6명 판): 냄 → '투표가 완료되었습니다.'", async () => {
    const socket = await tribunalPage({ n: 6, defendant: 3, acks: { cast_tribunal_vote: { ok: true, gameId: GAME, dayIndex: 1, vote: "NOT_GUILTY" } } })
    await openTribunalSheet()
    click(inSheet("무죄"))
    await flush()
    await fire(socket, "session_self_progress", selfProgress({ phase: "TRIBUNAL", dayIndex: 1, self: { hasSubmittedTribunalVote: true }, required: 5 }))
    assert.ok(sheetText().includes("투표가 완료되었습니다."), `완료 글이 없음: ${sheetText()}`)
    assert.ok(!inSheet("유죄") && !inSheet("무죄"), "낸 뒤에도 단추가 남음")
})

test("A04-M-008 '재판 판정' 단추 없음 (6명 판): 재판 중 행동 줄·피고 등장 연출·최후의 변론 시트 → '재판 판정' 없음", async () => {
    await tribunalPage({ n: 6, defendant: 3 })
    assert.ok(tribunalBox(), "피고 등장 연출이 없음")
    assert.ok(!buttonNames(tribunalBox()).some((n) => n.includes("재판 판정")))
    await openTribunalSheet()
    assert.ok(!rowButtons().some((b) => b.name.includes("재판 판정")), `행동 줄: ${JSON.stringify(rowButtons())}`)
    assert.ok(!buttonNames(tribunalSheet()).some((n) => n.includes("재판 판정")))
    assert.ok(!pageText().includes("재판 판정"))
})

// 판 명단에 없는 피고면 "알 수 없는 플레이어" 카드로 연출·시트를 띄움 (useTribunalPresentation, 옛 화면은 창을 안 띄웠음)
test("A04-M-011 [지금 동작] 판 명단에 피고가 없으면 '알 수 없는 플레이어'로 창이 뜸 (7명 판): 명단에 없는 피고 → 연출·시트에 그 이름", async () => {
    const socket = fakeSocket()
    seat({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 7, defendant: "p-ghost" }))
    // 판은 재판 단계로 넘어감 (스토어 값)
    assert.equal(useInGameStore.getState().state?.phase, "TRIBUNAL", "재판 단계로 안 넘어감")
    assert.ok(tribunalBox(), "명단에 없는 피고인데 연출이 안 뜸")
    assert.ok(textOf(tribunalBox()).includes("알 수 없는 플레이어 님이 범인으로 지목됐습니다."), `연출 글: ${textOf(tribunalBox())}`)
    await openTribunalSheet()
    assert.ok(sheetText().includes("알 수 없는 플레이어"), `시트 글: ${sheetText()}`)
})
