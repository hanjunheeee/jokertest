/** 결과 페이지 직업 표시명 — role → 한글 (시안 기준) */
export const GAME_RESULT_JOB_LABELS = {
  JOKER: "광대",
  CITIZEN: "귀족",
  DOCTOR: "주치의",
  GUARD: "경비원",
  WITCH_HUNTER: "귀족",
}

/** 승리 진영 뱃지 문구 */
export const GAME_RESULT_WINNING_TEAM_LABELS = {
  CITIZEN: "시민 진영 승리",
  JOKER: "광대 진영 승리",
}

/** @param {"CITIZEN" | "JOKER" | null | undefined} winningTeam */
export function resolveGameResultWinningTeamLabel(winningTeam) {
  if (!winningTeam) return null
  return GAME_RESULT_WINNING_TEAM_LABELS[winningTeam] ?? null
}
