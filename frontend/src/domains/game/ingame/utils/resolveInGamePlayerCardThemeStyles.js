import { resolveInGamePlayerThemeEmphasized } from "../constants/ingamePlayerTheme.js"

/** @param {object|null|undefined} theme */
export function resolveInGamePlayerCardThemeStyles(theme, voteHighlight = false) {
  return theme && voteHighlight
    ? resolveInGamePlayerThemeEmphasized(theme.paletteIndex).styles
    : theme?.styles
}
