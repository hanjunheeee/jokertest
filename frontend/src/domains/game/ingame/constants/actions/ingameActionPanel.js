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

// 역할별 밤 행동 타입입니다. 서버에 보낼 action.type 값으로 사용합니다.
export function getInGameNightActionType(role) {
  if (role === "DOCTOR") return "PROTECT"
  if (role === "JOKER") return "ASSASSINATE"
  if (role === "GUARD") return "INVESTIGATE"
  if (role === "WITCH_HUNTER") return "CONFIRM"
  return "SKIP"
}

// 역할별 밤 행동 버튼 문구입니다.
export function getInGameNightActionLabel(role) {
  if (role === "DOCTOR") return "보호"
  if (role === "JOKER") return "암살"
  if (role === "GUARD") return "조사"
  if (role === "WITCH_HUNTER") return "확인"
  return "건너뛰기"
}

// 개발용 이벤트 목록에 표시할 짧은 문자열을 만듭니다.
export function formatInGameEvent(event) {
  const actor = event.actorId ? ` ${event.actorId}` : ""
  const target = event.targetId ? ` -> ${event.targetId}` : ""
  return `${event.type}${actor}${target}`
}
