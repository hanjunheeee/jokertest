// 모바일 투표 현황 창 시험: 판정 전 진행 수("N / M명 투표함"), 낮 판정 결과 글 5가지, 이름표("투표 가능"), 미발견 피고 안내 이름
// 목록 A03 모바일 A03-M-001~004·012·013·601~603 (돌리기: frontend-mobile 폴더에서 node --test tests/a03-vote-status.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, waitUntil } from "./a00-kit.mjs"
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
    await confirmEntrances()
    if (!statusDialog()) {
        click(buttonNamed("투표 현황 열기"))
        await flush()
    }
    assert.equal(cell("unresolved"), "집계 전")
    assert.equal(cell("outcome"), null, "2일 낮인데 1일 결과가 남음")
})

// 첫 줄 이름표는 의도 문서(결정.md:320)와 PC 화면대로 "투표 가능", 값은 서버 publicVoteCount 그대로
test("A03-M-013 7명 판 1표 6기권 판정 뒤 → 이름표 '투표 가능'·'기권'·'결과'·'재판 대상', 값 7·6·'기권이 많아 재판 없음'·'없음'", async () => {
    const socket = await openStatus(7)
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "ABSTAIN_MAJORITY", alive: 7, abstain: 6 }))
    const terms = [...(statusDialog()?.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent.trim())
    assert.deepEqual(
        {
            terms,
            voteValue: cell("public-vote-count"),
            abstainValue: cell("public-abstain-count"),
            outcome: cell("outcome"),
            target: cell("tribunal-target"),
        },
        { terms: ["투표 가능", "기권", "결과", "재판 대상"], voteValue: "7", abstainValue: "6", outcome: "기권이 많아 재판 없음", target: "없음" },
    )
})

// 공용 표 DAY_VOTE_OUTCOME_TEXTS에 있는 값이라 영어 값이 그대로 안 보임
test("A03-M-601 모바일 투표 현황 결과 글: DEFENDANT_DISCONNECTED (6명 판) → \"재판 대상의 연결이 끊겨 재판 없음\", 영어 값 없음", async () => {
    const socket = await openStatus(6)
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "DEFENDANT_DISCONNECTED", alive: 6, abstain: 1 }))
    assert.equal(cell("outcome"), "재판 대상의 연결이 끊겨 재판 없음")
    assert.ok(!statusDialog().textContent.includes("DEFENDANT_DISCONNECTED"), "영어 결과 값이 보임")
})

test("A03-M-602 투표 현황 창 닫기 (5명 판): 닫기 단추 → 창 없음, 행동 줄 '투표 현황 열기'로 다시 열림 (집계 전)", async () => {
    await openStatus(5)
    assert.equal(cell("unresolved"), "집계 전")
    const close = [...statusDialog().querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "투표 현황 닫기")
    assert.ok(close, "창 안 닫기 단추가 없음")
    click(close)
    await flush()
    await waitUntil(() => statusDialog() === null, { label: "투표 현황 창 닫힘" })
    click(buttonNamed("투표 현황 열기"))
    await flush()
    assert.ok(statusDialog(), "다시 안 열림")
    assert.equal(cell("unresolved"), "집계 전")
})

test("A03-M-603 집계 전 투표 진행 수('3 / 6명 투표함') 표시 및 명단 밖 재판 대상 생 UUID 미노출", async () => {
    const socket = fakeSocket()
    seat({
        n: 6,
        phase: "DAY",
        dayPhase: "DAY_VOTE",
        state: { progress: { kind: "DAY_VOTE", doneCount: 3, requiredCount: 6 } },
    })
    view = await renderPage(socket)
    click(buttonNamed("투표 현황 열기"))
    await flush()
    assert.equal(cell("unresolved"), "집계 전")
    assert.equal(cell("progress"), "3 / 6명 투표함")
    await fire(socket, "day_vote_resolved", dayResolved({ outcome: "TRIBUNAL", alive: 6, abstain: 0, target: "uuid-missing-999", tribunalDeadline: Date.now() + 60_000 }))
    await fire(socket, "tribunal_vote_resolved", tribunalResolved({ defendant: "uuid-missing-999", outcome: "NOT_GUILTY" }))
    await confirmEntrances()
    click(buttonNamed("투표 현황 열기"))
    await flush()
    assert.equal(cell("tribunal-target"), "알 수 없는 플레이어")
    assert.ok(!statusDialog().textContent.includes("uuid-missing-999"), "생 UUID가 보임")
})
