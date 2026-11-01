import { resolveInGamePlayerThemeEmphasized } from "../../../../shared/constants/ingamePlayerTheme.js"

export function resolveInGamePlayerCardThemeStyles(theme, voteHighlight = false) {
  return theme && voteHighlight
    ? resolveInGamePlayerThemeEmphasized(theme.paletteIndex).styles
    : theme?.styles
}
