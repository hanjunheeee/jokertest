// 모바일 시간 줄 시험: 표가 다 차 마감이 당겨지면 "[5초 뒤 마감]"과 저절로 펼친 시간 줄, 보통 투표엔 그 글 없음
// 목록 A03 모바일 A03-M-005·006·011 (돌리기: frontend-mobile 폴더에서 node --test tests/a03-timebar-settle.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { pageText, textOf } from "./a00-kit.mjs"
import { fakeSocket, fire, isHiddenByLayout, renderPage, resetGame, seat, settle } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

const timebar = () => document.querySelector("[data-ingame-timebar]")

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
    assert.ok(!timebar().hasAttribute("data-ingame-phase-settle"))
})

test("A03-M-011 당기면 저절로 펼침: 당김 알림 → 펼친 시간 줄(화면에 보임)·남은 초 5 이하", async () => {
    await votePage({ settled: true })
    const bar = timebar()
    assert.ok(bar, "시간 줄이 없음")
    assert.ok(bar.hasAttribute("data-ingame-phase-settle"), "당김 표시가 없음")
    // 남은 시간 MM:SS (펼친 시간 줄에만 있음)
    const clock = textOf(bar).match(/(\d{2}):(\d{2})/)
    assert.ok(clock, `펼친 시간 줄의 남은 시간이 없음: ${textOf(bar)}`)
    const sec = Number(clock[1]) * 60 + Number(clock[2])
    assert.ok(sec <= 5, `남은 초가 5보다 큼: ${sec}`)
    // 폰 세로 화면에서 시간 줄 자리가 접혀 숨겨져 있으면 안 보임
    assert.ok(!isHiddenByLayout(bar), "당겼는데 시간 줄 자리가 접힌 채(hidden)로 남음")
})
