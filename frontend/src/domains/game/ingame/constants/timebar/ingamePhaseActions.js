// 단계 행동 표시 이름과 값들 (구석 패널 버튼도 같은 표시, 시험이 찾음)
// 단계 행동 줄·구석 행동 패널과 시험이 사용

export const PHASE_ACTION_ATTR = "data-ingame-phase-action"

export const INGAME_PHASE_ACTIONS = Object.freeze({
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  DAY_VOTE_RESOLVE: "dayVoteResolve",
  TRIBUNAL_RESOLVE: "tribunalResolve",
  NIGHT_SKIP: "nightSkip",
  NIGHT_RESOLVE: "nightResolve",
})
