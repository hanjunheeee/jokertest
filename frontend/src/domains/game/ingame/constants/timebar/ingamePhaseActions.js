// 단계 행동 표시 이름과 값들 (구석 패널 버튼도 같은 표시, 시험이 찾음) + 마감 당김 표시 이름
// 단계 행동 줄·구석 행동 패널·시간 바와 시험이 사용

export const PHASE_ACTION_ATTR = "data-ingame-phase-action"

// 표가 다 차 마감이 5초 뒤로 당겨진 동안 시간 바에 붙는 표시 (시험이 찾음)
export const PHASE_SETTLE_ATTR = "data-ingame-phase-settle"

// 낮 집계·재판 판정·밤 종료 단추는 없어짐 (판정은 서버가 표가 다 차면 5초 뒤 함)
export const INGAME_PHASE_ACTIONS = Object.freeze({
  DAY_READY: "dayReady",
  DAY_VOTE_ABSTAIN: "dayVoteAbstain",
  NIGHT_SKIP: "nightSkip",
})
