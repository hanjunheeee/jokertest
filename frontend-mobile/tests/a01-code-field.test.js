// 모바일 방 코드 입력칸 시험: 작은 글자로 쳐도 칸에는 대문자로 들어감
// 목록 A01b 모바일 A01-M-506 (돌리기: frontend-mobile 폴더에서 node --test tests/a01-code-field.test.js)
import "./helpers/mobileLoader.mjs"
import { React, render } from "./helpers/dom.mjs"
import { test, afterEach } from "node:test"
import assert from "node:assert/strict"
import { typeInto } from "./a00-kit.mjs"

const { default: CodeFrame } = await import("@m/domains/game/mode/components/roomCode/CodeFrame.jsx")

let view = null
afterEach(() => { view?.unmount(); view = null })

// 부르는 쪽처럼 값을 들고 있는 틀
function Holder() {
    const [value, setValue] = React.useState("")
    return React.createElement(CodeFrame, { value, onChange: setValue, onSubmit: () => {} })
}

test("A01-M-506 모바일 코드 칸 대문자: abc234 → ABC234", () => {
    view = render(React.createElement(Holder))
    const input = view.container.querySelector('input[aria-label="방 코드 6자리"]')
    assert.ok(input, "코드 입력칸이 없음")
    typeInto(input, "abc234")
    assert.equal(input.value, "ABC234")
    // 보이는 6칸 글자도 대문자
    const shown = [...view.container.querySelectorAll('[aria-hidden="true"] > span')].map((s) => s.textContent).join("")
    assert.equal(shown, "ABC234")
})
