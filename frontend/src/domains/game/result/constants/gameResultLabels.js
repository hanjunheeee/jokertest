// 결과 화면 글자: 직업 이름·버튼·내 정보 배지·받은 판 골드·이긴 진영
// 결과 컴포넌트·GameResultPage·buildGameResultViewModel이 씀

// 직업 이름 (시민은 화면 이름 "귀족")
export const GAME_RESULT_JOB_LABELS = {
  JOKER: "광대",
  CITIZEN: "귀족",
  DOCTOR: "주치의",
  GUARD: "경비원",
  WITCH_HUNTER: "마녀사냥꾼",
}

// 버튼 글자
export const GAME_RESULT_MATCHING_BUTTON_LABEL = "대기방으로"

// 대기방 가는 중 버튼 글자 (방 만들기 응답 기다리는 동안)
export const GAME_RESULT_MATCHING_PENDING_LABEL = "이동 중.."

export const GAME_RESULT_LOBBY_BUTTON_LABEL = "로비로"

// 내 줄 배지
export const SELF_INFO_BADGE_LABEL = "내 정보"

// 받은 판 골드 글자 (0 이하면 안 보여서 null), 예: 1 → "+1골드"
export function formatGoldRewardLabel(goldReward) {
  if (!Number.isInteger(goldReward) || goldReward <= 0) return null
  return `+${goldReward}골드`
}

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
