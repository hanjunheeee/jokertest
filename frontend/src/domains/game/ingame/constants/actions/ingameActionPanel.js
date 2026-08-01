export const INGAME_ACTION_PANEL_CLASS =
  "absolute bottom-[clamp(0.75rem,2vh,1.25rem)] left-[clamp(0.75rem,2vw,1.25rem)] z-30 w-[min(24rem,calc(100vw-1.5rem))] rounded-md border border-[#d8b982]/55 bg-black/72 p-3 text-[#f8ead2] shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-sm"

export const INGAME_ACTION_HEADER_CLASS =
  "flex items-center justify-between gap-3 border-b border-[#d8b982]/25 pb-2"

export const INGAME_ACTION_TITLE_CLASS = "text-sm font-semibold tracking-normal text-[#ffe2ad]"

export const INGAME_ACTION_META_CLASS = "text-[0.7rem] leading-tight text-[#cdbb9e]"

export const INGAME_ACTION_SECTION_CLASS = "mt-3 space-y-2"

export const INGAME_ACTION_BUTTON_CLASS =
  "min-h-8 rounded border border-[#d8b982]/35 bg-[#2b1c15]/85 px-3 py-1.5 text-xs text-[#f8ead2] transition hover:border-[#f3d28d] hover:bg-[#53321f] disabled:cursor-not-allowed disabled:opacity-40"

export const INGAME_ACTION_TARGET_BUTTON_CLASS =
  "min-h-8 rounded border border-[#927556]/45 bg-black/35 px-2 py-1 text-left text-xs text-[#f8ead2] transition hover:border-[#f3d28d] disabled:cursor-not-allowed disabled:opacity-40"

export const INGAME_ACTION_SELECTED_TARGET_BUTTON_CLASS =
  `${INGAME_ACTION_TARGET_BUTTON_CLASS} border-[#f3d28d] bg-[#5b321d]/80`

// 역할별 밤 행동 최소 dayIndex입니다. 서버 ROLE_DEFINITIONS.nightActionMinDayIndex의
// UX 전용 사본입니다(서버가 최종 권위자 — 이 값은 대상 선택 UI를 미리 숨기는 용도일 뿐,
// 실제 권한 판정은 항상 서버가 다시 검증합니다). CITIZEN은 항목 자체가 없어 항상 불가합니다.
const NIGHT_ACTION_MIN_DAY_INDEX = Object.freeze({
  JOKER: 0,
  DOCTOR: 0,
  GUARD: 0,
  WITCH_HUNTER: 1,
})

function isNightActionEligible(role, dayIndex) {
  const minDayIndex = NIGHT_ACTION_MIN_DAY_INDEX[role]
  return minDayIndex !== undefined && dayIndex >= minDayIndex
}

// 역할·dayIndex별 밤 행동 타입입니다. 서버에 보낼 action 종류를 프런트에서 미리 판단하기
// 위한 용도이며, 행동 불가(CITIZEN 전체·day0 WITCH_HUNTER)면 null을 반환합니다.
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

// 개발용 이벤트 목록에 표시할 짧은 문자열을 만듭니다.
export function formatInGameEvent(event) {
  const actor = event.actorId ? ` ${event.actorId}` : ""
  const target = event.targetId ? ` -> ${event.targetId}` : ""
  return `${event.type}${actor}${target}`
}
