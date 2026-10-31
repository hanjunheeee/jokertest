export const GAME_RESULT_JOB_LABELS = {
  JOKER: "광대",
  CITIZEN: "귀족",
  DOCTOR: "주치의",
  GUARD: "경비원",
  WITCH_HUNTER: "귀족",
}

export const GAME_RESULT_MATCHING_BUTTON_LABEL = "대기방으로"

export const GAME_RESULT_LOBBY_BUTTON_LABEL = "로비로"

export const GAME_RESULT_SELF_INFO_BADGE_LABEL = "내 정보"

export const GAME_RESULT_WINNING_TEAM_LABELS = {
  CITIZEN: "시민 진영 승리",
  JOKER: "광대 진영 승리",
}

export function resolveGameResultWinningTeamLabel(winningTeam) {
  if (!winningTeam) return null
  return GAME_RESULT_WINNING_TEAM_LABELS[winningTeam] ?? null
}
