import test from "node:test"
import assert from "node:assert/strict"

import {
  INGAME_PLAYER_THEME_PALETTE,
  INGAME_PLAYER_THEME_PALETTE_SIZE,
  resolveInGamePlayerThemeByColorIndex,
} from "../ingamePlayerTheme.js"

test("팔레트는 backend PLAYER_COLOR_COUNT와 같은 10색이고 hex가 서로 중복되지 않는다", () => {
  assert.equal(INGAME_PLAYER_THEME_PALETTE_SIZE, 10)
  assert.equal(INGAME_PLAYER_THEME_PALETTE.length, 10)

  const colors = INGAME_PLAYER_THEME_PALETTE.map((entry) => entry.color)
  assert.equal(new Set(colors).size, 10)

  const ids = INGAME_PLAYER_THEME_PALETTE.map((entry) => entry.id)
  assert.equal(new Set(ids).size, 10)
})

test("colorIndex 0..9는 팔레트의 같은 자리 색으로 매핑된다", () => {
  for (let colorIndex = 0; colorIndex < INGAME_PLAYER_THEME_PALETTE_SIZE; colorIndex += 1) {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    assert.equal(theme.color, INGAME_PLAYER_THEME_PALETTE[colorIndex].color)
    assert.equal(theme.id, INGAME_PLAYER_THEME_PALETTE[colorIndex].id)
    assert.equal(theme.paletteIndex, colorIndex)
  }
})

test("해석된 테마의 styles.color는 팔레트 색과 같다 — 카드 stroke·채팅 닉네임이 읽는 값이다", () => {
  const theme = resolveInGamePlayerThemeByColorIndex(7)
  assert.equal(theme.styles.color, INGAME_PLAYER_THEME_PALETTE[7].color)
  assert.equal(typeof theme.styles.frameStrokeScale, "number")
})

test("팔레트 범위 밖 colorIndex는 팔레트 크기로 순환한다(10→0, 13→3, 25→5)", () => {
  for (const [colorIndex, expectedPaletteIndex] of [
    [10, 0],
    [13, 3],
    [25, 5],
    [999, 999 % 10],
  ]) {
    const theme = resolveInGamePlayerThemeByColorIndex(colorIndex)
    assert.equal(theme.paletteIndex, expectedPaletteIndex)
    assert.equal(theme.color, INGAME_PLAYER_THEME_PALETTE[expectedPaletteIndex].color)
  }
})

test("colorIndex가 없거나 형태가 어긋나면 throw하지 않고 null(기본색 fallback)을 돌려준다", () => {
  for (const bad of [undefined, null, -1, -10, 1.5, "3", "", NaN, Infinity, {}, [], true]) {
    assert.equal(
      resolveInGamePlayerThemeByColorIndex(bad),
      null,
      `${String(bad)}는 fallback이어야 한다`,
    )
  }
})

test("서로 다른 colorIndex는 서로 다른 색을 낸다(같은 판 참가자 구분의 근거)", () => {
  const colors = Array.from({ length: INGAME_PLAYER_THEME_PALETTE_SIZE }, (_, index) =>
    resolveInGamePlayerThemeByColorIndex(index).color,
  )
  assert.equal(new Set(colors).size, INGAME_PLAYER_THEME_PALETTE_SIZE)
})

test("색 결정에 랜덤이 없다 — 같은 colorIndex는 항상 같은 색이고 소스에 Math.random이 없다", async () => {
  const first = resolveInGamePlayerThemeByColorIndex(4)
  const second = resolveInGamePlayerThemeByColorIndex(4)
  assert.deepEqual(first, second)

  const { readFile } = await import("node:fs/promises")
  const source = await readFile(new URL("../ingamePlayerTheme.js", import.meta.url), "utf8")
  assert.doesNotMatch(source, /Math\.random/)
})
