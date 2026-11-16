// 모바일 행동 줄 시험: "낮 집계" 단추 없음, 5초 동안 기권 켜짐, 죽은 사람에겐 표·기권·준비 단추 없음
// 목록 A03 모바일 A03-M-007~010 (돌리기: frontend-mobile 폴더에서 node --test tests/a03-row-actions.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { click, flush, pageText } from "./a00-kit.mjs"
import { fakeSocket, fire, renderPage, resetGame, rowButtons, seat, settle, sheetItems, stripSlot } from "./a00-game.mjs"

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

// 카드 시트의 '투표하기'는 PC 카드 메뉴와 같은 항목이라 죽은 사람에겐 꺼진 채 까닭 글과 같이 보임 (PC A13-F-246과 같은 규칙) → 눌리는 것이 없으면 됨
test("A03-M-009 죽은 사람 행동 줄: 죽은 나 → 기권 단추 없음, 카드를 눌러도 눌리는 '투표하기' 없음", async () => {
    await dayPage({ dead: true })
    assert.ok(!rowNames().includes("기권"), `죽은 사람 행동 줄에 기권이 있음: ${JSON.stringify(rowButtons())}`)
    click(stripSlot(2))
    await flush()
    assert.ok(!sheetItems().some((item) => item.name === "투표하기" && item.enabled), `카드 시트: ${JSON.stringify(sheetItems())}`)
})

test("A03-M-010 토론 준비 단추: 산 사람 토론 → '투표 시작 준비', 죽은 사람 → 없음", async () => {
    await dayPage({ dayPhase: "DAY_DISCUSSION" })
    const ready = rowButtons().find((b) => b.name === "투표 시작 준비")
    assert.ok(ready, `산 사람에게 준비 단추가 없음: ${rowNames().join(" | ")}`)
    assert.equal(ready.enabled, true)
    resetGame(view)
    view = null
    await dayPage({ dayPhase: "DAY_DISCUSSION", dead: true })
    assert.ok(!rowNames().includes("투표 시작 준비"), `죽은 사람 행동 줄에 준비 단추가 있음: ${JSON.stringify(rowButtons())}`)
})
