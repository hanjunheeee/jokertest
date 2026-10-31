export const INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE = {
  status: "idle",
  submittedVote: null,
  error: null,
}

const VALID_VOTES = new Set(["GUILTY", "NOT_GUILTY"])

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
