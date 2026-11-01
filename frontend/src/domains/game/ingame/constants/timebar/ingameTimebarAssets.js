/**
 * 인게임 시간흐름 바 에셋·prototype 단계 설정.
 *
 * InGameTimebar에서 사용합니다. 추후 game phase·day state 연동 예정.
 * 탑레벨 프레임 상태 문구는 `[구분-세부]` 태그 형태(formatInGameTimebarPhaseTag)로 통일한다.
 * 밤 역할 턴의 역할명(label)은 constants/nightTurn/ingameNightTurnAnnouncement.js가 유일한 출처이다.
 */
import { formatInGameTimebarPhaseTag } from "../../utils/formatInGameTimebarPhaseTag.js"

/** 인게임 시간흐름 바 public 에셋 (frontend/public/frame/ingame-timebar) */
export const INGAME_TIMEBAR_ASSETS = {
  frame: "/frame/ingame-timebar/진행바 프레임.png",
  frameExpanded: "/frame/ingame-timebar/진행바(확대) 프레임.png",
  expandButton: "/button/확대표시 버튼.png",
  timerFrame: "/frame/ingame-timebar/타이머바 프레임.png",
  timerGauge: "/frame/ingame-timebar/타이머바 게이지.png",
  timerCenterMarker: "/frame/ingame-timebar/타이머바 중앙마커.png",
  indicatorArrow: "/frame/ingame-timebar/지시화살표.png",
  nightNode: "/frame/ingame-timebar/밤시간 노드.png",
  resultNode: "/frame/ingame-timebar/결과발표 노드.png",
  discussionNode: "/frame/ingame-timebar/토론 노드.png",
  voteNode: "/frame/ingame-timebar/추방투표 노드.png",
  phaseHeaderPlate: "/frame/탑레벨 프레임_1_.png",
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

/** DAY 단계 — 탑레벨 프레임 상태 태그 */
export const INGAME_TIMEBAR_DAY_STATUS_MESSAGE = formatInGameTimebarPhaseTag("낮", "토론과 투표")

/** NIGHT — 역할 턴 없음(턴 전환·대기) */
export const INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE = formatInGameTimebarPhaseTag("밤", "활동 시간")

/** TRIBUNAL 단계 — 탑레벨 프레임 상태 태그 */
export const INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE = formatInGameTimebarPhaseTag("재판", "진행 중")

/**
 * 서버 GamePhase를 기존 타임바 노드 id에 매핑합니다.
 * 새 타임바 UI를 만들지 않고 기존 노드만 재사용하기 위한 연결 계층입니다.
 */
export function mapGamePhaseToTimebarPhaseId(phase) {
  if (phase === "NIGHT") return "night"
  if (phase === "TRIBUNAL") return "vote"
  if (phase === "ENDED") return "result"
  // 역할 확인 단계를 임시로 discussion 노드에 표시한다. 실제 역할 확인 연출은 다음 슬라이스의 몫이다.
  if (phase === "ROLE_REVEAL") return "discussion"
  return "discussion"
}
