import test from "node:test"
import assert from "node:assert/strict"

import {
  INGAME_PLAYER_THEME_PALETTE,
  INGAME_PLAYER_THEME_PALETTE_SIZE,
  resolveInGamePlayerThemeByColorIndex,
} from "../../../constants/ingamePlayerTheme.js"
import { resolveInGameChatPlayerColor } from "../resolveInGameChatPlayerColor.js"

/** 로컬 store가 내려주는 colorIndex 하나만으로 채팅 행 색을 만든다 — 행이 쓰는 유일한 색 입력. */
const COLOR_INDEXES = Array.from({ length: INGAME_PLAYER_THEME_PALETTE_SIZE }, (_, i) => i)

test("resolveInGameChatPlayerColor가 colorIndex마다 다른 색을 돌려준다", () => {
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

test("themeStyles가 있으면 렌더 안정화 클래스도 함께 돌려준다", () => {
  for (const colorIndex of COLOR_INDEXES) {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    const { className } = resolveInGameChatPlayerColor(theme.styles)

    assert.ok(className.length > 0)
  }
})

test("themeStyles가 없으면(미지정 colorIndex) 색·클래스 없이 기본값을 돌려준다", () => {
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
