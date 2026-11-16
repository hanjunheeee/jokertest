// 모바일 밤 조작 줄 시험: 광대·의사·경비원·마녀사냥꾼 어느 차례에도 "밤 종료" 단추가 없음
// 목록 A05b 모바일 A05-M-507 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-night-row.test.js)
import "./helpers/mobileLoader.mjs"
import "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { pageText } from "./a00-kit.mjs"
import { fakeSocket, fire, renderPage, resetGame, rowButtons, seat, turnEnded, turnStarted } from "./a00-game.mjs"

let view = null
afterEach(() => { resetGame(view); view = null })

test("A05-M-507 '밤 종료' 줄 단추 없음 (10명): 광대·의사·경비원·마녀사냥꾼 차례 조작 줄 → '밤 종료' 없음", async () => {
    for (const role of ["JOKER", "DOCTOR", "GUARD", "WITCH_HUNTER"]) {
        const socket = fakeSocket()
        // 내 직업 = 그 차례 직업 (내 차례 조작 줄을 봄), 마녀사냥꾼은 둘째 밤
        const dayIndex = role === "WITCH_HUNTER" ? 2 : 1
        seat({ n: 10, role, allies: [], phase: "NIGHT", dayIndex, dead: role === "WITCH_HUNTER" ? [5] : [] })
        view = await renderPage(socket)
        await fire(socket, "night_turn_started", turnStarted({ role, dayIndex }))
        assert.ok(rowButtons().length > 0, `${role} 차례 조작 줄이 안 그려짐`)
        assert.ok(!rowButtons().some((b) => b.name.includes("밤 종료")), `${role} 차례 조작 줄: ${JSON.stringify(rowButtons())}`)
        assert.ok(!pageText().includes("밤 종료"), `${role} 차례 화면에 '밤 종료' 글`)
        await fire(socket, "night_turn_ended", turnEnded({ role, dayIndex }))
        resetGame(view)
        view = null
    }
})
