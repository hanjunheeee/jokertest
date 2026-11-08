// 위 단계 줄 글자 줄이기(plainLabel)·남은 시간(shortClock) 시험: PhaseLine을 그려서 확인
// 남은 초는 가짜 값(usePhaseClock 바꿔 끼움)이라 시계 흔들림 없음
import { stubModule } from "../helpers/mobileLoader.mjs"
import { render, React } from "../helpers/dom.mjs"
import { test } from "node:test"
import assert from "node:assert/strict"

stubModule("/hooks/timebar/usePhaseClock.js", "export function usePhaseClock() { return globalThis.__phaseClock }")
const { default: PhaseLine } = await import("@m/domains/game/ingame/components/talk/PhaseLine.jsx")

function show(bar, props = {}) {
    globalThis.__phaseClock = bar
    const view = render(React.createElement(PhaseLine, { expanded: false, onToggle: () => {}, ...props }))
    const button = view.container.querySelector("[data-talk-phase-line]")
    const texts = [...button.querySelectorAll("span")].map((s) => s.textContent)
    view.unmount()
    return { button, texts }
}

test("[낮-토론과 투표] → 낮 토론 (첫 낱말 끝 '과' 뗌)", () => {
    const { texts } = show({ day: 2, statusLabel: "[낮-토론과 투표]", remainingSec: 45 })
    assert.deepEqual(texts, ["제 2일", "·", "낮 토론", "0:45"])
})

test("'와'로 끝나는 첫 낱말도 뗌, 세부 없으면 앞 글만", () => {
    assert.equal(show({ day: 1, statusLabel: "[밤-능력와 대화]", remainingSec: 5 }).texts[2], "밤 능력")
    assert.deepEqual(show({ day: 3, statusLabel: "[재판]", remainingSec: null }).texts, ["제 3일", "·", "재판"])
})

test("단계 글 없으면 점·글자 칸 안 그림", () => {
    assert.deepEqual(show({ day: 1, statusLabel: "", remainingSec: 30 }).texts, ["제 1일", "0:30"])
})

test("남은 시간: 분 앞 0 없음·초 두 자리·소수 버림", () => {
    assert.equal(show({ day: 1, statusLabel: "[낮-토론]", remainingSec: 125.9 }).texts.at(-1), "2:05")
    assert.equal(show({ day: 1, statusLabel: "[낮-토론]", remainingSec: 0 }).texts.at(-1), "0:00")
})

test("남은 시간이 숫자 아니거나 0보다 작으면 시간 칸 없음", () => {
    assert.deepEqual(show({ day: 1, statusLabel: "[낮-토론]", remainingSec: Number.NaN }).texts, ["제 1일", "·", "낮 토론"])
    assert.deepEqual(show({ day: 1, statusLabel: "[낮-토론]", remainingSec: -1 }).texts, ["제 1일", "·", "낮 토론"])
})

test("10초 이하면 급함 색, 11초면 보통", () => {
    globalThis.__phaseClock = { day: 1, statusLabel: "[낮-토론]", remainingSec: 10 }
    const urgent = render(React.createElement(PhaseLine, { expanded: false, onToggle: () => {} }))
    assert.match(urgent.container.querySelector(".font-mono").className, /text-\[#ff8a6a\]/)
    urgent.unmount()
    globalThis.__phaseClock = { day: 1, statusLabel: "[낮-토론]", remainingSec: 11 }
    const calm = render(React.createElement(PhaseLine, { expanded: false, onToggle: () => {} }))
    assert.doesNotMatch(calm.container.querySelector(".font-mono").className, /ff8a6a/)
    calm.unmount()
})

test("읽기 이름·펼침 상태: 접힘이면 펼치기, 펼침이면 접기", () => {
    const closed = show({ day: 2, statusLabel: "[낮-투표]", remainingSec: 3 }, { expanded: false }).button
    assert.equal(closed.getAttribute("aria-label"), "제 2일 낮 투표 진행 바 펼치기")
    assert.equal(closed.getAttribute("aria-expanded"), "false")
    const open = show({ day: 2, statusLabel: "[낮-투표]", remainingSec: 3 }, { expanded: true }).button
    assert.equal(open.getAttribute("aria-label"), "제 2일 낮 투표 진행 바 접기")
})

test("누르면 onToggle 한 번", () => {
    globalThis.__phaseClock = { day: 1, statusLabel: "[밤]", remainingSec: 9 }
    let count = 0
    const view = render(React.createElement(PhaseLine, { expanded: false, onToggle: () => { count += 1 } }))
    view.container.querySelector("button").click()
    assert.equal(count, 1)
    view.unmount()
})
