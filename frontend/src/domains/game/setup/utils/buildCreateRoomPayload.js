/**
 * 설정 화면의 checks/ranges 상태를 create_room 요청 payload로 변환합니다.
 * React/Socket/Zustand에 의존하지 않는 순수 함수입니다.
 * @param {{checks: Record<string, boolean>, ranges: Record<string, number>}} state
 * @returns {object} create_room emit에 실릴 payload
 */
export function buildCreateRoomPayload({ checks, ranges }) {
  return {
    // "코드로만 참가" 체크 여부를 accessType으로 변환한다. 체크 시 "코드를 아는 사람만
    // 참가 가능"이라는 의미라 "code"로, 아니면 "open"으로 매핑한다.
    accessType: checks["private-lobby"] ? "code" : "open",
    maxPlayers: ranges["max-players"],
    jokerCount: ranges["joker-count"],
    lightsOut: checks["lights-out"],
    soulBetting: checks["soul-betting"],
    dayDiscussionTime: ranges["day-discussion-time"],
    dayVoteTime: ranges["day-vote-time"],
    nightActionTime: ranges["night-action-time"],
    voteReveal: checks["vote-reveal"],
  }
}
