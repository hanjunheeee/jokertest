// 모바일 밤 시간 줄 시험: 직업이 다 고르면(마감 5초로 당김) 시간 줄 명패가 "5초 뒤 마감"·남은 초 5 이하로 바뀜
// 목록 A05b 모바일 A05-M-506 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-settle-timebar.test.js)
// 시간 줄 = 명패+타이머 한 줄(timebar/PhaseTimerStrip, 접기·펼치기 없이 늘 보임, 2026-11-24 새 배치)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { textOf } from "./a00-kit.mjs"
import { fakeSocket, fire, isHiddenByLayout, renderPage, resetGame, seat, settle, turnStarted } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const timebar = () => document.querySelector("[data-ingame-phase-timer-mobile]")

// 당김 표시 칸 값(data-ingame-phase-settle)은 지금 화면에 없음 → 명패 글·남은 초로만 봄
test("A05-M-506 시간 줄 '5초 뒤 마감' (7명): 밤 차례 시간 줄 + phase_settle_started(NIGHT) → 명패 '5초 뒤 마감' 글·남은 초 5 이하", async () => {
    const socket = fakeSocket()
    seat({ n: 7, role: "DOCTOR", phase: "NIGHT" })
    view = await renderPage(socket)
    await fire(socket, "night_turn_started", turnStarted({ role: "JOKER", seconds: 60 }))
    const bar = timebar()
    assert.ok(bar, "시간 줄이 없음")
    assert.ok(!textOf(bar).includes("5초 뒤 마감"), `당기기 전부터 5초 글: ${textOf(bar)}`)
    await fire(socket, "phase_settle_started", settle({ phase: "NIGHT", dayIndex: 1, role: "JOKER", deadline: Date.now() + 5_000 }))
    const settled = timebar()
    assert.ok(settled, "당긴 뒤 시간 줄이 없음")
    assert.ok(textOf(settled).includes("5초 뒤 마감"), `시간 줄 글: ${textOf(settled)}`)
    const clock = textOf(settled.querySelector("[role=timer]")).match(/(\d{2}):(\d{2})/)
    assert.ok(clock, `시간 줄의 남은 시간이 없음: ${textOf(settled)}`)
    assert.ok(Number(clock[1]) * 60 + Number(clock[2]) <= 5, `남은 초가 5보다 큼: ${clock[0]}`)
    assert.ok(!isHiddenByLayout(settled), "당겼는데 시간 줄 자리가 숨겨진 채(hidden)로 남음")
})
