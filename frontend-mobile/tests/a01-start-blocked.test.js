// 모바일 대기방 "게임 시작 막힘" 안내 창 시험: 막힘 글이 오면 창에 제목·글, 글이 없으면 창 없음
// 목록 A01a 모바일 A01-M-004 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-start-blocked.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { textOf } from "./a00-kit.mjs"

const { default: StartBlockedSheet } = await import("@m/domains/game/matching/components/startBlocked/StartBlockedSheet.jsx")

let view = null
afterEach(() => { view?.unmount(); view = null })

const BLOCKED = "게임을 시작하기 위한 인원 조건을 만족하지 않습니다."

test("A01-M-004 모바일 시작 막힘 시트: 글이 오면 제목·글이 든 창, 글이 없으면 창 없음", () => {
    view = render(React.createElement(StartBlockedSheet, { message: BLOCKED, onClose: () => {} }))
    const box = document.querySelector("[data-game-start-blocked] [role=dialog]")
    assert.ok(box, "막힘 창이 없음")
    assert.match(textOf(box), /게임을 시작할 수 없습니다/, "제목이 없음")
    assert.equal(textOf(box.querySelector("[role=alert]")), BLOCKED)

    view.rerender(React.createElement(StartBlockedSheet, { message: "", onClose: () => {} }))
    assert.ok(document.querySelector("[data-game-start-blocked]") === null, "글이 없는데 창이 남음")
})
