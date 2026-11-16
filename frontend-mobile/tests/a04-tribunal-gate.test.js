// 모바일 재판 창 시험: 피고 카드·유죄·무죄, [버그 8] 둘째 날 단추, 피고·죽은 사람·완료 안내, 거절·시간 초과 글, "재판 판정" 단추 없음, 명단에 피고 없을 때
// 목록 A04 모바일 A04-M-001~008·011 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-tribunal-gate.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, buttonNames, click, flush, pageText, textOf } from "./a00-kit.mjs"
import {
    NAMES, GAME, dayPhaseChanged, fakeSocket, fire, nextDay, renderPage, resetGame, rowButtons, seat, selfProgress,
    tick, tribunalBox, tribunalEntry, tribunalResolved, useInGameStore,
} from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// n명 판 1일 투표 → 재판 (피고 자리 defendant), 나는 0번 자리
async function tribunalPage({ n, me = 0, defendant = 3, dead = [], acks = {} }) {
    const socket = fakeSocket({ acks })
    seat({ n, me, phase: "DAY", dayPhase: "DAY_VOTE", dead })
    view = await renderPage(socket)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n, defendant }))
    return socket
}
const inBox = (name) => (tribunalBox() ? buttonNamed(name, tribunalBox()) : null)
const boxText = () => textOf(tribunalBox())

test("A04-M-001 재판 창이 뜸 (6명 판): 재판 상태 → 피고 카드·'유죄'·'무죄'", async () => {
    await tribunalPage({ n: 6, defendant: 3 })
    assert.ok(tribunalBox(), "재판 창이 없음")
    assert.ok(boxText().includes(NAMES[3]), `피고 카드 이름이 없음: ${boxText()}`)
    assert.ok(inBox("유죄"), `유죄 단추가 없음: ${buttonNames(tribunalBox()).join(" | ")}`)
    assert.ok(inBox("무죄"), "무죄 단추가 없음")
})

test("A04-M-002 [버그 8] 2일 재판 단추 (7명 판): 1일 냄 → 2일 낮 → 2일 재판 → 단추 켜짐, 완료 글 없음", async () => {
    const socket = await tribunalPage({ n: 7, defendant: 3, acks: { cast_tribunal_vote: { ok: true, gameId: GAME, dayIndex: 1, vote: "GUILTY" } } })
    click(inBox("유죄"))
    await flush()
    await fire(socket, "session_self_progress", selfProgress({ phase: "TRIBUNAL", dayIndex: 1, self: { hasSubmittedTribunalVote: true }, required: 6 }))
    assert.ok(boxText().includes("투표가 완료되었습니다."), "1일 표가 안 들어감")
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 3, outcome: "NOT_GUILTY", dayIndex: 1 }))
    await fire(socket, "night_result_applied", nextDay({ n: 7, dayIndex: 2, deadline: Date.now() + 60_000 }))
    await fire(socket, "day_phase_changed", dayPhaseChanged({ dayIndex: 2, deadline: Date.now() + 60_000 }))
    socket.acks.cast_tribunal_vote = { ok: true, gameId: GAME, dayIndex: 2, vote: "GUILTY" }
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 7, defendant: 4, dayIndex: 2 }))
    assert.ok(tribunalBox(), "2일 재판 창이 없음")
    for (const name of ["유죄", "무죄"]) {
        assert.ok(inBox(name), `2일 ${name} 단추가 없음: ${boxText()}`)
        assert.equal(inBox(name).disabled, false, `2일 ${name} 단추가 꺼짐`)
    }
    assert.ok(!boxText().includes("투표가 완료되었습니다."), "2일 재판에 1일 완료 글이 남음")
})

test("A04-M-003 피고 글 (5명 판): 내가 피고 → 단추 없음 + 피고 안내", async () => {
    await tribunalPage({ n: 5, defendant: 0 })
    assert.ok(tribunalBox(), "재판 창이 없음")
    assert.ok(!inBox("유죄") && !inBox("무죄"), "피고에게 단추가 보임")
    assert.ok(boxText().includes("당신은 피고인입니다. 투표할 수 없습니다."), `피고 안내가 없음: ${boxText()}`)
})

test("A04-M-004 죽은 사람 글 (8명 판): 내가 죽음 → 사망 안내", async () => {
    await tribunalPage({ n: 8, defendant: 3, dead: [0] })
    assert.ok(tribunalBox(), "재판 창이 없음")
    assert.ok(!inBox("유죄") && !inBox("무죄"), "죽은 사람에게 단추가 보임")
    assert.ok(boxText().includes("사망한 참가자는 투표할 수 없습니다."), `사망 안내가 없음: ${boxText()}`)
})

test("A04-M-005 완료 글 (6명 판): 냄 → '투표가 완료되었습니다.'", async () => {
    const socket = await tribunalPage({ n: 6, defendant: 3, acks: { cast_tribunal_vote: { ok: true, gameId: GAME, dayIndex: 1, vote: "NOT_GUILTY" } } })
    click(inBox("무죄"))
    await flush()
    await fire(socket, "session_self_progress", selfProgress({ phase: "TRIBUNAL", dayIndex: 1, self: { hasSubmittedTribunalVote: true }, required: 5 }))
    assert.ok(boxText().includes("투표가 완료되었습니다."), `완료 글이 없음: ${boxText()}`)
    assert.ok(!inBox("유죄") && !inBox("무죄"), "낸 뒤에도 단추가 남음")
})

test("A04-M-006 [버그 8] 거절 까닭 글 (7명 판): TRIBUNAL_ALREADY_RESOLVED → role=alert '재판이 이미 판정되어 투표할 수 없습니다.'", async () => {
    await tribunalPage({ n: 7, defendant: 3, acks: { cast_tribunal_vote: { ok: false, code: "TRIBUNAL_ALREADY_RESOLVED" } } })
    click(inBox("유죄"))
    await flush()
    const alert = document.querySelector('[data-ingame-tribunal-vote-error][role="alert"]')
    assert.ok(alert, `거절 글이 없음: ${pageText().slice(0, 300)}`)
    assert.equal(textOf(alert), "재판이 이미 판정되어 투표할 수 없습니다.")
})

test("A04-M-007 응답 없음 글 (10명 판): 5초 → '요청 시간이 초과되었습니다.'", async () => {
    await tribunalPage({ n: 10, defendant: 3, acks: { cast_tribunal_vote: "never" } })
    mock.timers.enable({ apis: ["setTimeout"] })
    click(inBox("유죄"))
    await tick(4_999)
    assert.ok(!pageText().includes("요청 시간이 초과되었습니다."), "5초 전에 시간 초과 글이 뜸")
    await tick(1)
    mock.timers.reset()
    await flush()
    const alert = document.querySelector("[data-ingame-tribunal-vote-error]")
    assert.ok(alert, "시간 초과 글이 없음")
    assert.equal(textOf(alert), "요청 시간이 초과되었습니다.")
})

test("A04-M-008 '재판 판정' 단추 없음 (6명 판): 재판 중 행동 줄·재판 창 → '재판 판정' 없음", async () => {
    await tribunalPage({ n: 6, defendant: 3 })
    assert.ok(tribunalBox(), "재판 창이 없음")
    assert.ok(!rowButtons().some((b) => b.name.includes("재판 판정")), `행동 줄: ${JSON.stringify(rowButtons())}`)
    assert.ok(!buttonNames(tribunalBox()).some((n) => n.includes("재판 판정")))
    assert.ok(!pageText().includes("재판 판정"))
})

test("A04-M-011 [지금 동작] 판 명단에 피고가 없으면 창이 안 뜸 (7명 판): 명단에 없는 피고 → 재판 창 없음", async () => {
    const socket = fakeSocket()
    seat({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 7, defendant: "p-ghost" }))
    // 판은 재판 단계로 넘어갔는데 (스토어 값)
    assert.equal(useInGameStore.getState().state?.phase, "TRIBUNAL", "재판 단계로 안 넘어감")
    assert.ok(tribunalBox() === null, "명단에 없는 피고인데 재판 창이 뜸")
})
