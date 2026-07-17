import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 공개방 목록 전체 위치와 크기입니다.
export const ROOM_LIST_SHELL_CLASS =
  "absolute left-1/2 top-1/2 z-10 flex h-[clamp(34rem,64vh,44rem)] w-[min(62rem,82vw)] min-h-0 max-w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-[clamp(0.55rem,1.2vh,0.75rem)] px-[clamp(0.35rem,0.9vw,0.65rem)]"

// 연회장 만들기/연회장 찾기 버튼 행입니다.
export const ROOM_LIST_TOOLBAR_CLASS =
  "flex shrink-0 items-center justify-start gap-[clamp(0.35rem,0.8vw,0.55rem)]"

// 방 목록 상단 액션 버튼 wrapper입니다.
export const ROOM_LIST_ACTION_BTN_CLASS =
  "interactive-scale relative min-w-[clamp(5.75rem,11.5vw,7.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const ROOM_LIST_ACTION_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(1.12rem,1.65vw,1.38rem)] font-black leading-none text-[#f5f0e6] antialiased [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

export const ROOM_LIST_ACTION_FRAME_CLASS = "block h-auto w-full select-none"

// 방 목록 패널 바깥 프레임입니다.
export const ROOM_LIST_PANEL_CLASS =
  "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-[#2a2218]/90 bg-[#0a0806]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.45)]"

export const ROOM_LIST_PANEL_INSET_CLASS =
  "flex min-h-0 flex-1 flex-col px-[clamp(0.55rem,1.4vw,0.85rem)] py-[clamp(0.45rem,1vh,0.65rem)]"

export const ROOM_LIST_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

// 방 목록 스크롤 영역입니다. 네이티브 스크롤바는 숨기고 shared Scrollbar를 씁니다.
export const ROOM_LIST_SCROLL_CLASS =
  `grid h-full min-h-0 grid-cols-2 gap-x-[clamp(0.45rem,1vw,0.65rem)] gap-y-[clamp(0.22rem,0.6vh,0.35rem)] overflow-y-auto overscroll-contain pr-[clamp(0.85rem,1.6vw,1.15rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const ROOM_LIST_ROW_CLASS = "relative w-full min-w-0 list-none"
export const ROOM_LIST_ROW_FRAME_CLASS = "block h-auto w-full select-none"

// 방 목록 행 프레임 위에 텍스트를 얹는 영역입니다.
export const ROOM_LIST_ROW_OVERLAY_CLASS =
  "absolute inset-0 flex items-center justify-between gap-[clamp(0.35rem,1vw,0.55rem)] px-[8%] pt-[6%] pb-[18%]"

export const ROOM_LIST_ROW_TITLE_CLASS =
  "pointer-events-none min-w-0 flex-1 truncate text-left font-subheading text-[clamp(0.98rem,1.35vw,1.18rem)] font-bold leading-none text-[#f0b45c] antialiased [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

export const ROOM_LIST_ROW_COUNT_CLASS =
  "pointer-events-none shrink-0 font-subheading text-[clamp(0.62rem,0.88vw,0.76rem)] font-bold leading-none tabular-nums text-white/95 antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
