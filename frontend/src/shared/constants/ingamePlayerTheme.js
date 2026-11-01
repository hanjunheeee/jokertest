// 플레이어 색 팔레트와 색별 글자·테두리 모양 만들기
// ingame 카드·채팅·기록·추방 목록과 user 스킨 카드 미리보기가 씀
export const INGAME_PLAYER_THEME_PALETTE = [
  { id: "pink", color: "#ffffff" },
  { id: "orange", color: "#FF7F39" },
  { id: "amber", color: "#ecff82" },
  { id: "indigo", color: "#ffb6b6" },
  { id: "emerald", color: "#0a4a00" },
  { id: "cyan", color: "#22D3EE" },
  { id: "sky", color: "#a2ff00" },
  { id: "scarlet", color: "#6c0000" },
  { id: "fuchsia", color: "#033856" },
  { id: "rose", color: "#101e85" },
]

export const INGAME_PLAYER_THEME_PALETTE_SIZE = INGAME_PLAYER_THEME_PALETTE.length

export const THEME_TEXT_RENDER_CLASS =
  "antialiased [transform:translateZ(0)] [backface-visibility:hidden]"

export const THEME_TEXT_SHADOW =
  "0 1px 2px rgba(0,0,0,0.85)"

export function buildThemeStyles(color, { emphasized = false } = {}) {
  return {
    color,
    frameStrokeScale: emphasized ? 1.04 : 1.026,
  }
}

export function resolveInGamePlayerTheme(paletteIndex) {
  const entry =
    INGAME_PLAYER_THEME_PALETTE[paletteIndex % INGAME_PLAYER_THEME_PALETTE_SIZE]

  return {
    paletteIndex: paletteIndex % INGAME_PLAYER_THEME_PALETTE_SIZE,
    id: entry.id,
    color: entry.color,
    styles: buildThemeStyles(entry.color),
  }
}

export function resolveInGamePlayerThemeByColorIndex(colorIndex) {
  if (!Number.isInteger(colorIndex) || colorIndex < 0) return null

  return resolveInGamePlayerTheme(colorIndex)
}

export function resolveThemeEmphasized(paletteIndex) {
  const theme = resolveInGamePlayerTheme(paletteIndex)
  return {
    ...theme,
    styles: buildThemeStyles(theme.color, { emphasized: true }),
  }
}
