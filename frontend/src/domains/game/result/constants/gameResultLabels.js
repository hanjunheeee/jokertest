// 결과 화면 글자: 직업 이름·버튼·내 정보 배지·이긴 진영
// 결과 컴포넌트·GameResultPage·buildGameResultViewModel이 씀

// 직업 이름 (마녀사냥꾼도 "귀족"으로 보임)
export const GAME_RESULT_JOB_LABELS = {
  JOKER: "광대",
  CITIZEN: "귀족",
  DOCTOR: "주치의",
  GUARD: "경비원",
  WITCH_HUNTER: "귀족",
}

// 버튼 글자
export const GAME_RESULT_MATCHING_BUTTON_LABEL = "대기방으로"

export const GAME_RESULT_LOBBY_BUTTON_LABEL = "로비로"

// 내 줄 배지
export const SELF_INFO_BADGE_LABEL = "내 정보"

// 이긴 진영 글자
export const WINNING_TEAM_LABELS = {
  CITIZEN: "시민 진영 승리",
  JOKER: "광대 진영 승리",
}

// 이긴 진영 글자 고르기 (모르는 값이면 null)
export function resolveWinningTeamLabel(winningTeam) {
  if (!winningTeam) return null
  return WINNING_TEAM_LABELS[winningTeam] ?? null
}
