/**
 * 밤 역할 턴 안내 오버레이 레이아웃.
 *
 * 역할 공개 오버레이(z-[55]/[56])보다 위, 사망 연출(z-[70])보다 아래에 놓인다.
 * 패널 배경은 공용 파치먼트 셸(InGameParchmentPanel)이 그린다.
 */

export const INGAME_NIGHT_TURN_BACKDROP_CLASS =
  "fixed inset-0 z-[60] cursor-default border-0 bg-black/70 p-0"

export const INGAME_NIGHT_TURN_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[61] flex items-center justify-center px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

export const INGAME_NIGHT_TURN_PANEL_CLASS = "pointer-events-auto relative"

export const INGAME_NIGHT_TURN_MESSAGE_CLASS =
  "font-subheading text-[clamp(1.1rem,3.2vw,1.9rem)] font-bold tracking-wide text-[#3a1a0c]"

export const INGAME_NIGHT_TURN_META_CLASS = "text-[0.72rem] tracking-wide text-[#5b3a20]"

export const INGAME_NIGHT_TURN_CLOSE_BUTTON_CLASS =
  "mt-1 min-h-9 w-[min(12rem,100%)] rounded border border-[#6b4321] bg-[#3a1a0c] px-4 py-1.5 text-sm font-semibold tracking-wide text-[#f8ead2] transition hover:bg-[#5b3a20]"
