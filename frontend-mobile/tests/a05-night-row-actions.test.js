// 모바일 밤 행동 줄 시험: "건너뛰기"는 내 차례에만 켜져 보이고, 남 차례엔 없음
// 목록 A05a 모바일 A05-M-004 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-night-row-actions.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { fakeSocket, fire, renderPage, resetGame, rowButtons, seat, turnEnded, turnStarted } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

test("A05-M-004 행 단추 '건너뛰기': 내 차례 = 켜짐, 남 차례 = 없음 (7명 의사 화면)", async () => {
    const socket = fakeSocket()
    seat({ n: 7, role: "DOCTOR", phase: "NIGHT" })
    view = await renderPage(socket)
    await fire(socket, "night_turn_started", turnStarted({ role: "JOKER" }))
    assert.ok(!rowButtons().some((b) => b.name === "건너뛰기"), `광대 차례인데 건너뛰기가 보임: ${JSON.stringify(rowButtons())}`)
    await fire(socket, "night_turn_ended", turnEnded({ role: "JOKER" }))
    await fire(socket, "night_turn_started", turnStarted({ role: "DOCTOR" }))
    const skip = rowButtons().find((b) => b.name === "건너뛰기")
    assert.ok(skip, `내 차례인데 건너뛰기가 없음: ${JSON.stringify(rowButtons())}`)
    assert.equal(skip.enabled, true, "내 차례 건너뛰기가 꺼짐")
})
