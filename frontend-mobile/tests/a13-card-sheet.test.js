// 모바일 카드 시트 시험: 누를 항목이 없는 칸(토론 중 내 칸)을 탭하면 시트가 안 뜸, 폰 세로 플레이어 목록엔 그 줄에 단추가 안 붙음
// 목록 A13 모바일 A13-M-004 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-card-sheet.test.js)
// 카드 판·카드 시트는 넓은 배치(폰 가로·태블릿)에만 있음, 폰 세로는 플레이어 목록 시트 줄 (2026-11-24 새 배치)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { click, flush } from "./a00-kit.mjs"
import { boardSlot, fakeSocket, openRoster, renderPage, resetGame, rosterRow, seat, wideLayout } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

test("A13-M-004 항목 없는 칸은 카드 시트 안 뜸 (5명 판): 토론 중 내 칸 탭 → 시트 없음, 폰 세로 목록 내 줄엔 행동 단추 없음", async () => {
    wideLayout(true)
    seat({ n: 5, phase: "DAY", dayPhase: "DAY_DISCUSSION", deadline: Date.now() + 60_000 })
    view = await renderPage(fakeSocket())
    const mine = boardSlot(0)
    assert.ok(mine, "내 칸이 없음")
    click(mine)
    await flush()
    assert.ok(document.querySelector("[data-ingame-player-card-menu]") === null, "항목 없는 칸인데 카드 시트가 뜸")
    assert.ok(document.querySelector('[role="menu"][aria-label="플레이어 행동"]') === null)

    // 폰 세로: 같은 판을 카톡형으로 → 플레이어 목록 내 줄
    resetGame(view)
    seat({ n: 5, phase: "DAY", dayPhase: "DAY_DISCUSSION", deadline: Date.now() + 60_000 })
    view = await renderPage(fakeSocket())
    await openRoster()
    assert.ok(rosterRow(0), "목록에 내 줄이 없음")
    assert.equal(rosterRow(0).querySelectorAll('[role="menuitem"]').length, 0, "항목 없는 내 줄에 행동 단추가 붙음")
})
