import test from "node:test"
import assert from "node:assert/strict"

import {
  INGAME_PLAYER_THEME_PALETTE,
  INGAME_PLAYER_THEME_PALETTE_SIZE,
  resolveInGamePlayerThemeByColorIndex,
} from "../../../constants/ingamePlayerTheme.js"
import { resolveInGameChatPlayerColor } from "../resolveInGameChatPlayerColor.js"
import { useSettingsStore } from "../../../../../settings/store/settingsStore.js"

/** 로컬 store가 내려주는 colorIndex 하나만으로 채팅 행 색을 만든다 — 행이 쓰는 유일한 색 입력. */
const COLOR_INDEXES = Array.from({ length: INGAME_PLAYER_THEME_PALETTE_SIZE }, (_, i) => i)

function setNicknameColorEnabled(enabled) {
  useSettingsStore.setState((s) => ({
    chatChecks: { ...(s.chatChecks ?? {}), "nickname-color": enabled },
  }))
}

// F-15(AC-02/AC-04): resolveInGameChatPlayerColor는 이제 "닉네임 색상 표시" 설정이 켜져
// 있을 때만 색을 적용한다 — 대부분의 시험은 이 설정을 켠 채로 기존 색 계산 계약을 그대로
// 검증하고, 별도 시험에서 설정이 꺼진/저장된 적 없는 경우를 확인한다.
test.beforeEach(() => {
  setNicknameColorEnabled(true)
})

test("닉네임 색상 표시가 켜져 있으면 colorIndex마다 다른 색을 돌려준다", () => {
  const colors = COLOR_INDEXES.map((colorIndex) => {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    const { style } = resolveInGameChatPlayerColor(theme.styles)

    assert.equal(style.color, INGAME_PLAYER_THEME_PALETTE[colorIndex].color)
    return style.color
  })

  assert.equal(
    new Set(colors).size,
    INGAME_PLAYER_THEME_PALETTE_SIZE,
    "팔레트 색이 colorIndex마다 서로 달라야 한다",
  )
})

test("닉네임 색상 표시가 켜져 있고 themeStyles가 있으면 렌더 안정화 클래스도 함께 돌려준다", () => {
  for (const colorIndex of COLOR_INDEXES) {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    const { className } = resolveInGameChatPlayerColor(theme.styles)

    assert.ok(className.length > 0)
  }
})

test("themeStyles가 없으면(미지정 colorIndex) 설정과 무관하게 색·클래스 없이 기본값을 돌려준다", () => {
  for (const themeStyles of [null, undefined]) {
    const { style, className } = resolveInGameChatPlayerColor(themeStyles)

    assert.equal(style, undefined)
    assert.equal(className, "")
  }
})

test("colorIndex가 유효한 비음수 정수가 아니면 테마가 없다(색 없음)", () => {
  for (const invalid of [undefined, null, -1, 1.5, "3", NaN]) {
    const theme = resolveInGamePlayerThemeByColorIndex(invalid)
    assert.equal(theme, null)

    const { style, className } = resolveInGameChatPlayerColor(theme?.styles)
    assert.equal(style, undefined)
    assert.equal(className, "")
  }
})

// F-15(AC-02/AC-04): "닉네임 색상 표시" 체크박스가 실제 채팅 렌더링을 가린다 — 꺼져 있으면
// 유효한 themeStyles가 있어도 색을 적용하지 않는다.
test("닉네임 색상 표시가 꺼져 있으면 유효한 themeStyles가 있어도 색·그림자를 적용하지 않는다", () => {
  setNicknameColorEnabled(false)
  const theme = resolveInGamePlayerThemeByColorIndex(0)

  const { style, className } = resolveInGameChatPlayerColor(theme.styles)

  assert.equal(style, undefined)
  assert.equal(className, "")
})

test("설정을 저장한 적 없으면(store 기본값) ingameSettingData.js가 정한 기본값(켜짐)을 따른다", () => {
  useSettingsStore.setState({ chatChecks: null })
  const theme = resolveInGamePlayerThemeByColorIndex(0)

  const { style } = resolveInGameChatPlayerColor(theme.styles)

  assert.equal(
    style?.color,
    INGAME_PLAYER_THEME_PALETTE[0].color,
    "nickname-color의 defaultChecked가 true이므로 저장된 적 없으면 팔레트 색을 적용해야 한다",
  )
  assert.equal(
    style?.textShadow,
    "0 1px 2px rgba(0,0,0,0.85)",
    "저장된 적 없어도 테마색 텍스트에는 그림자가 적용되어야 한다",
  )
})

test("닉네임 색상 표시가 켜져 있으면 textShadow도 함께 돌려준다", () => {
  const theme = resolveInGamePlayerThemeByColorIndex(0)
  const { style } = resolveInGameChatPlayerColor(theme.styles)

  assert.equal(style.textShadow, "0 1px 2px rgba(0,0,0,0.85)")
})

// F-15(AC-04): 색의 유일한 입력은 공개 colorIndex뿐이다 — 이 함수는 themeStyles.color 외의
// 어떤 값도 받지 않으므로, 비밀 진영·직업 정보를 전달할 방법 자체가 없다.
test("같은 colorIndex는 항상 같은 색이다 — 함수는 themeStyles.color 외의 입력을 받지 않는다", () => {
  const theme = resolveInGamePlayerThemeByColorIndex(3)

  const first = resolveInGameChatPlayerColor(theme.styles)
  const second = resolveInGameChatPlayerColor(theme.styles)

  assert.equal(first.style.color, second.style.color)
})
