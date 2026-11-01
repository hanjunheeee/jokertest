// 플레이어 카드·명패 색 스타일 고르기
// 플레이어 카드·명패가 사용
import { resolveThemeEmphasized } from "../../../../shared/constants/ingamePlayerTheme.js"
import { INGAME_PLAYER_NAMEPLATE_INSET } from "../constants/board/ingamePlayerAssets.js"

// 투표 강조면 진한 색, 아니면 테마 기본 스타일
export function resolveInGamePlayerCardThemeStyles(theme, voteHighlight = false) {
  return theme && voteHighlight
    ? resolveThemeEmphasized(theme.paletteIndex).styles
    : theme?.styles
}

// 명패 위치에 테마 글자색만 얹음 (테마 없으면 위치만)
export function buildInGamePlayerNameplateStyle(themeStyles) {
  return themeStyles
    ? { ...INGAME_PLAYER_NAMEPLATE_INSET, color: themeStyles.color }
    : INGAME_PLAYER_NAMEPLATE_INSET
}
