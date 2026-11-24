// 단계 타이머 판(명패+시간패널) 화면 부품 시험: 시간 바 자리·채팅 자리, 단계 글 있음·없음, 입장 준비 중 빈 명패, 남은 초 MM:SS
// 목록 A03-낮투표.md 번호 A03-F-281~285 (시간 바 펼침 단추를 없애고 늘 명패+타이머를 보이게 바꾼 것), 돌리기(frontend): node --experimental-test-module-mocks --test tests/a03-day-vote/timer-panel.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const RTL = await import("@testing-library/react")
const { default: InGamePhaseTurnTimerPanel } = await import("../../src/domains/game/ingame/components/timebar/InGamePhaseTurnTimerPanel.jsx")
const { INGAME_TIMER_PLACEMENT } = await import("../../src/domains/game/ingame/constants/timebar/ingameTimerPlacement.js")
const h = React.createElement

test.afterEach(() => RTL.cleanup())

const panel = () => document.querySelector("[data-ingame-phase-timer]")
const strip = () => document.querySelector("[data-ingame-chat-phase-timer-strip]")
const plateText = () => strip()?.querySelector("p")?.textContent ?? null
const clock = () => strip()?.querySelector('[role="timer"]')?.textContent ?? null

test("A03-F-281 시간 바 자리 + 단계 글 \"[5초 뒤 마감]\" + 남은 25초 → 명패에 그 글, 타이머 00:25, 판 표시 timebar-embedded", () => {
  RTL.render(h(InGamePhaseTurnTimerPanel, {
    statusLabel: "[5초 뒤 마감]", remainingSec: 25, placement: INGAME_TIMER_PLACEMENT.TIMEBAR, embeddedLayout: "timebar",
  }))
  assert.equal(panel()?.getAttribute("data-ingame-phase-timer"), "timebar-embedded")
  assert.equal(panel()?.getAttribute("data-ingame-phase-timer-layout"), "timebar")
  assert.equal(plateText(), "[5초 뒤 마감]")
  assert.equal(clock(), "00:25")
})

test("A03-F-282 단계 글 없음(끝난 판 등) → 아무것도 안 그림", () => {
  const view = RTL.render(h(InGamePhaseTurnTimerPanel, { statusLabel: null, remainingSec: 10, placement: INGAME_TIMER_PLACEMENT.TIMEBAR }))
  assert.equal(view.container.innerHTML, "")
})

test("A03-F-283 단계 글 없음 + 입장 준비 중(showResourcesWithoutLabel) → 빈 명패 + 타이머 00:00", () => {
  RTL.render(h(InGamePhaseTurnTimerPanel, {
    statusLabel: null, remainingSec: null, placement: INGAME_TIMER_PLACEMENT.TIMEBAR, showResourcesWithoutLabel: true,
  }))
  assert.ok(strip() !== null, "명패+타이머 판 없음")
  assert.equal(plateText(), "")
  assert.equal(clock(), "00:00")
})

test("A03-F-284 채팅 자리(board) → 판 표시 chat-embedded·board, 남은 125초 → 02:05", () => {
  RTL.render(h(InGamePhaseTurnTimerPanel, {
    statusLabel: "[낮-토론]", remainingSec: 125, placement: INGAME_TIMER_PLACEMENT.CHAT, embeddedLayout: "board",
  }))
  assert.equal(panel()?.getAttribute("data-ingame-phase-timer"), "chat-embedded")
  assert.equal(panel()?.getAttribute("data-ingame-phase-timer-layout"), "board")
  assert.equal(plateText(), "[낮-토론]")
  assert.equal(clock(), "02:05")
})

test("A03-F-285 남은 초가 음수(마감 지남) → 00:00, 음수 글 없음", () => {
  RTL.render(h(InGamePhaseTurnTimerPanel, { statusLabel: "[낮-투표]", remainingSec: -3, placement: INGAME_TIMER_PLACEMENT.TIMEBAR }))
  assert.equal(clock(), "00:00")
  assert.equal(clock().includes("-"), false)
})
