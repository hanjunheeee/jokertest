// 카드 아래 이름표
// InGamePlayerCard가 씀
import {
  INGAME_PLAYER_NAMEPLATE_BAND_CLASS,
  INGAME_PLAYER_NAMEPLATE_BAND_PLATE_CLASS,
  INGAME_PLAYER_NAMEPLATE_CLASS,
} from "../../constants/board/ingamePlayerAssets.js"
import {
  buildInGamePlayerNameplateStyle,
  resolveInGamePlayerCardThemeStyles,
} from "../../utils/playerCardStyles.js"
import { buildNameplateBand } from "../../utils/nameplateBand.js"

export default function InGamePlayerNameplate({
  nickname = "",
  theme = null,
  voteHighlight = false,
}) {
  const themeStyles = resolveInGamePlayerCardThemeStyles(theme, voteHighlight)
  if (!nickname) return null
  // 이름 색에 맞는 띠 (밝은 색은 어두운 띠, 짙은 색은 밝은 띠)
  const band = buildNameplateBand(themeStyles?.color)

  return (
    <p className={`${INGAME_PLAYER_NAMEPLATE_CLASS} ${INGAME_PLAYER_NAMEPLATE_BAND_PLATE_CLASS}`} style={buildInGamePlayerNameplateStyle(themeStyles)}>
      <span className={INGAME_PLAYER_NAMEPLATE_BAND_CLASS} style={band.style} data-ingame-nameplate-band={band.kind}>{nickname}</span>
    </p>
  )
}
