/**
 * DAY 투표 제출 상태의 초기값. hasSubmitted:false는 "이번 컨텍스트(gameId+dayIndex)에서
 * 성공 ack를 받은 적 없음"을 뜻하고, invalidate() 시에도 이 값으로 되돌아간다 — UI 표시
 * 여부는 오직 hasSubmitted로만 판단하고 lastSubmittedTargetId(null도 유효한 기권 값)로는
 * 판단하지 않는다.
 */
export const INITIAL_DAY_VOTE_SUBMIT_STATE = {
  status: "idle",
  error: null,
  hasSubmitted: false,
  lastSubmittedTargetId: null,
}

/**
 * DAY 투표 ack 응답이 도착했을 때 반영할 상태를 계산한다. 성공(ok:true)은 hasSubmitted:true와
 * 이번에 제출한 targetId(기권이면 null)를 반영한다. 실패는 error만 반영하고 이전
 * hasSubmitted/lastSubmittedTargetId를 그대로 유지한다(직전 성공 이력이 실패 재시도로
 * 사라지지 않는다).
 */
export function computeDayVoteSubmitPatch(prevState, ackResult, submittedTargetId) {
  if (ackResult && ackResult.ok === true) {
    return { status: "idle", error: null, hasSubmitted: true, lastSubmittedTargetId: submittedTargetId }
  }
  return {
    status: "idle",
    error: {
      code: ackResult?.code ?? "UNKNOWN_ERROR",
      message: ackResult?.message ?? "요청을 처리하지 못했습니다.",
    },
    hasSubmitted: prevState.hasSubmitted,
    lastSubmittedTargetId: prevState.lastSubmittedTargetId,
  }
}
