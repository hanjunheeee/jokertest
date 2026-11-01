// 이긴 진영 배지 ("시민 진영 승리"/"광대 진영 승리")
// GameResultPlayerList가 씀, 진영 모르면 안 그림
import {
  WINNING_TEAM_BADGE_CITIZEN_CLASS,
  WINNING_TEAM_BADGE_CLASS,
  WINNING_TEAM_BADGE_JOKER_CLASS,
  WINNING_TEAM_BADGE_WRAP_CLASS,
} from "../constants/gameResultLayout.js"
import { resolveWinningTeamLabel } from "../constants/gameResultLabels.js"

// 이긴 진영 배지 (광대면 다른 색)
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
