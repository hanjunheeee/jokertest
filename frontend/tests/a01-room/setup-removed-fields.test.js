// 지운 3칸 안 보임 시험: 방 만들기 화면 두 탭·설정 바꾸기 창(편집 모드) 두 탭에 "불이 꺼진 무도회"·"영혼의 베팅"·"투표 공개" 글 없음
// 목록 A01a "화면 PC" A01-F-145~148
import test from "node:test"
import assert from "node:assert/strict"
import "../helpers/domSetup.mjs"

const React = await import("react")
const { render, screen, fireEvent, cleanup } = await import("@testing-library/react")
const { default: GameSetupPanel } = await import("../../src/domains/game/setup/components/GameSetupPanel.jsx")
const { default: SettingsEditOverlay } = await import("../../src/domains/game/matching/components/settingsEdit/SettingsEditOverlay.jsx")
const { buildRoomSettingsFormState } = await import("../../src/domains/game/setup/utils/roomSettingsForm.js")
const H = await import("./a01a-helpers.mjs")

test.afterEach(() => cleanup())

const REMOVED = ["불이 꺼진 무도회", "영혼의 베팅", "투표 공개"]

// 두 탭을 차례로 열며 글 모음
function textOfBothTabs() {
  fireEvent.click(screen.getByRole("button", { name: "일반" }))
  const general = document.body.textContent
  fireEvent.click(screen.getByRole("button", { name: "회의&투표" }))
  const meeting = document.body.textContent
  return general + meeting
}

const NOS = ["A01-F-145", "A01-F-146", "A01-F-147"]
for (const [i, word] of REMOVED.entries()) {
  test(`${NOS[i]} 방 만들기 화면 두 탭 → '${word}' 글 없음`, () => {
    render(React.createElement(GameSetupPanel, { visible: true, isCreating: false, onCreateGame: () => {} }))
    const text = textOfBothTabs()
    // 탭이 진짜 그려졌는지 (빈 화면이면 안 됨)
    assert.ok(text.includes("최대 플레이어 수") && text.includes("낮 토론 시간 조절"))
    assert.equal(text.includes(word), false)
  })
}

test("A01-F-148 설정 바꾸기 창(편집 모드 '설정 저장') 두 탭 → 세 글 없음", () => {
  // 옛 방 설정에 지운 칸이 남아 있어도
  const settingsForm = buildRoomSettingsFormState({
    accessType: "open",
    settings: { ...H.BASE_SETTINGS, lightsOut: true, soulBetting: true, voteReveal: true },
  })
  render(React.createElement(SettingsEditOverlay, {
    settingsForm, formResetKey: "room-1:1", isSaving: false, onSubmit: () => {}, onCancel: () => {},
    settingsError: null, hasPendingSettingsResult: false,
  }))
  assert.ok(H.buttonNamed("설정 저장"))
  const text = textOfBothTabs()
  assert.ok(text.includes("최대 플레이어 수") && text.includes("낮 토론 시간 조절"))
  for (const word of REMOVED) assert.equal(text.includes(word), false, `${word} 없음`)
})
