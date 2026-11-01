// 낮 투표·재판 투표 제출 응답을 상태 조각으로 바꾸기 (상태를 안 건드리는 순수 계산)
// 낮 투표·재판 투표 제출 훅과 제출 컨트롤러가 사용

// 낮 투표 제출 처음 상태
export const INITIAL_DAY_VOTE_SUBMIT_STATE = {
  status: "idle",
  error: null,
  hasSubmitted: false,
  lastSubmittedTargetId: null,
}

// 낮 투표 제출 응답 → 상태 조각 (실패면 전에 낸 표는 그대로 둠)
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

// 재판 투표 제출 처음 상태
export const INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE = {
  status: "idle",
  submittedVote: null,
  error: null,
}

const VALID_VOTES = new Set(["GUILTY", "NOT_GUILTY"])

// 재판 투표 제출 응답 검사 → 상태 조각 (모양이 틀리면 null)
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
