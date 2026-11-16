// 모바일 밤 시간 줄 시험: 직업이 다 고르면(마감 5초로 당김) 접힌 시간 줄이 저절로 펼쳐지고 "5초 뒤 마감" 글
// 목록 A05b 모바일 A05-M-506 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-settle-timebar.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { textOf } from "./a00-kit.mjs"
import { fakeSocket, fire, isHiddenByLayout, renderPage, resetGame, seat, settle, turnStarted } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

test("A05-M-506 시간 줄 '5초 뒤 마감' (7명): 접힌 시간 줄 + phase_settle_started(NIGHT) → 저절로 펼쳐 [data-ingame-phase-settle], '5초 뒤 마감' 글", async () => {
    const socket = fakeSocket()
    seat({ n: 7, role: "DOCTOR", phase: "NIGHT" })
    view = await renderPage(socket)
    await fire(socket, "night_turn_started", turnStarted({ role: "JOKER", seconds: 60 }))
    const bar = document.querySelector("[data-ingame-timebar]")
    assert.ok(bar, "시간 줄이 없음")
    assert.ok(isHiddenByLayout(bar), "처음부터 시간 줄이 펼쳐져 있음 (접힌 상태에서 시작해야 함)")
    await fire(socket, "phase_settle_started", settle({ phase: "NIGHT", dayIndex: 1, role: "JOKER", deadline: Date.now() + 5_000 }))
    const settled = document.querySelector("[data-ingame-timebar][data-ingame-phase-settle]")
    assert.ok(settled, "당김 표시가 없음")
    assert.ok(textOf(settled).includes("5초 뒤 마감"), `시간 줄 글: ${textOf(settled)}`)
    assert.ok(!isHiddenByLayout(settled), "당겼는데 시간 줄 자리가 접힌 채(hidden)로 남음")
})
