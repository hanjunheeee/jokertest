// AD-155 휴대폰 점검 큰 안내 시험: 가짜 소켓 신호로 큰 안내·띠·강제 종료 안내 (body로 뺀 창)
// 로직은 데스크톱 maintenance 것을 같이 씀, 여기선 휴대폰 화면 모양만 봄
import "../helpers/mobileLoader.mjs"
import { React, act, render } from "../helpers/dom.mjs"
import { test, mock, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"

const { default: MaintenanceNotice } = await import("@m/domains/maintenance/MaintenanceNotice.jsx")
const { useMaintenanceStore } = await import("@/domains/maintenance/store/maintenanceStore.js")

const NOW = Date.parse("2026-11-10T05:00:00.000Z")
const MIN = 60 * 1000

function fakeSocket() {
    const handlers = new Map()
    return {
        on: (event, fn) => handlers.set(event, [...(handlers.get(event) ?? []), fn]),
        off: (event, fn) => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== fn)),
        fire: (event, payload) => act(() => (handlers.get(event) ?? []).forEach((fn) => fn(payload))),
    }
}

const scheduled = (startsInMs) => ({
    state: "scheduled",
    message: "",
    startsAt: new Date(NOW + startsInMs).toISOString(),
    endsAt: null,
    serverNow: new Date(NOW).toISOString(),
    forceEndAtStart: true,
})

let view
let navigate
function draw() {
    const socket = fakeSocket()
    navigate = mock.fn()
    view = render(React.createElement(MaintenanceNotice, { socket, navigate }))
    return socket
}
const dialog = () => document.body.querySelector("[role=alertdialog]")
const band = () => document.body.querySelector("[data-maintenance-band]")
const click = (el) => act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true })))
const buttonIn = (root, name) => [...root.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith(name))

beforeEach(() => mock.timers.enable({ apis: ["setInterval", "Date"], now: NOW }))
afterEach(() => {
    view?.unmount()
    mock.timers.reset()
    useMaintenanceStore.getState().reset()
})

test("AD-155 휴대폰: 예약 → 가운데 큰 안내(남은 시간·강제 종료 문구), body에 띄움, 버튼에 초점", () => {
    const socket = draw()
    socket.fire("maintenance_notice", scheduled(20 * MIN))
    const box = dialog()
    assert.ok(box)
    assert.equal(box.closest("[data-maintenance-notice]").parentElement, document.body)
    assert.match(box.textContent, /점검 예정이에요/)
    assert.match(box.textContent, /20분 00초/)
    assert.match(box.textContent, /시각이 되면 진행 중 판이 강제로 끝나요/)
    assert.equal(document.activeElement, buttonIn(box, "확인했어요"))
})

test("AD-155 휴대폰: 닫으면 위쪽 띠(버튼 하나)에 남은 시간, 누르면 다시 크게", () => {
    const socket = draw()
    socket.fire("maintenance_notice", scheduled(20 * MIN))
    click(buttonIn(dialog(), "확인했어요"))
    assert.equal(dialog(), null)
    assert.equal(band().tagName, "BUTTON")
    assert.match(band().textContent, /점검까지 20분 00초/)
    act(() => mock.timers.tick(1000))
    assert.match(band().textContent, /19분 59초/)
    click(band())
    assert.ok(dialog())
})

test("AD-155 휴대폰: 점검으로 판 끝남 → 강제 종료 안내 → 로비로", () => {
    const socket = draw()
    socket.fire("game_ended", { gameId: "g-1", reason: "MAINTENANCE" })
    const box = dialog()
    assert.match(box.textContent, /점검으로 판이 끝났어요/)
    assert.match(box.textContent, /승패 없이 끝났어요/)
    click(buttonIn(box, "로비로 가기"))
    assert.deepEqual(navigate.mock.calls[0].arguments, ["/lobby", { replace: true }])
    assert.equal(dialog(), null)
})

test("AD-155 휴대폰: 취소(cleared) → 띠 사라짐", () => {
    const socket = draw()
    socket.fire("maintenance_notice", scheduled(20 * MIN))
    click(buttonIn(dialog(), "확인했어요"))
    socket.fire("maintenance_notice", { state: "cleared" })
    assert.equal(band(), null)
    assert.equal(dialog(), null)
})
