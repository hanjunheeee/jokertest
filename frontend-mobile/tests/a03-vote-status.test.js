// 모바일 투표 현황 창 시험: 낮 판정 결과 글 4가지([버그 9] 포함), 다음 날 낮이면 "집계 전", 첫 줄 이름표 "투표 가능"
// 목록 A03 모바일 A03-M-001~004·012·013 (돌리기: frontend-mobile 폴더에서 node --test tests/a03-vote-status.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush } from "./a00-kit.mjs"
import { confirmEntrances, dayResolved, fakeSocket, fire, nextDay, renderPage, resetGame, seat, tribunalResolved, uuidOf } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const statusDialog = () => document.querySelector('[role="dialog"][aria-label="투표 현황"]')
const cell = (name) => statusDialog()?.querySelector(`[data-testid="vote-status-${name}"]`)?.textContent.trim() ?? null

// n명 판 1일 투표 중 모바일 화면, 행동 줄 "투표 현황"으로 창을 열어 둠
async function openStatus(n) {
    const socket = fakeSocket()
    seat({ n, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(socket)
    click(buttonNamed("투표 현황 열기"))
    await flush()
    assert.ok(statusDialog(), "투표 현황 창이 안 열림")
    return socket
}

const CASES = [
    ["A03-M-001", "재판 회부", 6, { outcome: "TRIBUNAL", alive: 6, abstain: 1, target: uuidOf(2), tribunalDeadline: Date.now() + 60_000 }],
    ["A03-M-002", "동점", 6, { outcome: "TIE", alive: 6, abstain: 0 }],
    ["A03-M-003", "기권이 많아 재판 없음", 7, { outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 }],
    ["A03-M-004", "전원 기권", 6, { outcome: "ABSTAINED", alive: 6, abstain: 6 }],
]
for (const [id, label, n, spec] of CASES) {
    const tag = id === "A03-M-003" ? " [버그 9]" : ""
    test(`${id}${tag} 모바일 투표 현황 결과 글: ${spec.outcome} → "${label}"`, async () => {
        const socket = await openStatus(n)
        await fire(socket, "day_vote_resolved", dayResolved(spec))
        // 재판이 열리면 투표 현황 창은 닫힘 (재판 창의 유죄·무죄 단추를 가려서, A04-M-013) → 재판이 끝난 뒤(무죄 → 밤) 다시 열어 결과 글을 봄
        if (spec.outcome === "TRIBUNAL") {
            await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: 2, outcome: "NOT_GUILTY" }))
            await confirmEntrances()
            click(buttonNamed("투표 현황 열기"))
            await flush()
        }
        assert.equal(cell("outcome"), label)
    })
}

test("A03-M-012 새 날 현황: 1일 결과(전원 기권) 뒤 2일 낮 → '집계 전'", async () => {
    const socket = await openStatus(6)
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAINED", alive: 6, abstain: 6 }))
    assert.equal(cell("outcome"), "전원 기권", "1일 결과가 먼저 안 보임")
    await fire(socket, "night_result_applied", nextDay({ n: 6, dayIndex: 2, deadline: Date.now() + 60_000 }))
    if (!statusDialog()) {
        click(buttonNamed("투표 현황 열기"))
        await flush()
    }
    assert.equal(cell("unresolved"), "집계 전")
    assert.equal(cell("outcome"), null, "2일 낮인데 1일 결과가 남음")
})

// 첫 줄 값이 산 사람 수(기권 포함)라 이름표를 "투표 가능"으로 봄 (사용자 결정 2026-11-17, 이름표만 바꿈)
test("A03-M-013 7명 판 1표 6기권 판정 뒤 → 첫 줄 이름표 '투표 가능' 값 7, 기권 6, '득표' 이름표 없음", async () => {
    const socket = await openStatus(7)
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 }))
    const terms = [...(statusDialog()?.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent.trim())
    const voteTerm = statusDialog()?.querySelector('[data-testid="vote-status-public-vote-count"]')?.previousElementSibling?.textContent.trim() ?? null
    assert.deepEqual(
        { voteTerm, voteValue: cell("public-vote-count"), abstainValue: cell("public-abstain-count"), hasOldTerm: terms.includes("득표") },
        { voteTerm: "투표 가능", voteValue: "7", abstainValue: "6", hasOldTerm: false },
    )
})
