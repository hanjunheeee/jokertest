// 방 만들기 화면 회의&투표 탭 시험: 처음 값, 경계 단추 꺼짐, 재판이 투표를 따라감, 직업별 밤 칸
// 목록 A01a "화면 PC" A01-F-129~144, 설정 패널(만들기 모드)을 그려서 봄
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react")
const { default: GameSetupPanel } = await import("../../src/domains/game/setup/components/GameSetupPanel.jsx")
const H = await import("./a01a-helpers.mjs")

test.afterEach(() => cleanup())

const TALK = "낮 토론 시간 조절"
const VOTE = "낮 투표 시간 조절"
const TRIAL = "재판 시간 조절"
const NIGHT = "밤 행동 시간 조절"
const ROLE_NIGHT = ["광대 밤 시간 조절", "의사 밤 시간 조절", "경비원 밤 시간 조절", "마녀사냥꾼 밤 시간 조절"]

// 패널 그리고 회의&투표 탭으로
function renderMeeting() {
  render(React.createElement(GameSetupPanel, { visible: true, isCreating: false, onCreateGame: () => {} }))
  fireEvent.click(screen.getByRole("button", { name: "회의&투표" }))
}

const START_CASES = [
  ["A01-F-129", "토론", TALK, 60],
  ["A01-F-130", "투표", VOTE, 60],
  ["A01-F-131", "재판", TRIAL, 60],
  ["A01-F-132", "밤", NIGHT, 90],
]
for (const [no, name, label, value] of START_CASES) {
  test(`${no} 처음 값: ${name} ${value}`, () => {
    renderMeeting()
    assert.equal(H.stepperValue(label), value)
  })
}

const EDGE_CASES = [
  ["A01-F-133", "토론 30 −", TALK, 30, "감소"],
  ["A01-F-134", "토론 150 +", TALK, 150, "증가"],
  ["A01-F-135", "투표 30 −", VOTE, 30, "감소"],
  ["A01-F-136", "투표 90 +", VOTE, 90, "증가"],
  ["A01-F-137", "재판 15 −", TRIAL, 15, "감소"],
  ["A01-F-138", "재판 120 +", TRIAL, 120, "증가"],
  ["A01-F-139", "밤 30 −", NIGHT, 30, "감소"],
  ["A01-F-140", "밤 120 +", NIGHT, 120, "증가"],
]
for (const [no, name, label, value, side] of EDGE_CASES) {
  test(`${no} ${name} → 꺼짐`, () => {
    renderMeeting()
    H.stepTo(label, value)
    assert.equal(H.buttonNamed(`${label} ${side}`).disabled, true)
    assert.equal(H.buttonNamed(`${label} ${side === "감소" ? "증가" : "감소"}`).disabled, false)
  })
}

test("A01-F-141 투표 90으로 → 재판 칸 90", () => {
  renderMeeting()
  H.stepTo(VOTE, 90)
  assert.equal(H.stepperValue(TRIAL), 90)
})

test("A01-F-142 재판 30 → 투표 90으로 → 재판 30 그대로", () => {
  renderMeeting()
  H.stepTo(TRIAL, 30)
  H.stepTo(VOTE, 90)
  assert.equal(H.stepperValue(TRIAL), 30)
})

test("A01-F-143 [지금 동작] 직업별 밤 칸 4개, 처음 값 = 전체 밤 시간", () => {
  renderMeeting()
  for (const label of ROLE_NIGHT) assert.equal(H.stepperValue(label), H.stepperValue(NIGHT), `${label}`)
})

test("A01-F-144 [지금 동작] 전체 밤 120 → 안 건드린 직업 칸 120", () => {
  renderMeeting()
  H.stepTo(NIGHT, 120)
  for (const label of ROLE_NIGHT) assert.equal(H.stepperValue(label), 120, `${label}`)
})
