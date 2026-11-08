// 역할 공개 창 10초 저절로 닫힘·확인 누르면 화면에서만 닫힘 시험 (가짜 시계)
// 양피지 창(ParchmentDialog)은 움직임 라이브러리를 피하려고 단순한 틀로 바꿔 끼움
import { stubModule } from "../helpers/mobileLoader.mjs"
import { render, React, act } from "../helpers/dom.mjs"
import { test, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

stubModule(
    "/components/overlays/parchment/ParchmentDialog.jsx",
    `import { createElement } from "react"
export default function ParchmentDialog({ open, onDismiss, confirmLabel, wrapperProps, children }) {
    if (!open) return null
    return createElement("div", { ...wrapperProps, "data-test-dialog": "" },
        children,
        createElement("button", { type: "button", onClick: onDismiss }, confirmLabel))
}`,
)
const { default: RoleRevealOverlay } = await import("@m/domains/game/ingame/components/overlays/RoleRevealOverlay.jsx")

const ROLE = { role: "DOCTOR", roleName: "의사", nickname: "철수", description: "밤마다 한 명을 살림", allies: [] }

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }))
afterEach(() => mock.timers.reset())

function mount(props) {
    const closes = []
    const element = (p) => React.createElement(RoleRevealOverlay, { onClose: () => closes.push(Date.now()), ...p })
    const view = render(element(props))
    return { view, closes, rerender: (p) => view.rerender(element(p)) }
}

test("열린 뒤 9.999초까진 안 닫고 10초에 onClose 한 번", () => {
    const { view, closes } = mount({ open: true, roleInfo: ROLE })
    act(() => mock.timers.tick(9_999))
    assert.equal(closes.length, 0)
    act(() => mock.timers.tick(1))
    assert.equal(closes.length, 1)
    act(() => mock.timers.tick(20_000))
    assert.equal(closes.length, 1)
    view.unmount()
})

test("확인 누르면 바로 onClose (서버에 따로 안 알림, 화면만 닫힘)", () => {
    const { view, closes } = mount({ open: true, roleInfo: ROLE })
    view.container.querySelector("button").click()
    assert.equal(closes.length, 1)
    view.unmount()
})

test("닫혀 있으면 시계 안 걸림", () => {
    const { view, closes } = mount({ open: false, roleInfo: ROLE })
    act(() => mock.timers.tick(15_000))
    assert.equal(closes.length, 0)
    assert.equal(view.container.querySelector("[data-test-dialog]"), null)
    view.unmount()
})

test("역할 정보 없으면 안 그리고 저절로 닫기도 안 함", () => {
    const { view, closes } = mount({ open: true, roleInfo: null })
    assert.equal(view.container.innerHTML, "")
    act(() => mock.timers.tick(15_000))
    assert.equal(closes.length, 0)
    view.unmount()
})

test("10초 전에 닫히면(open false) 시계 풀림", () => {
    const { view, closes, rerender } = mount({ open: true, roleInfo: ROLE })
    act(() => mock.timers.tick(5_000))
    rerender({ open: false, roleInfo: ROLE })
    act(() => mock.timers.tick(10_000))
    assert.equal(closes.length, 0)
    view.unmount()
})

test("다시 그려도(새 onClose) 시계는 처음부터 안 다시 셈", () => {
    const { view, closes, rerender } = mount({ open: true, roleInfo: ROLE })
    act(() => mock.timers.tick(6_000))
    rerender({ open: true, roleInfo: ROLE })
    act(() => mock.timers.tick(4_000))
    assert.equal(closes.length, 1)
    view.unmount()
})

test("닉네임·역할 이름·설명·역할 표시 값이 보임, 확인 글자 기본값", () => {
    const { view } = mount({ open: true, roleInfo: ROLE })
    const box = view.container.querySelector("[data-ingame-role-reveal]")
    assert.equal(box.getAttribute("data-ingame-role-reveal"), "DOCTOR")
    const text = box.textContent
    assert.ok(text.includes("철수") && text.includes("의사") && text.includes("밤마다 한 명을 살림"))
    assert.equal(view.container.querySelector("button").textContent, "확인")
    view.unmount()
})

test("동료 없으면 동료 광대 칸 없음", () => {
    const { view } = mount({ open: true, roleInfo: ROLE })
    assert.ok(!view.container.textContent.includes("동료 광대"))
    view.unmount()
})
