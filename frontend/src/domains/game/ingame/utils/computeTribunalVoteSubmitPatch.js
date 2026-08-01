/** TRIBUNAL 투표 제출 상태의 초기값. */
export const INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE = {
  status: "idle",
  submittedVote: null,
  error: null,
}

const VALID_VOTES = new Set(["GUILTY", "NOT_GUILTY"])

/**
 * cast_tribunal_vote ack 응답을 검증해 반영할 상태 패치를 계산한다(순수 함수). ok:true인데
 * gameId(문자열)/dayIndex(정수)/vote(GUILTY|NOT_GUILTY) 중 하나라도 무효하면 성공으로 인정하지
 * 않고 null을 반환한다(호출자가 이를 실패와 동일하게 취급해 fallback 처리하게 한다). ok:false는
 * message가 비어있지 않은 문자열일 때만 그대로 쓰고, 그 외에는 고정 fallback 문자열을 쓴다.
 */
export function computeTribunalVoteAckPatch(response) {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return null

  if (response.ok === true) {
    if (typeof response.gameId !== "string" || response.gameId.trim().length === 0) return null
    if (!Number.isInteger(response.dayIndex)) return null
    if (!VALID_VOTES.has(response.vote)) return null
    return { status: "submitted", submittedVote: response.vote, error: null }
  }

  const message =
    typeof response.message === "string" && response.message.trim().length > 0
      ? response.message
      : "제출하지 못했습니다. 다시 시도해주세요."
  return { status: "idle", submittedVote: null, error: message }
}
