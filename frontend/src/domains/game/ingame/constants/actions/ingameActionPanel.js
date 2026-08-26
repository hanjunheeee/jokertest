export const INGAME_ACTION_PANEL_CLASS =
  "absolute bottom-[clamp(0.75rem,2vh,1.25rem)] left-[clamp(0.75rem,2vw,1.25rem)] z-30 w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-[#d8b982]/55 bg-black/72 p-3 text-[#f8ead2] shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-sm"

export const INGAME_ACTION_HEADER_CLASS =
  "flex items-start justify-between gap-2.5 border-b border-[#d8b982]/25 pb-2.5"

export const INGAME_ACTION_TITLE_CLASS =
  "text-[0.92rem] font-semibold tracking-wide text-[#ffe6b8] drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]"

export const INGAME_ACTION_META_CLASS = "text-[0.7rem] font-medium leading-snug text-[#cdbb9e]/90"

// 섹션(유틸리티·낮 투표·재판·밤 행동·이벤트) 공통 카드 껍데기 — 살짝 어두운 레이어 + 은은한
// 상단 하이라이트 + 얇은 금색 링으로 "층이 진" 느낌을 주되, 뚜렷한 테두리 박스처럼 보이지
// 않도록 절제한다(요청: 층위감은 원하되 각지고 밋밋한 박스 느낌은 피할 것).
export const INGAME_ACTION_SECTION_CLASS =
  "mt-3 space-y-2 rounded-lg bg-[#1c0f08]/45 p-2.5 shadow-[inset_0_1px_0_rgba(255,229,173,0.07)] ring-1 ring-[#d8b982]/15"

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
  "min-h-8 rounded-md border border-[#c9a86a]/40 bg-gradient-to-b from-[#3a2417]/90 to-[#1d1108]/90 px-3 py-1.5 text-[0.72rem] font-medium tracking-wide text-[#f3e3c6] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-[#f3d28d] hover:from-[#553420] hover:to-[#2c190d] hover:text-[#ffe9c2] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#c9a86a]/40 disabled:active:scale-100"

export const INGAME_ACTION_TARGET_BUTTON_CLASS =
  "group relative flex min-h-[2.75rem] flex-col justify-center gap-0.5 rounded-md border border-[#8a6a44]/35 bg-gradient-to-b from-[#251409]/85 to-[#150b05]/85 px-2 py-1.5 text-left transition hover:border-[#f3d28d]/70 hover:from-[#3a2313]/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#8a6a44]/35"

export const INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS =
  `${INGAME_ACTION_TARGET_BUTTON_CLASS} border-[#f3d28d] from-[#5b321d]/95 to-[#331a0d]/95 ring-1 ring-[#f3d28d]/50`

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
// 지금은 네 역할 모두 첫 밤부터 하한을 만족합니다 — 마녀사냥꾼이 그 밤에 실제로 행동
// 가능한지(시신이 있는가)는 서버 isEligibleForNightAction만이 판정하며, 프런트는 그 판정의
// 결과인 canonical night turn만 따릅니다(dayIndex로 흉내내지 않습니다).
const NIGHT_ACTION_MIN_DAY_INDEX = Object.freeze({
  JOKER: 0,
  DOCTOR: 0,
  GUARD: 0,
  WITCH_HUNTER: 0,
})

function isNightActionEligible(role, dayIndex) {
  const minDayIndex = NIGHT_ACTION_MIN_DAY_INDEX[role]
  return minDayIndex !== undefined && dayIndex >= minDayIndex
}

// 역할·dayIndex별 밤 행동 타입입니다. 서버에 보낼 action 종류를 프런트에서 미리 판단하기
// 위한 용도이며, 행동 불가(CITIZEN)면 null을 반환합니다.
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

/**
 * 사망자만 대상으로 지정할 수 있는 역할입니다. WITCH_HUNTER(확인)만 해당합니다 — 서버
 * submitNightAction이 살아있는 대상을 INVALID_TARGET으로 거부하는 규칙의 UX 사본이며,
 * isSelfTargetAllowedForNightAction과 동일하게 최종 권위자는 항상 서버입니다.
 * @param {string|undefined} role 내 역할
 */
export function isDeadTargetOnlyNightActionRole(role) {
  return role === "WITCH_HUNTER"
}

// TRIBUNAL 유죄/무죄 투표 섹션 라벨입니다.
export const TRIBUNAL_VOTE_GUILTY_LABEL = "유죄"
export const TRIBUNAL_VOTE_NOT_GUILTY_LABEL = "무죄"
export const TRIBUNAL_VOTE_SUBMIT_LABEL = "투표 제출"
export const TRIBUNAL_VOTE_SUBMITTING_LABEL = "제출 중..."
export const TRIBUNAL_DEFENDANT_NOTICE = "당신은 피고인입니다. 투표할 수 없습니다."
export const TRIBUNAL_DEAD_NOTICE = "사망한 참가자는 투표할 수 없습니다."

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
