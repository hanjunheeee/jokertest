// 밤 차례 안내 창 모양: 덮개·판·글·닫기 버튼
// 밤 차례 안내 창(InGameNightTurnAnnouncementOverlay)이 사용

// 덮개와 가운데 판
export const BACKDROP_CLASS =
  "fixed inset-0 z-[60] cursor-default border-0 bg-black/70 p-0"

export const PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

export const PANEL_CLASS = "pointer-events-auto relative"

// 안내 글·작은 글·닫기 버튼
export const MSG_CLASS =
  "font-subheading text-[clamp(1.1rem,3.2vw,1.9rem)] font-bold tracking-wide text-[#3a1a0c]"

export const META_CLASS = "text-[0.72rem] tracking-wide text-[#5b3a20]"

export const CLOSE_BTN_CLASS =
  "mt-1 min-h-9 w-[min(12rem,100%)] rounded border border-[#6b4321] bg-[#3a1a0c] px-4 py-1.5 text-sm font-semibold tracking-wide text-[#f8ead2] transition hover:bg-[#5b3a20]"
