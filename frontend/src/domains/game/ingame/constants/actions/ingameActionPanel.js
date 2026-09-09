// 이 슬라이스(UI-12)에서 이 파일에 허용된 변경은 "표시 라벨·에셋 키 추가"뿐이다.
// 그래서 이식 이전부터 있던 스타일 상수(PANEL/HEADER/TITLE/META/SECTION/BUTTON/
// TARGET_BUTTON/SELECTED_TARGET_BUTTON)의 값은 원격이 다시 칠했더라도 이식하지 않고
// 이 저장소의 기존 값을 그대로 둔다 — 원격 대조 결과는
// docs/qa/2026-09-09-ui-12-remote-port-audit.md에 남겼다.
// 아래에 새로 추가된 상수(CAPTION·BUTTON_ROW·STATUS/ERROR 텍스트·TARGET_* 카드 표현)는
// 이식된 InGameActionPanel/InGameTargetPicker가 원격과 같은 이름으로 import하는 표시
// 상수라 원격 정의를 그대로 가져왔다.
//
// 밤 행동 자격·재판·낮 토론 라벨 등 게임 규칙에 매인 값도 로컬 계약을 유지한다 — 원격은
// WITCH_HUNTER 하한을 0으로 낮췄지만(그쪽은 서버가 canonical night turn으로 자격을
// 판정한다), 이 저장소의 백엔드 isEligibleForNightAction은 여전히 dayIndex 2를 요구한다.
export const INGAME_ACTION_PANEL_CLASS =
  "absolute bottom-[clamp(0.75rem,2vh,1.25rem)] left-[clamp(0.75rem,2vw,1.25rem)] z-30 w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-[#d8b982]/55 bg-black/72 p-3 text-[#f8ead2] shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-sm"

export const INGAME_ACTION_HEADER_CLASS =
  "flex items-center justify-between gap-3 border-b border-[#d8b982]/25 pb-2"

export const INGAME_ACTION_TITLE_CLASS = "text-sm font-semibold tracking-normal text-[#ffe2ad]"

export const INGAME_ACTION_META_CLASS = "text-[0.7rem] leading-tight text-[#cdbb9e]"

export const INGAME_ACTION_SECTION_CLASS = "mt-3 space-y-2"

// 섹션 안에서 쓰는 작은 라벨(예: "투표 대상 선택") — 본문 텍스트(META)와 구분되는 존재감
// 낮은 캡션 톤이다.
export const INGAME_ACTION_CAPTION_CLASS =
  "text-[0.62rem] font-semibold uppercase tracking-[0.15em] text-[#caa565]/80"

export const INGAME_ACTION_BUTTON_ROW_CLASS = "flex flex-wrap gap-2"

export const INGAME_ACTION_STATUS_TEXT_CLASS = "text-[0.7rem] leading-snug text-[#e7d3ae]/90"

export const INGAME_ACTION_ERROR_TEXT_CLASS = "text-[0.7rem] leading-snug text-[#ff9d8d]"

export const INGAME_ACTION_ERROR_BANNER_CLASS =
  "mt-2 rounded-md border border-red-400/30 bg-red-950/45 px-2.5 py-1.5 text-[0.72rem] leading-snug text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const INGAME_ACTION_BUTTON_CLASS =
  "min-h-8 rounded border border-[#d8b982]/35 bg-[#2b1c15]/85 px-3 py-1.5 text-xs text-[#f8ead2] transition hover:border-[#f3d28d] hover:bg-[#53321f] disabled:cursor-not-allowed disabled:opacity-40"

export const INGAME_ACTION_TARGET_BUTTON_CLASS =
  "min-h-8 rounded border border-[#927556]/45 bg-black/35 px-2 py-1 text-left text-xs text-[#f8ead2] transition hover:border-[#f3d28d] disabled:cursor-not-allowed disabled:opacity-40"

export const INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS =
  `${INGAME_ACTION_TARGET_BUTTON_CLASS} border-[#f3d28d] bg-[#5b321d]/80`

// 플레이어 대상 카드(InGameTargetPicker) 내부 세부 표현 — 이름/생존 상태 한 줄을 배지 스타일로
// 정리해 "의도적으로 선택 가능한 항목"처럼 보이게 한다.
export const INGAME_ACTION_TARGET_GRID_CLASS = "grid max-h-36 grid-cols-2 gap-2 overflow-y-auto pr-1"

export const INGAME_ACTION_TARGET_NAME_CLASS = "block truncate text-[0.78rem] font-medium text-[#f8ead2]"

export const INGAME_ACTION_TARGET_STATUS_ROW_CLASS =
  "flex items-center gap-1 text-[0.62rem] font-medium tracking-wide text-[#cdbb9e]/85"

export const INGAME_ACTION_TARGET_STATUS_DOT_ALIVE_CLASS =
  "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80 shadow-[0_0_4px_rgba(52,211,153,0.7)]"

export const INGAME_ACTION_TARGET_STATUS_DOT_DEAD_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/70"

export const INGAME_ACTION_TARGET_STATUS_DOT_DISCONNECTED_CLASS =
  "h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400/60"

// 역할별 밤 행동 최소 dayIndex입니다. 서버 ROLE_DEFINITIONS.nightActionMinDayIndex의
// UX 전용 사본입니다(서버가 최종 권위자 — 이 값은 대상 선택 UI를 미리 숨기는 용도일 뿐,
// 실제 권한 판정은 항상 서버가 다시 검증합니다). CITIZEN은 항목 자체가 없어 항상 불가합니다.
const NIGHT_ACTION_MIN_DAY_INDEX = Object.freeze({
  JOKER: 0,
  DOCTOR: 0,
  GUARD: 0,
  WITCH_HUNTER: 2,
})

function isNightActionEligible(role, dayIndex) {
  const minDayIndex = NIGHT_ACTION_MIN_DAY_INDEX[role]
  return minDayIndex !== undefined && dayIndex >= minDayIndex
}

// 역할·dayIndex별 밤 행동 타입입니다. 서버에 보낼 action 종류를 프런트에서 미리 판단하기
// 위한 용도이며, 행동 불가(CITIZEN 전체·dayIndex 2 미만 WITCH_HUNTER)면 null을 반환합니다.
export function getInGameNightActionType(role, dayIndex) {
  if (!isNightActionEligible(role, dayIndex)) return null
  if (role === "DOCTOR") return "PROTECT"
  if (role === "JOKER") return "ASSASSINATE"
  if (role === "GUARD") return "INVESTIGATE"
  if (role === "WITCH_HUNTER") return "CONFIRM"
  return null
}

// 역할·dayIndex별 밤 행동 버튼 문구입니다. 행동 불가면 null을 반환합니다.
export function getInGameNightActionLabel(role, dayIndex) {
  if (!isNightActionEligible(role, dayIndex)) return null
  if (role === "DOCTOR") return "보호"
  if (role === "JOKER") return "암살"
  if (role === "GUARD") return "조사"
  if (role === "WITCH_HUNTER") return "확인"
  return null
}

// 자기 자신을 대상으로 지정할 수 있는 역할입니다. DOCTOR(보호)만 허용합니다.
export function isSelfTargetAllowedForNightAction(role) {
  return role === "DOCTOR"
}

// TRIBUNAL 유죄/무죄 투표 섹션 라벨입니다.
export const TRIBUNAL_VOTE_GUILTY_LABEL = "유죄"
export const TRIBUNAL_VOTE_NOT_GUILTY_LABEL = "무죄"
export const TRIBUNAL_VOTE_SUBMIT_LABEL = "투표 제출"
export const TRIBUNAL_VOTE_SUBMITTING_LABEL = "제출 중..."
export const TRIBUNAL_DEFENDANT_NOTICE = "당신은 피고인입니다. 투표할 수 없습니다."
export const TRIBUNAL_DEAD_NOTICE = "사망한 참가자는 투표할 수 없습니다."

// DAY 토론 페이즈(DAY_DISCUSSION) 섹션 라벨입니다. 토론 중에는 투표 컨트롤을 렌더하지 않고
// 안내 문구와 "투표 시작 준비" 버튼만 노출합니다(생존자 전원이 준비하면 DAY_VOTE로 전이).
export const DAY_DISCUSSION_CAPTION = "토론 진행"
export const DAY_DISCUSSION_NOTICE = "토론 중입니다. 투표는 아직 열리지 않았습니다."
export const DAY_VOTE_READY_LABEL = "투표 시작 준비"
export const DAY_VOTE_READY_SENDING_LABEL = "준비 중..."
export const DAY_VOTE_READY_DONE_LABEL = "준비 완료"
export const DAY_DEAD_NOTICE = "사망한 참가자는 낮 진행에 참여할 수 없습니다."

// winResult.winner → 한국어 승리 문구입니다. 종료되지 않았거나(winResult 없음) winner가
// 알려진 두 값(CITIZEN/JOKER)이 아니면 null을 반환합니다(getInGameNightActionLabel과 동일한 관례).
export function getInGameWinResultLabel(winResult) {
  if (!winResult || typeof winResult !== "object") return null
  if (winResult.winner === "CITIZEN") return "시민 진영 승리"
  if (winResult.winner === "JOKER") return "JOKER 진영 승리"
  return null
}

// 개발용 이벤트 목록에 표시할 짧은 문자열을 만듭니다.
export function formatInGameEvent(event) {
  const actor = event.actorId ? ` ${event.actorId}` : ""
  const target = event.targetId ? ` -> ${event.targetId}` : ""
  return `${event.type}${actor}${target}`
}
