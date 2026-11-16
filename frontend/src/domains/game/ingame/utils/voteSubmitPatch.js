// 낮 투표·재판 투표 제출 응답을 상태 조각으로 바꾸기 (상태를 안 건드리는 순수 계산), 재판 거절 코드 → 우리말 글
// 낮 투표·재판 투표 제출 훅과 제출 컨트롤러가 사용, 재판 거절 글은 재판 창 밖 거절 글(PC·모바일)로 보임

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
  errorCode: null,
}

// 재판 표 거절 코드 → 보일 글 (서버 game-core/phase/tribunal/vote.js·socket 재판 핸들러가 내는 코드 전부)
// 재판 상태 어긋남·판 못 찾음 같은 내부 사정은 서버가 INTERNAL_ERROR로 바꿔 보냄
const TRIBUNAL_VOTE_ERROR_TEXT = Object.freeze({
  TRIBUNAL_ALREADY_RESOLVED: "재판이 이미 판정되어 투표할 수 없습니다.",
  TRIBUNAL_VOTE_ALREADY_SUBMITTED: "이미 표를 냈습니다. 낸 표는 바꿀 수 없습니다.",
  DEFENDANT_CANNOT_VOTE: "재판에 오른 사람은 투표할 수 없습니다.",
  PLAYER_NOT_ALIVE: "죽은 사람은 투표할 수 없습니다.",
  INVALID_PHASE: "재판이 끝나 투표할 수 없습니다.",
  // 끝난 판에 낸 표 (서버가 끝난 판 요청을 이 코드 하나로 거절함)
  GAME_ALREADY_ENDED: "판이 끝나 투표할 수 없습니다.",
  STALE_DAY_INDEX: "지난 재판이라 투표할 수 없습니다.",
  INVALID_TRIBUNAL_VOTE: "유죄나 무죄만 고를 수 있습니다.",
  NOT_IN_SESSION: "지금 참여 중인 판이 아니라 투표할 수 없습니다.",
  STALE_SESSION_MISMATCH: "지금 참여 중인 판이 아니라 투표할 수 없습니다.",
  STALE_SOCKET: "다른 창에서 접속 중이라 이 창에서는 투표할 수 없습니다.",
  INVALID_GAME_ID: "잘못된 요청입니다. 다시 시도해주세요.",
  INVALID_DAY_INDEX: "잘못된 요청입니다. 다시 시도해주세요.",
  INVALID_PAYLOAD: "잘못된 요청입니다. 다시 시도해주세요.",
  INTERNAL_ERROR: "서버에서 처리하지 못했습니다. 다시 시도해주세요.",
})

// 표에 없는 코드일 때 글
const TRIBUNAL_VOTE_ERROR_FALLBACK = "제출하지 못했습니다. 다시 시도해주세요."

// 재판 거절 코드 → 글: 표 먼저, 없으면 서버 글, 그것도 없으면 기본 글
// 예: { code: "TRIBUNAL_VOTE_ALREADY_SUBMITTED" } → "이미 표를 냈습니다. …", { code: "X", message: "" } → "제출하지 못했습니다. …"
export function tribunalVoteErrorText(code, message) {
  if (typeof code === "string" && Object.hasOwn(TRIBUNAL_VOTE_ERROR_TEXT, code)) return TRIBUNAL_VOTE_ERROR_TEXT[code]
  if (typeof message === "string" && message.trim().length > 0) return message
  return TRIBUNAL_VOTE_ERROR_FALLBACK
}

// 받는 투표 값 (유죄·무죄)
const VALID_VOTES = new Set(["GUILTY", "NOT_GUILTY"])

// 재판 투표 제출 응답 검사 → 상태 조각 (모양이 틀리면 null)
export function computeTribunalVoteAckPatch(response) {
  if (response === null || typeof response !== "object" || Array.isArray(response)) return null

  if (response.ok === true) {
    if (typeof response.gameId !== "string" || response.gameId.trim().length === 0) return null
    if (!Number.isInteger(response.dayIndex)) return null
    if (!VALID_VOTES.has(response.vote)) return null
    return { status: "submitted", submittedVote: response.vote, error: null, errorCode: null }
  }

  // 거절 코드는 남김 (진짜 까닭을 글로 바꾸고, 부르는 쪽이 코드로도 가를 수 있게)
  const errorCode = typeof response.code === "string" && response.code.length > 0 ? response.code : null
  return {
    status: "idle",
    submittedVote: null,
    error: tribunalVoteErrorText(errorCode, response.message),
    errorCode,
  }
}
