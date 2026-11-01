import {
  INGAME_PLAYER_NAMEPLATE_CLASS,
} from "../../constants/board/ingamePlayerAssets.js"
import {
  buildInGamePlayerNameplateStyle,
  resolveInGamePlayerCardThemeStyles,
} from "../../utils/playerCardStyles.js"

export default function InGamePlayerNameplate({
  nickname = "",
  theme = null,
  voteHighlight = false,
}) {
  const themeStyles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
  if (!nickname) return null

  return (
    <p className={INGAME_PLAYER_NAMEPLATE_CLASS} style={buildInGamePlayerNameplateStyle(themeStyles)}>
      <span className="block w-full truncate">{nickname}</span>
    </p>
  )
}
