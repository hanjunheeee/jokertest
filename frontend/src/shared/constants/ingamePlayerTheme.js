// 플레이어 색 팔레트와 색별 글자·테두리 모양 만들기
// ingame 카드·채팅·기록·추방 목록과 user 스킨 카드 미리보기가 씀
// 순서가 색 번호, id는 옛 이름이라 실제 색과 안 맞음 (color가 진짜)
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

// 색 글자가 번지지 않게 따로 층을 만들어 그림
export const THEME_TEXT_RENDER_CLASS =
  "antialiased [transform:translateZ(0)] [backface-visibility:hidden]"

export const THEME_TEXT_SHADOW =
  "0 1px 2px rgba(0,0,0,0.85)"

// 강조 카드는 테두리 선을 조금 더 굵게
export function buildThemeStyles(color, { emphasized = false } = {}) {
  return {
    color,
    frameStrokeScale: emphasized ? 1.04 : 1.026,
  }
}

// 팔레트 길이로 돌려 써서 번호가 팔레트보다 커도 색이 있음
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

// 정수 아닌·음수 번호는 null (색 정보 없음으로 봄)
export function resolveInGamePlayerThemeByColorIndex(colorIndex) {
  if (!Number.isInteger(colorIndex) || colorIndex < 0) return null

  return resolveInGamePlayerTheme(colorIndex)
}

// 같은 색에 강조 테두리
export function resolveThemeEmphasized(paletteIndex) {
  const theme = resolveInGamePlayerTheme(paletteIndex)
  return {
    ...theme,
    styles: buildThemeStyles(theme.color, { emphasized: true }),
  }
}
