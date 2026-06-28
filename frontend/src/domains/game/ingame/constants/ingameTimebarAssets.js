/**
 * 인게임 시간흐름 바 에셋·prototype 단계 설정.
 *
 * InGameTimebar에서 사용합니다. 추후 game phase·day state 연동 예정.
 */

/** 인게임 시간흐름 바 public 에셋 (frontend/public/frame/ingame-timebar) */
export const INGAME_TIMEBAR_ASSETS = {
  frame: "/frame/ingame-timebar/진행바 프레임.png",
  indicatorArrow: "/frame/ingame-timebar/지시화살표.png",
  nightNode: "/frame/ingame-timebar/밤시간 노드.png",
  resultNode: "/frame/ingame-timebar/결과발표 노드.png",
  discussionNode: "/frame/ingame-timebar/토론 노드.png",
  voteNode: "/frame/ingame-timebar/추방투표 노드.png",
}

/** 낮 진행 바 노드 순서 (prototype 상단 — 밤 → 결과발표 → 토론 → 추방투표) */
export const INGAME_DAY_TIMEBAR_PHASES = [
  { id: "night", src: INGAME_TIMEBAR_ASSETS.nightNode },
  { id: "result", src: INGAME_TIMEBAR_ASSETS.resultNode },
  { id: "discussion", src: INGAME_TIMEBAR_ASSETS.discussionNode },
  { id: "vote", src: INGAME_TIMEBAR_ASSETS.voteNode },
]

/** prototype 낮 상태 — 토론 단계 활성 */
export const INGAME_DAY_TIMEBAR_ACTIVE_PHASE = "discussion"

/** prototype 일차 표시 — 추후 game state day 값으로 교체 */
export const INGAME_TIMEBAR_PREVIEW_DAY = 1
