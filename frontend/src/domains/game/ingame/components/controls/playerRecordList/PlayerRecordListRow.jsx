/**
 * 플레이어별 전적목록 — 플레이어 한 줄
 */
import { formatPlayerRecordStats } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
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

/**
 * CO S-1(AC-05): totalGames/winRate는 상위 Content가 그 플레이어의 own-property에서 그대로
 * 가져온 서버 값이다. 조회하지 못한 참가자에게는 둘 다 넘어오지 않고(undefined),
 * formatPlayerRecordStats가 그 경우를 "조회 실패"로 말한다 — 이 컴포넌트는 판단하지 않는다.
 */
export default function PlayerRecordListRow({
  playerId = null,
  name,
  totalGames,
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
            <p
              className={INGAME_PLAYER_RECORD_LIST_STATS_CLASS}
              data-testid={playerId ? `player-record-stats-${playerId}` : undefined}
            >
              {formatPlayerRecordStats({ totalGames, winRate })}
            </p>
          </div>
        </div>
      </div>
    </li>
  )
}
