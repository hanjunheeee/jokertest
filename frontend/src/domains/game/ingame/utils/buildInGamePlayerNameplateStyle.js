import { INGAME_PLAYER_NAMEPLATE_INSET } from "../constants/board/ingamePlayerAssets.js"

/** @param {object|null|undefined} themeStyles resolveInGamePlayerCardThemeStyles 결과 */
export function buildInGamePlayerNameplateStyle(themeStyles) {
  return themeStyles
    ? { ...INGAME_PLAYER_NAMEPLATE_INSET, color: themeStyles.color }
    : INGAME_PLAYER_NAMEPLATE_INSET
}
