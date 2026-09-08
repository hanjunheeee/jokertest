import test from "node:test"
import assert from "node:assert/strict"

import { INGAME_PLAYER_NAMEPLATE_INSET } from "../../constants/board/ingamePlayerAssets.js"
import {
  INGAME_PLAYER_THEME_PALETTE,
  INGAME_PLAYER_THEME_PALETTE_SIZE,
  resolveInGamePlayerThemeByColorIndex,
} from "../../constants/ingamePlayerTheme.js"
import { buildInGamePlayerNameplateStyle } from "../buildInGamePlayerNameplateStyle.js"
import { resolveInGamePlayerCardThemeStyles } from "../resolveInGamePlayerCardThemeStyles.js"

/** 로컬 store가 내려주는 colorIndex 하나만으로 카드 스타일을 만든다 — 카드가 쓰는 유일한 색 입력. */
const COLOR_INDEXES = Array.from({ length: INGAME_PLAYER_THEME_PALETTE_SIZE }, (_, i) => i)

test("resolveInGamePlayerCardThemeStyles가 colorIndex마다 다른 색을 돌려준다", () => {
  const colors = COLOR_INDEXES.map((colorIndex) => {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    const styles = resolveInGamePlayerCardThemeStyles(theme)

    assert.equal(styles.color, INGAME_PLAYER_THEME_PALETTE[colorIndex].color)
    return styles.color
  })

  assert.equal(
    new Set(colors).size,
    INGAME_PLAYER_THEME_PALETTE_SIZE,
    "팔레트 색이 colorIndex마다 서로 달라야 한다",
  )
})

test("buildInGamePlayerNameplateStyle이 colorIndex마다 다른 명판 스타일을 돌려준다", () => {
  const styleList = COLOR_INDEXES.map((colorIndex) => {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    return buildInGamePlayerNameplateStyle(resolveInGamePlayerCardThemeStyles(theme))
  })

  styleList.forEach((style, colorIndex) => {
    // inset은 colorIndex와 무관하게 유지되고 색만 바뀐다.
    assert.equal(style.bottom, INGAME_PLAYER_NAMEPLATE_INSET.bottom)
    assert.equal(style.left, INGAME_PLAYER_NAMEPLATE_INSET.left)
    assert.equal(style.right, INGAME_PLAYER_NAMEPLATE_INSET.right)
    assert.equal(style.height, INGAME_PLAYER_NAMEPLATE_INSET.height)
    assert.equal(style.color, INGAME_PLAYER_THEME_PALETTE[colorIndex].color)
  })

  assert.equal(
    new Set(styleList.map((style) => style.color)).size,
    INGAME_PLAYER_THEME_PALETTE_SIZE,
  )
})

test("voteHighlight는 stroke만 키우고 colorIndex별 색은 그대로 둔다", () => {
  for (const colorIndex of COLOR_INDEXES) {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    const base = resolveInGamePlayerCardThemeStyles(theme, false)
    const emphasized = resolveInGamePlayerCardThemeStyles(theme, true)

    assert.equal(emphasized.color, base.color)
    assert.ok(
      emphasized.frameStrokeScale > base.frameStrokeScale,
      "투표 강조는 프레임 stroke를 더 두껍게 만든다",
    )
    assert.equal(
      buildInGamePlayerNameplateStyle(emphasized).color,
      INGAME_PLAYER_THEME_PALETTE[colorIndex].color,
    )
  }
})

test("theme이 없으면 색 없는 기본 명판 inset을 그대로 쓴다", () => {
  for (const theme of [null, undefined]) {
    const styles = resolveInGamePlayerCardThemeStyles(theme)
    assert.equal(styles, undefined)

    const style = buildInGamePlayerNameplateStyle(styles)
    assert.equal(style, INGAME_PLAYER_NAMEPLATE_INSET)
    assert.equal(Object.hasOwn(style, "color"), false)
  }
})

test("colorIndex가 유효한 비음수 정수가 아니면 테마가 없다(색 없음)", () => {
  for (const invalid of [undefined, null, -1, 1.5, "3", NaN]) {
    assert.equal(resolveInGamePlayerThemeByColorIndex(invalid), null)
  }
})
