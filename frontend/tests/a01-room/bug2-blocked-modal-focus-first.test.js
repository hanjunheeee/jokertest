// 시작 막힘 창 초점 되돌리기 시험 (창이 처음 뜨는 경우): 창이 한 번도 안 뜬 화면에서 단추가 꺼지며 초점이 빠져도 닫으면 그 단추로
// 목록 A01a "화면 PC" A01-F-736·738, 브라우저 A01-E-091 — 다른 시험과 섞이면 앞 시험이 감시를 미리 붙여 버려서 파일을 따로 둠
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup, act } = await import("@testing-library/react")
const { default: GameStartBlockedModal } = await import("../../src/domains/game/matching/components/GameStartBlockedModal.jsx")

test.afterEach(() => cleanup())

const MESSAGE = "역할 구성이 맞지 않습니다."

// 대기방처럼 "게임시작" 단추 + 막힘 창 (starting 켜면 단추가 꺼진 채 = 요청 중)
function Room({ starting = false, message = null }) {
  return React.createElement(
    "div",
    null,
    React.createElement("button", { type: "button", disabled: starting }, "게임시작"),
    React.createElement(GameStartBlockedModal, { message, onClose: () => {} }),
  )
}
// 초점 자리 이름 (실패 글용)
const focusName = () => `${document.activeElement?.tagName} ${document.activeElement?.textContent ?? ""}`

test("A01-F-736 창이 처음 뜨는 화면: 요청 중 게임시작이 꺼지며 초점이 몸통으로 빠짐 → 거절 막힘 창 → 닫으면 게임시작 단추로", async () => {
  // 이 파일 안에서 막힘 창은 아직 한 번도 안 뜸 (실제 대기방에서 처음 누른 것과 같음)
  const view = render(React.createElement(Room))
  const start = screen.getByRole("button", { name: "게임시작" })
  start.focus()
  // 요청 중 단추 꺼짐 → 브라우저가 초점을 몸통으로 뺌 (jsdom은 안 빼서 꺼지기 전에 blur로 흉내)
  start.blur()
  view.rerender(React.createElement(Room, { starting: true }))
  assert.ok(document.activeElement === document.body, "준비 잘못: 초점이 몸통이 아님")
  // 거절 → 단추 다시 켜짐 + 막힘 창 (한 번에)
  view.rerender(React.createElement(Room, { starting: false, message: MESSAGE }))
  await act(async () => {})
  assert.ok(document.activeElement === screen.getByRole("button", { name: "확인" }), `열린 뒤 초점: ${focusName()}`)
  // 확인으로 닫음 = 글 지움
  view.rerender(React.createElement(Room, { starting: false, message: null }))
  await act(async () => {})
  assert.ok(document.querySelector("[data-game-start-blocked]") === null, "창이 안 닫힘")
  assert.ok(document.activeElement === start, `닫은 뒤 초점: ${focusName()}`)
})

// 진짜 대기방 차례 그대로: 화면은 StrictMode(개발·브라우저 시험 빌드)라 창이 뜰 때 효과가 두 번 돎
// 누름 → 요청 중 꺼짐(초점 빠짐) → 거절 답에 다시 켜짐 + 막힘 창 → 확인 → 닫힘
function LiveRoom() {
  const [starting, setStarting] = React.useState(false)
  const [message, setMessage] = React.useState(null)
  return React.createElement(
    "div",
    null,
    React.createElement("button", { type: "button", disabled: starting, onClick: () => setStarting(true) }, "게임시작"),
    React.createElement("button", { type: "button", onClick: () => { setMessage(MESSAGE); setStarting(false) } }, "거절 답"),
    React.createElement(GameStartBlockedModal, { message, onClose: () => setMessage(null) }),
  )
}

test("A01-F-738 StrictMode(효과 두 번): 게임시작 누름 → 꺼지며 초점 빠짐 → 막힘 창 → 확인으로 닫으면 게임시작 단추로", async () => {
  render(React.createElement(React.StrictMode, null, React.createElement(LiveRoom)))
  const start = screen.getByRole("button", { name: "게임시작" })
  start.focus()
  // 누르면 요청 중 꺼지며 브라우저가 초점을 몸통으로 뺌 (jsdom은 안 빼고 꺼진 단추엔 blur도 안 먹어서 누르기 바로 앞에 blur로 흉내)
  start.blur()
  await act(async () => { fireEvent.click(start) })
  assert.ok(start.disabled && document.activeElement === document.body, `준비 잘못: 꺼짐=${start.disabled} 초점=${focusName()}`)
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "거절 답" })) })
  assert.ok(document.activeElement === screen.getByRole("button", { name: "확인" }), `열린 뒤 초점: ${focusName()}`)
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "확인" })) })
  assert.ok(document.querySelector("[data-game-start-blocked]") === null, "창이 안 닫힘")
  assert.ok(document.activeElement === start, `닫은 뒤 초점: ${focusName()}`)
})
