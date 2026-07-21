import { INGAME_VOTE_ASSETS } from "../../constants/vote/ingameVoteAssets.js"
import {
  INGAME_VOTE_CHECKBOX_CLASS,
  INGAME_VOTE_CHECKBOX_IMG_CLASS,
  INGAME_VOTE_CHECKMARK_CLASS,
  INGAME_VOTE_COUNT_ACTIVE_CLASS,
  INGAME_VOTE_COUNT_CLASS,
  INGAME_VOTE_COUNT_IDLE_CLASS,
  INGAME_VOTE_COUNT_WRAP_CLASS,
  INGAME_VOTE_CROWN_CLASS,
  INGAME_VOTE_NAME_CLASS,
  INGAME_VOTE_PROFILE_WRAP_CLASS,
  INGAME_VOTE_ROW_CLASS,
  INGAME_VOTE_ROW_INNER_CLASS,
} from "../../constants/vote/ingameVoteLayout.js"
import { INGAME_PLAYER_THEME_TEXT_RENDER_CLASS } from "../../constants/ingamePlayerTheme.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import PlayerPortraitFrame from "@/shared/ui/PlayerPortraitFrame.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function InGameVoteStatusRow({
  playerId,
  name,
  portraitSrc,
  voteCount,
  isLeader = false,
  selected = false,
  onToggleSelect,
}) {
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null
  const nameStyle = themeStyles ? { color: themeStyles.color } : undefined
  const nameClass =
    `${INGAME_VOTE_NAME_CLASS} ${themeStyles ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : ""}`.trim()

  const countClass = `${INGAME_VOTE_COUNT_CLASS} ${
    voteCount > 0 ? INGAME_VOTE_COUNT_ACTIVE_CLASS : INGAME_VOTE_COUNT_IDLE_CLASS
  }`

  return (
    <li className={INGAME_VOTE_ROW_CLASS}>
      <div className={INGAME_VOTE_ROW_INNER_CLASS}>
        <div className={INGAME_VOTE_PROFILE_WRAP_CLASS}>
          <PlayerPortraitFrame variant="voteStatus" src={portraitSrc} />
        </div>

        <p className={nameClass} style={nameStyle}>
          {name}
        </p>

        <div className={INGAME_VOTE_COUNT_WRAP_CLASS} aria-label={`${voteCount}표`}>
          {isLeader ? (
            <span className={INGAME_VOTE_CROWN_CLASS} aria-hidden="true">
              ♛
            </span>
          ) : null}
          <span className={countClass}>{voteCount}</span>
        </div>

        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`${name}에게 투표`}
          onClick={onToggleSelect}
          className={INGAME_VOTE_CHECKBOX_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={INGAME_VOTE_ASSETS.checkbox}
            alt=""
            className={INGAME_VOTE_CHECKBOX_IMG_CLASS}
          />
          {selected ? (
            <PublicAsset
              src={INGAME_VOTE_ASSETS.checkMark}
              alt=""
              className={INGAME_VOTE_CHECKMARK_CLASS}
            />
          ) : null}
        </button>
      </div>
    </li>
  )
}