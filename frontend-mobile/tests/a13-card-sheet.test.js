// 모바일 카드 시트 시험: 누를 항목이 없는 칸(토론 중 내 칸)을 탭하면 시트가 안 뜸
// 목록 A13 모바일 A13-M-004 (돌리기: frontend-mobile 폴더에서 node --test tests/a13-card-sheet.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { click, flush } from "./a00-kit.mjs"
import { fakeSocket, renderPage, resetGame, seat, stripSlot } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

test("A13-M-004 항목 없는 칸은 카드 시트 안 뜸 (5명 판): 토론 중 내 칸 탭 → 시트 없음", async () => {
    seat({ n: 5, phase: "DAY", dayPhase: "DAY_DISCUSSION", deadline: Date.now() + 60_000 })
    view = await renderPage(fakeSocket())
    const mine = stripSlot(0)
    assert.ok(mine, "내 칸이 없음")
    click(mine)
    await flush()
    assert.ok(document.querySelector("[data-ingame-player-card-menu]") === null, "항목 없는 칸인데 카드 시트가 뜸")
    assert.ok(document.querySelector('[role="menu"][aria-label="플레이어 행동"]') === null)
})
