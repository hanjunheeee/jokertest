// 단계가 바뀔 때 "이번 단계에 이미 함" 표시 풀기 (스냅샷만 값을 넣어서 안 풀면 다음 단계까지 남음)
// 단계·투표 결과 액션(store/ingame/phaseActions.js·voteActions.js)·내 진행 받기가 사용

// 낮 투표 제출 기록 칸 (서버가 준 내 표, 받은 날짜 표시 포함)
const DAY_VOTE_SUBMISSION_KEYS = ["hasSubmittedDayVote", "dayVoteTargetUuid", "dayVoteRound", "dayVoteDayIndex"]

// 재판 표 냈음 칸 (서버가 재판 중에만 보내 다음 재판에서 안 덮임)
const TRIBUNAL_VOTE_SUBMISSION_KEYS = ["hasSubmittedTribunalVote"]

// 본인 정보에서 칸 지우기 조각 (지울 칸이 없으면 빈 조각)
function dropSelfKeys(state, keys) {
  const self = state?.self
  if (!self || !keys.some((key) => Object.hasOwn(self, key))) return {}
  const next = { ...self }
  for (const key of keys) delete next[key]
  return { self: next }
}

// 새 낮이 되면 지난 날 내 낮 표·재판 표 기록 지우기 (날마다 회차가 1부터라 회차만으론 못 가림)
export function clearLastDaySubmissions(state) {
  return dropSelfKeys(state, [...DAY_VOTE_SUBMISSION_KEYS, ...TRIBUNAL_VOTE_SUBMISSION_KEYS])
}

// 재판에 들어설 때 지난 재판 표 냈음 표시 지우기 (안 지우면 둘째 날 재판 단추가 안 뜸)
export function clearTribunalVoteSubmission(state) {
  return dropSelfKeys(state, TRIBUNAL_VOTE_SUBMISSION_KEYS)
}

// 서버가 준 내 표 기록에 어느 날 것인지 붙이기 (표 기록이 없으면 그대로)
export function tagDayVoteSubmissionDay(self, dayIndex) {
  if (!self || !Object.hasOwn(self, "hasSubmittedDayVote") || !Number.isInteger(dayIndex)) return self
  return { ...self, dayVoteDayIndex: dayIndex }
}

// 판 상태에 펼쳐 넣을 조각: 이미 함 표시가 켜져 있을 때만 본인 정보를 새로 만듦, 아니면 빈 조각
export function clearSelfActed(state) {
  const self = state?.self
  if (!self || self.hasActedThisPhase !== true) return {}
  return { self: { ...self, hasActedThisPhase: false } }
}
