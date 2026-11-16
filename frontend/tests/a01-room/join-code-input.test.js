// 화면 상태 시험: 방 코드 입력 칸 값 — 소문자는 대문자로, 영문·숫자 말고는 지움, 6자까지만
// 목록 A01-F-585~587 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md), 돌리기: node --experimental-test-module-mocks --test tests/a01-room/join-code-input.test.js
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const { renderHook, act, cleanup } = await import("@testing-library/react")
const { useRoomCodeInput } = await import("../../src/domains/game/mode/hooks/useRoomCodeInput.js")

test.afterEach(() => cleanup())

// 칸 훅 그리기, 바뀐 코드 값을 모음
function setup(value = "") {
  const changes = []
  const view = renderHook(() => useRoomCodeInput({ value, onChange: (next) => changes.push(next), autoFocus: false }))
  return { view, changes }
}

test("A01-F-585 코드 칸에 abc234 입력 → 값 ABC234", () => {
  const { view, changes } = setup()
  act(() => view.result.current.handleChange(0, { target: { value: "abc234" } }))
  assert.equal(changes.at(-1), "ABC234")
})

test("A01-F-586 [지금 동작] 칸에 A-B 2 입력 → 영문·숫자 말고는 지워 AB2", () => {
  const { view, changes } = setup()
  act(() => view.result.current.handleChange(0, { target: { value: "A-B 2" } }))
  assert.equal(changes.at(-1), "AB2")
})

test("A01-F-587 ABCDEFGH 붙여넣기 → 6자까지만 ABCDEF", () => {
  const { view, changes } = setup()
  act(() => view.result.current.handlePaste({ preventDefault() {}, clipboardData: { getData: () => "ABCDEFGH" } }))
  assert.equal(changes.at(-1), "ABCDEF")
})

test("A01-F-737 [버그] 화면이 뜨고 0.28초 안에 이미 칸에 치기 시작함 → 자동 초점이 첫 칸으로 끌고 가지 않음 (앞 글자를 덮어쓰지 않게)", async () => {
  const React = await import("react")
  const { render, screen } = await import("@testing-library/react")
  const { default: RoomCodeInput } = await import("../../src/domains/game/mode/components/RoomCodeInput.jsx")
  render(React.createElement(RoomCodeInput, { value: "7HY", onChange: () => {}, autoFocus: true }))
  // 자동 초점(0.28초)보다 먼저 사람이 셋째 칸까지 침 → 넷째 칸에 초점
  const fourth = screen.getByRole("textbox", { name: "방 코드 4번째 자리" })
  fourth.focus()
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.equal(document.activeElement?.getAttribute("aria-label"), "방 코드 4번째 자리")
})
