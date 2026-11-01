// 위쪽 진행 바 그림·단계 순서·상태 글, 판 단계 → 바 단계 바꾸기
// 진행 바·InGamePage·InGamePlayArea·진행 바 상태 글 고르기가 사용

// 진행 바 틀·화살표·단계 그림
export const INGAME_TIMEBAR_ASSETS = {
  frame: "/frame/ingame-timebar/진행바 프레임.png",
  indicatorArrow: "/frame/ingame-timebar/지시화살표.png",
  nightNode: "/frame/ingame-timebar/밤시간 노드.png",
  resultNode: "/frame/ingame-timebar/결과발표 노드.png",
  discussionNode: "/frame/ingame-timebar/토론 노드.png",
  voteNode: "/frame/ingame-timebar/추방투표 노드.png",
}

// 바에 그리는 단계 순서 (밤 → 결과 → 토론 → 투표)
export const INGAME_DAY_TIMEBAR_PHASES = [
  { id: "night", src: INGAME_TIMEBAR_ASSETS.nightNode },
  { id: "result", src: INGAME_TIMEBAR_ASSETS.resultNode },
  { id: "discussion", src: INGAME_TIMEBAR_ASSETS.discussionNode },
  { id: "vote", src: INGAME_TIMEBAR_ASSETS.voteNode },
]

// 값이 안 올 때 진행 바가 쓰는 기본 단계·날짜
export const DAY_TIMEBAR_ACTIVE_PHASE = "discussion"

export const PREVIEW_DAY = 1

// 낮·재판 상태 글
export const INGAME_TIMEBAR_DAY_STATUS_MESSAGE = "낮 — 토론과 투표"

export const INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE = "재판 진행 중"

// 판 단계 → 바 단계 (재판은 투표, 끝나면 결과, 나머지는 토론)
export function mapGamePhaseToTimebarPhaseId(phase) {
  if (phase === "NIGHT") return "night"
  if (phase === "TRIBUNAL") return "vote"
  if (phase === "ENDED") return "result"
  if (phase === "ROLE_REVEAL") return "discussion"
  return "discussion"
}
