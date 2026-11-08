// 설정 숫자 고르기 줄(StepperRow) 값 목록·단위·끝에서 멈춤 시험
import "../helpers/mobileLoader.mjs"
import { render, React, act } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

const { default: StepperRow } = await import("@m/domains/game/shared/settings/StepperRow.jsx")
const { SETTING_LOOKS } = await import("@m/domains/game/shared/settings/settingLooks.js")
const LOOK = Object.keys(SETTING_LOOKS)[0]

function mount(props) {
    const changes = []
    const view = render(React.createElement(StepperRow, { look: LOOK, label: "토론 시간", onChange: (v) => changes.push(v), ...props }))
    const minus = view.container.querySelector('[aria-label="토론 시간 감소"]')
    const plus = view.container.querySelector('[aria-label="토론 시간 증가"]')
    const shown = () => view.container.querySelector("[aria-live]").textContent
    return { view, changes, minus, plus, shown }
}

test("지금 값을 단위 붙여 보임", () => {
    const { view, shown } = mount({ value: 60, min: 30, max: 120, step: 30, unit: "초" })
    assert.equal(shown(), "60초")
    view.unmount()
})

test("증가·감소는 간격만큼 다음 값으로 onChange", () => {
    const { view, changes, minus, plus } = mount({ value: 60, min: 30, max: 120, step: 30, unit: "초" })
    act(() => plus.click())
    act(() => minus.click())
    assert.deepEqual(changes, [90, 30])
    view.unmount()
})

test("최소값이면 감소 꺼짐, 최대값이면 증가 꺼짐", () => {
    const low = mount({ value: 4, min: 4, max: 8 })
    assert.equal(low.minus.disabled, true)
    assert.equal(low.plus.disabled, false)
    low.view.unmount()
    const high = mount({ value: 8, min: 4, max: 8 })
    assert.equal(high.plus.disabled, true)
    act(() => high.plus.click())
    assert.deepEqual(high.changes, [])
    high.view.unmount()
})

test("목록에 없는 값(옛 설정 45)은 제자리에 끼워 그대로 보임", () => {
    const { view, changes, minus, plus, shown } = mount({ value: 45, min: 30, max: 120, step: 30, unit: "초" })
    assert.equal(shown(), "45초")
    act(() => plus.click())
    act(() => minus.click())
    assert.deepEqual(changes, [60, 30])
    view.unmount()
})

test("단위 없으면 숫자만", () => {
    const { view, shown } = mount({ value: 5, min: 1, max: 9 })
    assert.equal(shown(), "5")
    view.unmount()
})

test("값이 숫자가 아니면 첫 값 자리로 보임", () => {
    const { view, shown, changes, plus } = mount({ value: undefined, min: 2, max: 4 })
    assert.equal(shown(), "2")
    act(() => plus.click())
    assert.deepEqual(changes, [3])
    view.unmount()
})
