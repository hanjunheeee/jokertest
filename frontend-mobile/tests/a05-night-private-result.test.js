// 모바일 밤 개인 결과 창 시험: 조사 결과 글에 닉네임·직업 이름("확인"으로 닫힘), 암살 실패 글, 글이 비면 창 없음
// 목록 A05a 모바일 A05-M-005~007 (돌리기: frontend-mobile 폴더에서 node --test tests/a05-night-private-result.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { buttonNamed, click, flush, textOf, waitUntil } from "./a00-kit.mjs"
import { GAME, NAMES, fakeSocket, fire, renderPage, resetGame, seat, turnEnded, turnStarted, uuidOf } from "./a00-game.mjs"

const { default: NightPrivateResultOverlay } = await import("@m/domains/game/ingame/components/overlays/NightPrivateResultOverlay.jsx")

let view = null
afterEach(() => { resetGame(view); view = null })

const resultBox = () => document.querySelector("[data-ingame-night-private-result]")

// 밤 끝 차례대로 받기: 마지막 차례 끝 → 판정 끝 → 내 결과
async function endNightWith(socket, lastRole, fields) {
    await fire(socket, "night_turn_started", turnStarted({ role: lastRole }))
    await fire(socket, "night_turn_ended", turnEnded({ role: lastRole }))
    await fire(socket, "night_actions_resolved", { gameId: GAME, dayIndex: 1 })
    await fire(socket, "night_action_result", { gameId: GAME, dayIndex: 1, ...fields })
}

test("A05-M-005 조사 결과 창 (8명 경비원): 글에 닉네임·직업 이름, '확인' 누르면 닫힘", async () => {
    const socket = fakeSocket()
    seat({ n: 8, role: "GUARD", phase: "NIGHT" })
    view = await renderPage(socket)
    await endNightWith(socket, "GUARD", { actionType: "INVESTIGATE", targetId: uuidOf(2), role: "JOKER" })
    const box = resultBox()
    assert.ok(box, "조사 결과 창이 없음")
    assert.ok(textOf(box).includes(NAMES[2]), `닉네임이 없음: ${textOf(box)}`)
    assert.ok(textOf(box).includes("광대"), `직업 이름이 없음: ${textOf(box)}`)
    click(buttonNamed("확인", box))
    await flush()
    await waitUntil(() => resultBox() === null, { label: "확인 뒤 결과 창 닫힘" })
})

test("A05-M-006 암살 실패 창 (6명 광대): '이번 밤의 암살이 실패했습니다.'", async () => {
    const socket = fakeSocket()
    seat({ n: 6, role: "JOKER", allies: [], phase: "NIGHT" })
    view = await renderPage(socket)
    await endNightWith(socket, "DOCTOR", { actionType: "ASSASSINATE", success: false })
    const box = resultBox()
    assert.ok(box, "암살 실패 창이 없음")
    assert.ok(textOf(box).includes("이번 밤의 암살이 실패했습니다."), `글: ${textOf(box)}`)
})

test("A05-M-007 [지금 동작] 글이 비면 창 안 뜸: 열림 + 빈 글 → 창 없음", () => {
    view = { unmount: render(React.createElement(NightPrivateResultOverlay, { open: true, kind: "INVESTIGATE", label: "", onConfirm: () => {} })).unmount }
    assert.ok(resultBox() === null, "빈 글인데 결과 창이 뜸")
    assert.ok(document.querySelector('[role="dialog"]') === null, "빈 글인데 창이 뜸")
})
