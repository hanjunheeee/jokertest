export const ENTRANCE_PHASES = Object.freeze(["DAY", "NIGHT"])

export const ENTRANCE_MSGS = Object.freeze({
  DAY: "낮이 되었습니다",
  NIGHT: "밤이 되었습니다",
})

export const CONFIRM_LABEL = "확인"

export const DIALOG_LABEL = "단계 전환 안내"

export const BACKDROP_LABEL = "단계 전환 안내 닫기"

export function getEntranceMsg(phase) {
  if (phase !== "DAY" && phase !== "NIGHT") return null
  return ENTRANCE_MSGS[phase]
}

export const BACKDROP_CLASS =
  "fixed inset-0 z-[60] w-full cursor-default bg-black/70"

export const PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

export const PANEL_CLASS = "pointer-events-auto max-w-full"

export const MSG_CLASS =
  "font-subheading text-[clamp(1.1rem,4.4vw,2.1rem)] font-bold leading-tight tracking-wide text-[#3a1a0c]"

export const CONFIRM_BTN_CLASS =
  "mt-3 min-h-9 rounded border border-[#6b4321] bg-[#e2c78f] px-6 py-1.5 text-sm font-semibold tracking-wide text-[#3a1a0c] transition hover:bg-[#f0dcae] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6b4321]"
