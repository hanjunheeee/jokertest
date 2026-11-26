// 모바일 재판 전환과 열어 둔 겹 창 시험: 재판이 열리면 투표 현황·설정·전적·참가자 목록 시트가 닫히고, 동점 판정이면 투표 현황 창이 유지됨
// 목록 A04 모바일 A04-M-013·015 (돌리기: frontend-mobile 폴더에서 node --test tests/a04-goG2-tribunal-cover.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, waitUntil } from "./a00-kit.mjs"
import { dayResolved, fakeSocket, fire, openRoster, renderPage, resetGame, rosterSheet, seat, tribunalBox, tribunalEntry, tribunalSheet } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 겹 창이 떠 있는지 (body로 띄운 것까지 찾음) — 비교엔 참거짓·글만 넣음 (화면 요소를 넣으면 실패 글 만들다 메모리가 터짐)
const statusDialog = () => document.querySelector('[role="dialog"][aria-label="투표 현황"]')
// 재판 창: 피고 등장 연출이나 최후의 변론 시트 중 하나라도 떠 있음
const tribunalShown = () => tribunalBox() !== null || tribunalSheet() !== null
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

test("A04-M-013 재판 진입 시 열어 둔 투표 현황·설정·참가자 목록 시트가 저절로 닫힘 (6명 판)", async () => {
    const socket = await dayVotePage(6)
    await open("투표 현황 열기")
    await open("인게임 설정")
    await openRoster()
    assert.ok(statusDialog(), "투표 현황 창이 안 열림")
    assert.ok(document.querySelector('[data-testid="settings-sheet"]'), "설정 시트가 안 열림")
    assert.ok(rosterSheet(), "참가자 목록 시트가 안 열림")
    await fire(socket, "day_vote_resolved", tribunalEntry({ n: 6, defendant: 2 }))
    assert.equal(tribunalShown(), true, "재판 연출이 안 뜸")
    await waitUntil(() => statusDialog() === null && document.querySelector('[data-testid="settings-sheet"]') === null && rosterSheet() === null, {
        label: "재판 시작 시 열어 둔 시트 닫힘",
    })
})

test("A04-M-015 재판 없는 판정이면 투표 현황 창 그대로 (5명 판): 동점 → 밤 → 창 남고 결과 \"동점\"", async () => {
    const socket = await dayVotePage(5)
    await open("투표 현황 열기")
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TIE", alive: 5, abstain: 0 }))
    assert.equal(tribunalShown(), false, "동점인데 재판 창이 뜸 (준비 잘못)")
    assert.equal(outcomeText(), "동점")
})
