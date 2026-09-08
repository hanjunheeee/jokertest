import {
  GAME_RESULT_WINNING_TEAM_BADGE_CITIZEN_CLASS,
  GAME_RESULT_WINNING_TEAM_BADGE_CLASS,
  GAME_RESULT_WINNING_TEAM_BADGE_JOKER_CLASS,
  GAME_RESULT_WINNING_TEAM_BADGE_WRAP_CLASS,
} from "../constants/gameResultLayout.js"
import { resolveGameResultWinningTeamLabel } from "../constants/gameResultLabels.js"

/** @param {"CITIZEN" | "JOKER" | null | undefined} winningTeam */
export default function GameResultWinningTeamBadge({ winningTeam }) {
  const label = resolveGameResultWinningTeamLabel(winningTeam)
  if (!label) return null

  const toneClass =
    winningTeam === "JOKER"
      ? GAME_RESULT_WINNING_TEAM_BADGE_JOKER_CLASS
      : GAME_RESULT_WINNING_TEAM_BADGE_CITIZEN_CLASS

  return (
    <div className={GAME_RESULT_WINNING_TEAM_BADGE_WRAP_CLASS}>
      <span className={`${GAME_RESULT_WINNING_TEAM_BADGE_CLASS} ${toneClass}`}>
        {label}
      </span>
    </div>
  )
}
