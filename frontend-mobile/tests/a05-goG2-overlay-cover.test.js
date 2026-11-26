// 모바일 밤 안내·전면 연출 시트 닫힘·밤 진입 사유 4가지 시험
// 목록 A05b 모바일 A05-M-513~516 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-goG2-overlay-cover.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { confirmEntrances, dayResolved, fakeSocket, fire, nextDay, renderPage, resetGame, seat, useInGameStore } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 창이 떠 있는지 (참거짓만 비교에 넣음 — 화면 요소를 넣으면 실패 글 만들다 메모리가 터짐)
const shown = (id) => document.querySelector(`[data-testid="${id}"]`) !== null
const dialogShown = (label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`) !== null
const entranceShown = () => dialogShown("단계 전환 안내")
const voteStatusShown = () => dialogShown("투표 현황")

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
// 낮 판정(동점) → 밤: "밤이 되었습니다" 안내가 뜸
const toNight = (socket, n) => fire(socket, "day_vote_resolved", dayResolved({ outcome: "TIE", alive: n, abstain: 0 }))

test("A05-M-513 죽은 사람의 밤 안내는 잠그지 않음 (7명 판, 나는 죽음): 설정 시트를 연 채 밤이 됨 → 설정 시트 그대로", async () => {
    const socket = await page({ n: 7, phase: "DAY", dayPhase: "DAY_VOTE", dead: [0] })
    // 죽은 채 들어오면 사망 선택 창이 먼저 뜸 → 관전 계속을 골라 닫음
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

test("A05-M-515 산 사람의 전면 연출(밤 안내·낮 시작 결과)이 뜨면 열어 둔 시트·투표 현황 창이 닫힘", async () => {
    const socket = await page({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    await open("인게임 설정")
    assert.equal(shown("settings-sheet"), true, "설정 시트가 안 열림")
    await toNight(socket, 6)
    await waitUntil(() => !shown("settings-sheet"), { label: "잠그는 밤 안내 시 설정 시트 닫힘" })
    await confirmEntrances()
    await open("투표 현황 열기")
    assert.equal(voteStatusShown(), true, "투표 현황 창이 안 열림")
    await fire(socket, "night_result_applied", nextDay({ n: 6, dayIndex: 2, deadline: Date.now() + 60_000 }))
    await waitUntil(() => !voteStatusShown(), { label: "낮 시작 결과 연출 시 투표 현황 창 닫힘" })
})

test("A05-M-516 밤 진입 안내 창 사유 4가지 표시: 동점·기권 과반·전원 기권·피고 연결 끊김", async () => {
    const cases = [
        ["TIE", 0, "최다 득표가 동점이라 재판이 열리지 않았습니다"],
        ["ABSTAIN_MAJORITY", 5, "기권이 많아 재판이 열리지 않았습니다"],
        ["ABSTAINED", 6, "모두 기권하여 재판이 열리지 않았습니다"],
        ["DEFENDANT_DISCONNECTED", 1, "재판 대상의 연결이 끊겨 재판이 열리지 않았습니다"],
    ]
    for (const [outcome, abstain, expected] of cases) {
        const socket = await page({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
        await fire(socket, "day_vote_resolved", dayResolved({ outcome, alive: 6, abstain }))
        const reasonEl = document.querySelector("[data-ingame-phase-entrance-reason]")
        assert.ok(reasonEl, `${outcome} 밤 안내에 사유 줄이 없음`)
        assert.equal(textOf(reasonEl), expected)
        resetGame(view)
        view = null
    }
})
