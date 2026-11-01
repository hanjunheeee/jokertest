// 전적 목록 한 줄: 프로필 그림·이름·판 수와 승률
// 전적 목록 내용(PlayerRecordListContent)이 사용
import { formatPlayerRecordStats } from "../../../constants/controls/playerRecordList/ingamePlayerRecordListData.js"
import {
  INFO_CLASS,
  NAME_CLASS,
  NAME_ROW_CLASS,
  PROFILE_PORTRAIT_WRAP_CLASS,
  PROFILE_PORTRAIT_PHOTO_WRAP_CLASS,
  ROW_CLASS,
  ROW_INNER_CLASS,
  STATS_CLASS,
} from "../../../constants/controls/playerRecordList/ingamePlayerRecordListLayout.js"
import { THEME_TEXT_RENDER_CLASS } from "../../../../../../shared/constants/ingamePlayerTheme.js"
import { useInGamePlayerSessionContext } from "../../InGamePlayerSessionContext.js"
import PlayerProfilePortrait from "@/shared/ui/PlayerProfilePortrait.jsx"

// 이름 색은 플레이어 세션 문맥에서 받음 (id 없으면 기본색)
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
    `${NAME_CLASS} ${themeStyles ? THEME_TEXT_RENDER_CLASS : ""}`.trim()

  // 전적 글은 formatPlayerRecordStats가 만듦 (숫자 없으면 조회 실패)
  return (
    <li className={ROW_CLASS}>
      <div className={ROW_INNER_CLASS}>
        <PlayerProfilePortrait
          photoSrc={profilePhotoSrc}
          frameSrc={profileBorderSrc}
          wrapClassName={PROFILE_PORTRAIT_WRAP_CLASS}
          photoWrapClassName={PROFILE_PORTRAIT_PHOTO_WRAP_CLASS}
        />

        <div className={INFO_CLASS}>
          <div className={NAME_ROW_CLASS}>
            <p className={nameClass} style={nameStyle}>
              {name}
            </p>
            <p
              className={STATS_CLASS}
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
