import { INGAME_PLAYER_NAMEPLATE_INSET } from "../constants/board/ingamePlayerAssets.js"

export function buildInGamePlayerNameplateStyle(themeStyles) {
  return themeStyles
    ? { ...INGAME_PLAYER_NAMEPLATE_INSET, color: themeStyles.color }
    : INGAME_PLAYER_NAMEPLATE_INSET
}
