// 모바일 방 목록 카드 시험: 코드 방은 "코드" 배지, 꽉 찬 방은 "마감"이고 눌러 들어갈 수 없음
// 목록 A01a 모바일 A01-M-006 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-room-card.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { textOf } from "./a00-kit.mjs"

const { default: RoomCard } = await import("@m/domains/game/mode/components/roomList/RoomCard.jsx")

let view = null
afterEach(() => { view?.unmount(); view = null })

// 목록에 오는 방 한 개 (코드 값은 목록에 안 실림)
function room(extra) {
    return { roomId: "r1", stage: 1, current: 3, max: 8, title: "가의 방", accessType: "public", displayStatus: "waiting", settings: {}, ...extra }
}

test("A01-M-006 모바일 목록 카드 배지: 코드 방 → '코드' 배지, 꽉 찬 방 → '마감'·눌러 들어가기 꺼짐", () => {
    let picked = 0
    view = render(React.createElement("ul", null,
        React.createElement(RoomCard, { room: room({ accessType: "code" }), selected: false, onSelect: () => { picked += 1 } })))
    const codeCard = view.container.querySelector("button")
    assert.match(textOf(codeCard), /코드/, "코드 배지가 없음")
    assert.equal(codeCard.disabled, false)

    view.rerender(React.createElement("ul", null,
        React.createElement(RoomCard, { room: room({ current: 8, displayStatus: "full" }), selected: false, onSelect: () => { picked += 1 } })))
    const fullCard = view.container.querySelector("button")
    assert.match(textOf(fullCard), /마감/, "마감 배지가 없음")
    assert.equal(fullCard.disabled, true, "꽉 찬 방 카드가 눌림")
    fullCard.click()
    assert.equal(picked, 0, "꽉 찬 방이 골라짐")
})
