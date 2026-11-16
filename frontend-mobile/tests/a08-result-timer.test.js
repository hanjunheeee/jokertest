// 모바일 결과 화면 남은 시간 시험: 닫힘 = 지금 + 180초 → 남은 시간 칸 "180초"
// 목록 A08 모바일 A08-M-005 (돌리기: frontend-mobile 폴더에서 node --test tests/a08-result-timer.test.js)
import "./helpers/mobileLoader.mjs"
import { React } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { textOf, waitUntil } from "./a00-kit.mjs"
import { endGame, fakeSocket, renderRoute, resetGame, seat, skipIntro } from "./a00-game.mjs"

const { default: GameResultPage } = await import("@m/domains/game/result/pages/GameResultPage.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

test("A08-M-005 남은 초 표시: 닫힘 = 지금 + 180초 → result-close-timer '180초', data-seconds-left 180", async () => {
    const socket = fakeSocket()
    seat({ n: 5, phase: "DAY" })
    endGame({ roles: ["CITIZEN", "JOKER", "CITIZEN", "DOCTOR", "CITIZEN"], winner: "CITIZEN", closesAt: Date.now() + 180_000 })
    view = await renderRoute(socket, React.createElement(GameResultPage), { path: "/gameresult" })
    await skipIntro()
    await waitUntil(() => document.querySelector('[data-testid="result-close-timer"]'), { label: "남은 시간 칸" })
    const timer = document.querySelector('[data-testid="result-close-timer"]')
    assert.equal(timer.getAttribute("data-seconds-left"), "180")
    assert.ok(textOf(timer).includes("180초"), `글: ${textOf(timer)}`)
})
