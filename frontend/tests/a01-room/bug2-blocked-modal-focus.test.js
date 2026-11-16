// 시작 막힘 창 초점 되돌리기 시험: 창을 닫으면 초점이 연 단추로 돌아감(몸통으로 안 빠짐), 연 단추가 사라졌으면 그대로 둠
// 목록 A01a "화면 PC" A01-F-733~735, 브라우저 A01-E-091 "Enter로 닫으면 초점이 body로 빠짐"
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup, act } = await import("@testing-library/react")
const { default: GameStartBlockedModal } = await import("../../src/domains/game/matching/components/GameStartBlockedModal.jsx")

test.afterEach(() => cleanup())

const MESSAGE = "아직 준비하지 않은 참가자가 있습니다."

// 대기방처럼 "게임시작" 단추를 누르면 막힘 글이 뜨는 틀 (showStart 끄면 단추가 사라짐)
// starting 켜면 단추가 꺼진 채(요청 중)로 그림
function Room({ showStart = true, starting = false }) {
  const [message, setMessage] = React.useState(null)
  return React.createElement(
    "div",
    null,
    showStart ? React.createElement("button", { type: "button", disabled: starting, onClick: () => setMessage(MESSAGE) }, "게임시작") : null,
    React.createElement(GameStartBlockedModal, { message, onClose: () => setMessage(null) }),
  )
}
// 초점 자리 이름 (실패 글용)
const focusName = () => document.activeElement?.textContent || document.activeElement?.tagName

test("A01-F-733 게임시작 → 막힘 창 → 확인으로 닫음 → 초점이 다시 게임시작 단추", async () => {
  render(React.createElement(Room))
  const start = screen.getByRole("button", { name: "게임시작" })
  start.focus()
  fireEvent.click(start)
  await act(async () => {})
  assert.ok(document.activeElement === screen.getByRole("button", { name: "확인" }), `열린 뒤 초점: ${focusName()}`)
  fireEvent.click(screen.getByRole("button", { name: "확인" }))
  await act(async () => {})
  assert.ok(document.querySelector("[data-game-start-blocked]") === null, "창이 안 닫힘")
  assert.ok(document.activeElement === start, `닫은 뒤 초점: ${focusName()}`)
})

test("A01-F-734 닫기 전에 연 단추가 사라짐 → 초점을 억지로 옮기지 않음(오류 없이 몸통)", async () => {
  const view = render(React.createElement(Room))
  const start = screen.getByRole("button", { name: "게임시작" })
  start.focus()
  fireEvent.click(start)
  await act(async () => {})
  view.rerender(React.createElement(Room, { showStart: false }))
  fireEvent.click(screen.getByRole("button", { name: "확인" }))
  await act(async () => {})
  assert.ok(document.activeElement === document.body, `닫은 뒤 초점: ${focusName()}`)
})

test("A01-F-735 요청 중 게임시작이 꺼지며 초점이 몸통으로 빠진 뒤 막힘 창 → 닫으면 다시 켜진 게임시작 단추로", async () => {
  const view = render(React.createElement(Room))
  const start = screen.getByRole("button", { name: "게임시작" })
  start.focus()
  // 요청 중 단추 꺼짐 → 브라우저가 초점을 몸통으로 뺌 (jsdom은 안 빼서 꺼지기 전에 blur로 흉내)
  start.blur()
  view.rerender(React.createElement(Room, { starting: true }))
  assert.ok(document.activeElement === document.body, "준비 잘못: 초점이 몸통이 아님")
  // 거절 → 단추 다시 켜짐 + 막힘 창
  view.rerender(React.createElement(Room, { starting: false }))
  fireEvent.click(start)
  await act(async () => {})
  fireEvent.click(screen.getByRole("button", { name: "확인" }))
  await act(async () => {})
  assert.ok(document.activeElement === start, `닫은 뒤 초점: ${focusName()}`)
})
