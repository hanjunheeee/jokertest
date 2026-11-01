import {
  WINNING_TEAM_BADGE_CITIZEN_CLASS,
  WINNING_TEAM_BADGE_CLASS,
  WINNING_TEAM_BADGE_JOKER_CLASS,
  WINNING_TEAM_BADGE_WRAP_CLASS,
} from "../constants/gameResultLayout.js"
import { resolveWinningTeamLabel } from "../constants/gameResultLabels.js"

export default function GameResultWinningTeamBadge({ winningTeam }) {
  const label = resolveWinningTeamLabel(winningTeam)
  if (!label) return null

  const toneClass =
    winningTeam === "JOKER"
      ? WINNING_TEAM_BADGE_JOKER_CLASS
      : WINNING_TEAM_BADGE_CITIZEN_CLASS

  return (
    <div className={WINNING_TEAM_BADGE_WRAP_CLASS}>
      <span className={`${WINNING_TEAM_BADGE_CLASS} ${toneClass}`}>
        {label}
      </span>
    </div>
  )
}
