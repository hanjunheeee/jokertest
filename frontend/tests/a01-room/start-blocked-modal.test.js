// 시작 막힘 창 시험: 글 있으면 제목+글 창, 글 없으면 안 그림, 확인 누르면 닫힘, 거절 글마다 보임, 키보드로 닫기
// 목록 A01a "화면 PC" A01-F-165~174
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup, act } = await import("@testing-library/react")
const { default: GameStartBlockedModal } = await import("../../src/domains/game/matching/components/GameStartBlockedModal.jsx")

test.afterEach(() => cleanup())

// 화면처럼 글을 들고 있다가 닫으면 지우는 틀
function Holder({ first }) {
  const [message, setMessage] = React.useState(first)
  return React.createElement(GameStartBlockedModal, { message, onClose: () => setMessage(null) })
}
const renderWith = (message) => render(React.createElement(Holder, { first: message }))
const box = () => document.querySelector("[data-game-start-blocked]")

test("A01-F-165 글 '아직 준비하지 않은 참가자가 있습니다.' → 제목 '게임을 시작할 수 없습니다' + 글(role=alert)", () => {
  renderWith("아직 준비하지 않은 참가자가 있습니다.")
  assert.ok(screen.getByRole("heading", { name: "게임을 시작할 수 없습니다" }))
  assert.equal(screen.getByRole("alert").textContent, "아직 준비하지 않은 참가자가 있습니다.")
})

test("A01-F-166 글 빈 값 → 창 없음", () => {
  const view = renderWith("")
  assert.equal(view.container.innerHTML, "")
})

test("A01-F-167 확인 누르면 창 사라짐", () => {
  renderWith("아직 준비하지 않은 참가자가 있습니다.")
  fireEvent.click(screen.getByRole("button", { name: "확인" }))
  assert.ok(box() === null, "창 닫힘")
})

// 서버 거절 글마다
const MESSAGES = [
  ["A01-F-168", "인원", "게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다."],
  ["A01-F-169", "구성", "설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요."],
  ["A01-F-170", "준비", "아직 준비하지 않은 참가자가 있습니다."],
  ["A01-F-171", "입장 중", "입장 처리 중인 참가자가 있습니다. 잠시 후 다시 시도해주세요."],
  ["A01-F-172", "연결", "일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요."],
  ["A01-F-173", "점검", "서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요."],
]
for (const [no, name, message] of MESSAGES) {
  test(`${no} ${name} 글 → 창 안에 그 글`, () => {
    renderWith(message)
    assert.ok(box().contains(screen.getByRole("alert")))
    assert.equal(screen.getByRole("alert").textContent, message)
  })
}

test("A01-F-174 [지금 동작] 창 열림 → 확인 단추에 포커스, Enter로 닫힘", async () => {
  renderWith("아직 준비하지 않은 참가자가 있습니다.")
  await act(async () => {})
  const confirm = screen.getByRole("button", { name: "확인" })
  // 화면 요소끼리 equal로 비교하면 실패 글이 너무 커져 멈춤 → 참거짓으로 봄
  assert.ok(document.activeElement === confirm, `포커스 자리: ${document.activeElement?.getAttribute?.("aria-label") ?? document.activeElement?.tagName}`)
  // jsdom은 Enter로 단추를 눌러 주지 않음 → 브라우저처럼 포커스된 단추를 누름 (진짜 단추라 Enter가 누르기와 같음)
  assert.equal(confirm.tagName, "BUTTON")
  fireEvent.keyDown(document.activeElement, { key: "Enter" })
  act(() => document.activeElement.click())
  assert.ok(box() === null, "창 닫힘")
})
