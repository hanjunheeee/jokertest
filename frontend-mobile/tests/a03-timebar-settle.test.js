// 모바일 시간 줄 시험: 표가 다 차 마감이 당겨지면 명패에 "[5초 뒤 마감]"·남은 초 5 이하, 보통 투표엔 그 글 없음
// 시간 줄 = 명패+타이머 한 줄(timebar/PhaseTimerStrip, 접기·펼치기 없음, 2026-11-24 새 배치)
// 목록 A03 모바일 A03-M-005·006·011 (돌리기: frontend-mobile 폴더에서 node --test tests/a03-timebar-settle.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { pageText, textOf } from "./a00-kit.mjs"
import { fakeSocket, fire, isHiddenByLayout, renderPage, resetGame, seat, settle } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const timebar = () => document.querySelector("[data-ingame-phase-timer-mobile]")

// 6명 판 1일 투표 중 (마감 60초 뒤), settled면 표가 다 차 마감이 5초 뒤로 당겨짐
async function votePage({ settled }) {
    const socket = fakeSocket()
    seat({ n: 6, phase: "DAY", dayPhase: "DAY_VOTE", deadline: Date.now() + 60_000 })
    view = await renderPage(socket)
    if (settled) await fire(socket, "phase_settle_started", settle({ phase: "DAY", dayIndex: 1, deadline: Date.now() + 5_000 }))
    return socket
}

test("A03-M-005 모바일 시간 줄 당김 표시: 당김 상태 → '[5초 뒤 마감]'", async () => {
    await votePage({ settled: true })
    assert.ok(timebar(), "시간 줄이 없음")
    assert.ok(textOf(timebar()).includes("[5초 뒤 마감]"), `시간 줄 글: ${textOf(timebar())}`)
})

test("A03-M-006 당김 없음: 보통 투표 → '[5초 뒤 마감]'·'5초 뒤 마감' 없음", async () => {
    await votePage({ settled: false })
    assert.ok(timebar(), "시간 줄이 없음")
    assert.ok(!pageText().includes("5초 뒤 마감"), "당김이 없는데 5초 글이 보임")
})

// 당김 표시 칸 값(data-ingame-phase-settle)은 지금 화면에 없음 → 명패 글·남은 초로만 봄
test("A03-M-011 당기면 시간 줄에 남은 초: 당김 알림 → 시간 줄(화면에 보임)·명패 '[5초 뒤 마감]'·남은 초 5 이하", async () => {
    await votePage({ settled: true })
    const bar = timebar()
    assert.ok(bar, "시간 줄이 없음")
    assert.ok(textOf(bar).includes("[5초 뒤 마감]"), `시간 줄 글: ${textOf(bar)}`)
    // 남은 시간 MM:SS (타이머 칸 role=timer)
    const clock = textOf(bar.querySelector("[role=timer]")).match(/(\d{2}):(\d{2})/)
    assert.ok(clock, `시간 줄의 남은 시간이 없음: ${textOf(bar)}`)
    const sec = Number(clock[1]) * 60 + Number(clock[2])
    assert.ok(sec <= 5, `남은 초가 5보다 큼: ${sec}`)
    // 폰 세로 화면에서 시간 줄 자리가 숨겨져 있으면 안 보임
    assert.ok(!isHiddenByLayout(bar), "당겼는데 시간 줄 자리가 숨겨진 채(hidden)로 남음")
})
