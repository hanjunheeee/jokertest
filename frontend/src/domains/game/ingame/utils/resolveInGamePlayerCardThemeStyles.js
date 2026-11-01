import { resolveThemeEmphasized } from "../../../../shared/constants/ingamePlayerTheme.js"

export function resolveInGamePlayerCardThemeStyles(theme, voteHighlight = false) {
  return theme && voteHighlight
    ? resolveThemeEmphasized(theme.paletteIndex).styles
    : theme?.styles
}
