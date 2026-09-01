/**
 * 인게임 플레이어 식별 색상 — 닉네임·채팅(색상) · 프레임(stroke) · 투표 공용.
 *
 * 팔레트는 고정 10색이고 프런트가 색을 정하지 않습니다 — 서버(game-core)가 참가자마다
 * 배정한 colorIndex가 유일한 출처이고, 프런트는 그 인덱스를 이 팔레트로 해석만 합니다.
 * 그래서 같은 참가자는 어느 창에서 봐도 같은 색으로 보입니다.
 *
 * game-core/gameSession.js의 PLAYER_COLOR_COUNT(=10)와 길이가 일치해야 한다 — 이 프로젝트에는
 * 백엔드/프런트가 공유하는 상수 모듈이 없어 수동으로 동기화한다(둘 중 하나가 바뀌면 같이
 * 바꿔야 함). 길이가 어긋나도 해석은 순환(%)이라 절대 터지지 않고 색만 겹칩니다.
 */

/** 구별하기 쉬운 고정 10색 (어두운 배경·채팅 가독성 기준) */
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

/**
 * 서버가 배정한 참가자 colorIndex를 팔레트 테마로 해석합니다 — 해석할 수 없으면 null입니다.
 * null은 "색 없음"이라는 정상 신호이고(구세션처럼 colorIndex를 보내지 않는 payload),
 * 소비처는 이 값이 null일 때 테마 색 없이 기존 기본색으로 그립니다.
 * @param {number} colorIndex 서버 참가자 색 인덱스(0..PLAYER_COLOR_COUNT-1)
 * @flow 비음수 정수가 아니면(undefined·null·문자열·소수·음수) null을 돌려주고, 유효하면
 *   resolveInGamePlayerTheme에 위임해 팔레트 크기로 순환시킨다. 음수를 미리 걸러야 하는
 *   이유는 -1 % 10 === -1이라 그대로 넘기면 팔레트 조회가 undefined가 되기 때문이다.
 */
export function resolveInGamePlayerThemeByColorIndex(colorIndex) {
  if (!Number.isInteger(colorIndex) || colorIndex < 0) return null

  return resolveInGamePlayerTheme(colorIndex)
}

/** 투표·선택 하이라이트 — 프레임 stroke만 약간 두껍게 */
export function resolveInGamePlayerThemeEmphasized(paletteIndex) {
  const theme = resolveInGamePlayerTheme(paletteIndex)
  return {
    ...theme,
    styles: buildInGamePlayerThemeStyles(theme.color, { emphasized: true }),
  }
}
