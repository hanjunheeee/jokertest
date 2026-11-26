// 모바일 행동 줄 시험: "낮 집계" 단추 없음, 5초 동안 기권 켜짐, 죽은 사람에겐 기권·준비 단추 꺼짐, 사람 찍은 뒤에도 기권 전환 켜짐
// 목록 A03 모바일 A03-M-007~010·014 (돌리기: frontend-mobile 폴더에서 node --test tests/a03-row-actions.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, pageText } from "./a00-kit.mjs"
import { fakeSocket, fire, openRoster, renderPage, resetGame, rosterItems, rosterRow, rowButtons, seat, settle, uuidOf } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

// 6명 판 1일 낮 모바일 화면 (dead = 나 죽음)
async function dayPage({ dayPhase = "DAY_VOTE", dead = false } = {}) {
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY", dayPhase, dead: dead ? [0] : [], deadline: Date.now() + 60_000 })
    view = await renderPage(socket)
    return socket
}
const rowNames = () => rowButtons().map((b) => b.name)

test("A03-M-007 모바일 행동 줄 '낮 집계' 없음: 투표 단계 → '낮 집계' 단추 없음", async () => {
    await dayPage()
    assert.ok(rowButtons().length > 0, "행동 줄이 안 그려짐")
    assert.ok(!rowNames().some((n) => n.includes("낮 집계")), `행동 줄: ${rowNames().join(" | ")}`)
    assert.ok(!pageText().includes("낮 집계"))
})

test("A03-M-008 5초 중 행동 줄: 당김 중 → '낮 집계' 없음, 기권 켜짐", async () => {
    const socket = await dayPage()
    await fire(socket, "phase_settle_started", settle({ phase: "DAY", dayIndex: 1, deadline: Date.now() + 5_000 }))
    assert.ok(!rowNames().some((n) => n.includes("낮 집계")), `행동 줄: ${rowNames().join(" | ")}`)
    const abstain = rowButtons().find((b) => b.name === "기권")
    assert.ok(abstain, "기권 단추가 없음")
    assert.equal(abstain.enabled, true, "5초 동안 기권이 꺼짐")
})

// 지금 화면은 죽은 사람에게도 기권 단추를 그리되 꺼 둠 (PC 구석 패널과 같은 조건) → 눌리는 것이 없으면 됨
// 폰 세로는 카드 띠 대신 플레이어 목록 시트 줄에 같은 항목이 붙음 (2026-11-24 새 배치)
test("A03-M-009 죽은 사람 행동 줄: 죽은 나 → 기권 단추 꺼짐, 플레이어 목록을 열어도 눌리는 '투표하기' 없음", async () => {
    await dayPage({ dead: true })
    const abstain = rowButtons().find((b) => b.name === "기권")
    assert.ok(!abstain || abstain.enabled === false, `죽은 사람 행동 줄에 눌리는 기권이 있음: ${JSON.stringify(rowButtons())}`)
    // 사망 후 선택 창이 먼저 떠서 화면을 막음 → 관전 계속
    click(buttonNamed("관전 계속하기"))
    await flush()
    await openRoster()
    assert.ok(rosterRow(2), "목록에 2번 자리 줄이 없음")
    assert.ok(!rosterItems(2).some((item) => item.name === "투표하기" && item.enabled), `목록 줄: ${JSON.stringify(rosterItems(2))}`)
})

// 준비 단추도 죽은 사람에겐 꺼진 채 보임 (지금 화면)
test("A03-M-010 토론 준비 단추: 산 사람 토론 → '투표 시작 준비' 켜짐, 죽은 사람 → 꺼짐", async () => {
    await dayPage({ dayPhase: "DAY_DISCUSSION" })
    const ready = rowButtons().find((b) => b.name === "투표 시작 준비")
    assert.ok(ready, `산 사람에게 준비 단추가 없음: ${rowNames().join(" | ")}`)
    assert.equal(ready.enabled, true)
    resetGame(view)
    view = null
    await dayPage({ dayPhase: "DAY_DISCUSSION", dead: true })
    const deadReady = rowButtons().find((b) => b.name === "투표 시작 준비")
    assert.ok(!deadReady || deadReady.enabled === false, `죽은 사람 행동 줄에 눌리는 준비 단추가 있음: ${JSON.stringify(rowButtons())}`)
})

// 사람을 찍은 뒤에도 기권으로 바로 바꿀 수 있게 켜 두고, 이미 기권했을 때만 끔 (결정.md:429)
test("A03-M-014 낸 표에 따른 기권 단추: 2번을 찍음 → 켜짐(기권 전환 가능), 이미 기권 → 꺼짐, 아직 안 냄 → 켜짐", async () => {
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE", self: { hasSubmittedDayVote: true, dayVoteTargetUuid: uuidOf(2) } })
    view = await renderPage(fakeSocket())
    assert.equal(rowButtons().find((b) => b.name === "기권")?.enabled, true, "사람을 찍은 뒤 기권 전환이 막힘")
    resetGame(view)
    view = null
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE", self: { hasSubmittedDayVote: true, dayVoteTargetUuid: null } })
    view = await renderPage(fakeSocket())
    assert.equal(rowButtons().find((b) => b.name === "기권")?.enabled, false, "이미 기권했는데 기권이 켜짐")
    resetGame(view)
    view = null
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE" })
    view = await renderPage(fakeSocket())
    assert.equal(rowButtons().find((b) => b.name === "기권")?.enabled, true, "아직 안 냈는데 기권이 꺼짐")
})
