/**
 * 플레이어별 전적목록 — 플레이어 한 줄
 */
import { INGAME_PLAYER_RECORD_LIST_ASSETS } from "../../../constants/ingamePlayerRecordListAssets.js"
import { formatPlayerRecordStats } from "../../../constants/ingamePlayerRecordListData.js"
import {
  INGAME_PLAYER_RECORD_LIST_NAME_CLASS,
  INGAME_PLAYER_RECORD_LIST_PROFILE_FRAME_CLASS,
  INGAME_PLAYER_RECORD_LIST_PROFILE_WRAP_CLASS,
  INGAME_PLAYER_RECORD_LIST_ROW_CLASS,
  INGAME_PLAYER_RECORD_LIST_ROW_INNER_CLASS,
  INGAME_PLAYER_RECORD_LIST_STATS_CLASS,
  INGAME_PLAYER_RECORD_LIST_TITLE_FRAME_CLASS,
  INGAME_PLAYER_RECORD_LIST_TITLE_TEXT_CLASS,
  INGAME_PLAYER_RECORD_LIST_TITLE_WRAP_CLASS,
} from "../../../constants/ingamePlayerRecordListLayout.js"
import { pickInGameJobPortrait } from "../../../utils/pickInGameJobPortrait.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function PlayerRecordListRow({
  index,
  name,
  wins,
  losses,
  winRate,
  title,
  portraitSrc,
}) {
  const resolvedPortraitSrc = portraitSrc ?? pickInGameJobPortrait(index)

  return (
    <li className={INGAME_PLAYER_RECORD_LIST_ROW_CLASS}>
      <div className={INGAME_PLAYER_RECORD_LIST_ROW_INNER_CLASS}>
        <div className={INGAME_PLAYER_RECORD_LIST_PROFILE_WRAP_CLASS}>
          <PlayerPortraitFrame variant="recordList" src={resolvedPortraitSrc} />
          <PublicAsset
            src={INGAME_PLAYER_RECORD_LIST_ASSETS.profileFrame}
            alt=""
            className={INGAME_PLAYER_RECORD_LIST_PROFILE_FRAME_CLASS}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className={INGAME_PLAYER_RECORD_LIST_NAME_CLASS}>{name}</p>
          <p className={INGAME_PLAYER_RECORD_LIST_STATS_CLASS}>
            {formatPlayerRecordStats({ wins, losses, winRate })}
          </p>
        </div>

        <div className={INGAME_PLAYER_RECORD_LIST_TITLE_WRAP_CLASS}>
          <PublicAsset
            src={INGAME_PLAYER_RECORD_LIST_ASSETS.titleFrame}
            alt=""
            className={INGAME_PLAYER_RECORD_LIST_TITLE_FRAME_CLASS}
          />
          <span className={INGAME_PLAYER_RECORD_LIST_TITLE_TEXT_CLASS}>
            {title}
          </span>
        </div>
      </div>
    </li>
  )
}
