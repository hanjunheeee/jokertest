export const INGAME_TIMEBAR_ASSETS = {
  frame: "/frame/ingame-timebar/진행바 프레임.png",
  indicatorArrow: "/frame/ingame-timebar/지시화살표.png",
  nightNode: "/frame/ingame-timebar/밤시간 노드.png",
  resultNode: "/frame/ingame-timebar/결과발표 노드.png",
  discussionNode: "/frame/ingame-timebar/토론 노드.png",
  voteNode: "/frame/ingame-timebar/추방투표 노드.png",
}

export const INGAME_DAY_TIMEBAR_PHASES = [
  { id: "night", src: INGAME_TIMEBAR_ASSETS.nightNode },
  { id: "result", src: INGAME_TIMEBAR_ASSETS.resultNode },
  { id: "discussion", src: INGAME_TIMEBAR_ASSETS.discussionNode },
  { id: "vote", src: INGAME_TIMEBAR_ASSETS.voteNode },
]

export const INGAME_DAY_TIMEBAR_ACTIVE_PHASE = "discussion"

export const INGAME_TIMEBAR_PREVIEW_DAY = 1

export const INGAME_TIMEBAR_DAY_STATUS_MESSAGE = "낮 — 토론과 투표"

export const INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE = "재판 진행 중"

export function mapGamePhaseToTimebarPhaseId(phase) {
  if (phase === "NIGHT") return "night"
  if (phase === "TRIBUNAL") return "vote"
  if (phase === "ENDED") return "result"
  if (phase === "ROLE_REVEAL") return "discussion"
  return "discussion"
}
