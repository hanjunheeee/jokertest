export const INITIAL_DAY_VOTE_SUBMIT_STATE = {
  status: "idle",
  error: null,
  hasSubmitted: false,
  lastSubmittedTargetId: null,
}

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
