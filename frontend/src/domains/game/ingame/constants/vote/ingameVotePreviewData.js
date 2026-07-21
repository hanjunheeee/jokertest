/**
 * 투표현황 팝업 개발용 더미 데이터.
 *
 * 백엔드 연동 전 — 세션 players와 index로 병합합니다.
 */

/** prototype 투표현황창.png — 플레이어별 득표 수 (0~10명) */
export const DUMMY_VOTE_COUNTS = [4, 1, 1, 2, 1, 1, 1, 0, 1, 1]

export function resolveVoteStatusLeaderVoteCount(voteCounts) {
  if (!voteCounts.length) return 0

  const maxCount = Math.max(...voteCounts)
  return maxCount > 0 ? maxCount : 0
}

export function isVoteStatusLeader(voteCount, leaderVoteCount) {
  return leaderVoteCount > 0 && voteCount === leaderVoteCount
}