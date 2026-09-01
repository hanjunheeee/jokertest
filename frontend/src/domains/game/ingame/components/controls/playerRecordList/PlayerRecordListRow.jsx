/**
 * 플레이어별 전적목록 — 플레이어 한 줄
 */
import { formatPlayerRecordStats } from "@/domains/game/ingame/constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import {
  INGAME_PLAYER_RECORD_LIST_INFO_CLASS,
  INGAME_PLAYER_RECORD_LIST_NAME_CLASS,
  INGAME_PLAYER_RECORD_LIST_NAME_ROW_CLASS,
  INGAME_PLAYER_RECORD_LIST_PROFILE_PORTRAIT_WRAP_CLASS,
  INGAME_PLAYER_RECORD_LIST_PROFILE_PORTRAIT_PHOTO_WRAP_CLASS,
  INGAME_PLAYER_RECORD_LIST_ROW_CLASS,
  INGAME_PLAYER_RECORD_LIST_ROW_INNER_CLASS,
  INGAME_PLAYER_RECORD_LIST_STATS_CLASS,
} from "../../../constants/controls/playerRecordList/ingamePlayerRecordListLayout.js"
import { INGAME_PLAYER_THEME_TEXT_RENDER_CLASS } from "../../../constants/ingamePlayerTheme.js"
import { useInGamePlayerSessionContext } from "../../InGamePlayerSessionContext.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"

export default function PlayerRecordListRow({
  playerId = null,
  name,
  wins,
  losses,
  winRate,
  profilePhotoSrc,
  profileBorderSrc,
}) {
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null
  const nameStyle = themeStyles ? { color: themeStyles.color } : undefined
  const nameClass =
    `${INGAME_PLAYER_RECORD_LIST_NAME_CLASS} ${themeStyles ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : ""}`.trim()

  return (
    <li className={INGAME_PLAYER_RECORD_LIST_ROW_CLASS}>
      <div className={INGAME_PLAYER_RECORD_LIST_ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={INGAME_PLAYER_RECORD_LIST_PROFILE_PORTRAIT_WRAP_CLASS}
          photoWrapClassName={INGAME_PLAYER_RECORD_LIST_PROFILE_PORTRAIT_PHOTO_WRAP_CLASS}
        />

        <div className={INGAME_PLAYER_RECORD_LIST_INFO_CLASS}>
          <div className={INGAME_PLAYER_RECORD_LIST_NAME_ROW_CLASS}>
            <p className={nameClass} style={nameStyle}>
              {name}
            </p>
            <p className={INGAME_PLAYER_RECORD_LIST_STATS_CLASS}>
              {formatPlayerRecordStats({ wins, losses, winRate })}
            </p>
          </div>
        </div>
      </div>
    </li>
  )
}
