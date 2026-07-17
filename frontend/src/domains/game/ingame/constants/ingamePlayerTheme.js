/**
 * 인게임 플레이어 식별 색상 — 닉네임·채팅(색상) · 프레임(stroke) · 투표 공용.
 *
 * 팔레트는 고정 10색. 매 판 시작 시 순서만 셔플 후 플레이어에 순환 배정합니다.
 */

/** 구별하기 쉬운 고정 10색 (어두운 배경·채팅 가독성 기준) */
export const INGAME_PLAYER_THEME_PALETTE = [
  { id: "pink", color: "#ffffff" },
  { id: "orange", color: "#FF7F39" },
  { id: "amber", color: "#ecff82" },
  { id: "indigo", color: "#748FFC" },
  { id: "emerald", color: "#3DDC84" },
  { id: "cyan", color: "#22D3EE" },
  { id: "sky", color: "#38BDF8" },
  { id: "scarlet", color: "#EF5350" },
  { id: "fuchsia", color: "#C77DFF" },
  { id: "rose", color: "#FF7094" },
]

export const INGAME_PLAYER_THEME_PALETTE_SIZE = INGAME_PLAYER_THEME_PALETTE.length

/**
 * 테마색 닉네임·채팅 — 서브픽셀 fringing·3D transform 시 자글거림 완화.
 * Tailwind antialiased = -webkit-font-smoothing: antialiased (그레이스케일 AA)
 */
export const INGAME_PLAYER_THEME_TEXT_RENDER_CLASS =
  "antialiased [transform:translateZ(0)] [backface-visibility:hidden]"

/**
 * @param {string} color
 * @param {{ emphasized?: boolean }} [options] emphasized — 투표 선택 등 stroke 강화
 */
export function buildInGamePlayerThemeStyles(color, { emphasized = false } = {}) {
  return {
    color,
    /** 프레임 mask 뒤 레이어 scale — PNG 실루엣 따라 stroke */
    frameStrokeScale: emphasized ? 1.04 : 1.026,
  }
}

/**
 * @param {number} paletteIndex INGAME_PLAYER_THEME_PALETTE 인덱스
 */
export function resolveInGamePlayerTheme(paletteIndex) {
  const entry =
    INGAME_PLAYER_THEME_PALETTE[paletteIndex % INGAME_PLAYER_THEME_PALETTE_SIZE]

  return {
    paletteIndex: paletteIndex % INGAME_PLAYER_THEME_PALETTE_SIZE,
    id: entry.id,
    color: entry.color,
    styles: buildInGamePlayerThemeStyles(entry.color),
  }
}

/** 투표·선택 하이라이트 — 프레임 stroke만 약간 두껍게 */
export function resolveInGamePlayerThemeEmphasized(paletteIndex) {
  const theme = resolveInGamePlayerTheme(paletteIndex)
  return {
    ...theme,
    styles: buildInGamePlayerThemeStyles(theme.color, { emphasized: true }),
  }
}
