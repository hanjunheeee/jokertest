/** 결과 페이지 직업 표시명 — role → 한글 (시안 기준) */
export const GAME_RESULT_JOB_LABELS = {
  JOKER: "광대",
  CITIZEN: "귀족",
  DOCTOR: "주치의",
  GUARD: "경비원",
  WITCH_HUNTER: "귀족",
}

/** 결과 화면 — 같은 방 매칭 대기실 복귀 버튼 */
export const GAME_RESULT_MATCHING_BUTTON_LABEL = "대기방으로"

/** 결과 화면 — 로비 복귀 버튼 */
export const GAME_RESULT_LOBBY_BUTTON_LABEL = "로비로"

/** 참가자 정체 목록 — 본인 행 뱃지 */
export const GAME_RESULT_SELF_INFO_BADGE_LABEL = "내 정보"

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
