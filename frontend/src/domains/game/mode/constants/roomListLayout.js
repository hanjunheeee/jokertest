export const ROOM_LIST_SHELL_CLASS =
  "absolute left-1/2 top-[52%] z-10 flex h-[clamp(40rem,76vh,50rem)] w-[min(60rem,80vw)] min-h-0 max-w-full -translate-x-1/2 -translate-y-1/2 flex-col gap-[clamp(0.45rem,1vh,0.65rem)] px-[clamp(0.35rem,0.9vw,0.65rem)]"

export const ROOM_LIST_TOOLBAR_CLASS =
  "flex shrink-0 items-center justify-start gap-[clamp(0.35rem,0.8vw,0.55rem)]"

export const ACTION_BTN_CLASS =
  "interactive-scale relative min-w-[clamp(5.75rem,11.5vw,7.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const ACTION_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(1.05rem,1.5vw,1.28rem)] font-bold tracking-wide leading-none text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]"

export const ACTION_FRAME_CLASS = "block h-auto w-full select-none"

export const ROOM_LIST_PANEL_CLASS =
  "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-[#2a2218]/90 bg-[#0a0806]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.45)]"

export const PANEL_INSET_CLASS =
  "flex min-h-0 flex-1 flex-col px-[clamp(0.55rem,1.4vw,0.85rem)] py-[clamp(0.3rem,0.6vh,0.42rem)]"

export const SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const ROOM_LIST_GRID_CLASS =
  "grid h-full min-h-0 grid-cols-1 content-start gap-x-[clamp(0.35rem,0.75vw,0.5rem)] gap-y-[clamp(0.3rem,0.8vh,0.45rem)] pr-[clamp(0.85rem,1.6vw,1.15rem)] md:grid-cols-2 md:gap-y-[clamp(0.12rem,0.32vh,0.2rem)] md:pr-0"

export const ROOM_LIST_ROW_CLASS = "relative w-full min-w-0 list-none"
export const ROOM_LIST_ROW_FRAME_CLASS =
  "block h-auto w-full select-none transition-[filter] duration-150"

export const ROOM_LIST_ROW_FRAME_SELECTED_CLASS =
  "brightness-[1.12] saturate-[1.42] hue-rotate-[-12deg] drop-shadow-[0_0_5px_rgba(160,28,28,0.9)]"

export const ROW_PLACEHOLDER_FRAME_CLASS = `${ROOM_LIST_ROW_FRAME_CLASS} invisible`

export const ROW_BTN_BASE_CLASS =
  "relative block w-full border-0 bg-transparent p-0 text-left leading-none transition duration-150"

export const ROW_BTN_INTERACTIVE_CLASS = "cursor-pointer hover:brightness-110"
export const ROW_BTN_DISABLED_CLASS = "cursor-not-allowed"

export const ROW_OVERLAY_CLASS =
  "absolute inset-0 flex flex-col justify-end gap-[clamp(0.12rem,0.35vh,0.22rem)] px-[8%] pt-[5%] pb-[3.5%]"

export const ROOM_LIST_ROW_HEADER_ROW_CLASS =
  "flex min-w-0 items-start justify-between gap-[clamp(0.3rem,0.8vw,0.45rem)]"

export const ROOM_LIST_ROW_HEADER_DIVIDER_CLASS =
  "pointer-events-none h-px w-full shrink-0 bg-white/30"

export const ROOM_LIST_ROW_STAGE_BADGE_CLASS =
  "pointer-events-none shrink-0 font-subheading app-text-scaled [--app-text-size:clamp(0.58rem,0.78vw,0.68rem)] font-medium text-white/65 antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"

export const ROW_STATUS_BADGE_WRAP_CLASS = "flex shrink-0 items-center gap-[clamp(0.25rem,0.6vw,0.35rem)]"

export const ROOM_LIST_ROW_LOCK_BADGE_CLASS =
  "pointer-events-none rounded-sm border border-[#cbb27a]/50 bg-black/45 px-[0.4em] py-[0.05em] font-subheading app-text-scaled [--app-text-size:clamp(0.56rem,0.74vw,0.64rem)] font-bold text-[#e8d5a8] antialiased"

const ROW_STATUS_BADGE_BASE_CLASS =
  "pointer-events-none rounded-sm px-[0.4em] py-[0.05em] font-subheading app-text-scaled [--app-text-size:clamp(0.56rem,0.74vw,0.64rem)] font-bold antialiased"

export const ROW_STATUS_BADGE_FULL_CLASS =
  `${ROW_STATUS_BADGE_BASE_CLASS} border border-white/25 bg-black/55 text-white/70`

export const ROW_STATUS_BADGE_IN_PROGRESS_CLASS =
  `${ROW_STATUS_BADGE_BASE_CLASS} border border-[#b50000]/55 bg-[#2a0605]/70 text-[#ff8f87]`

export const ROOM_LIST_ROW_BOTTOM_ROW_CLASS =
  "flex min-w-0 items-center justify-between gap-[clamp(0.35rem,1vw,0.55rem)]"

export const ROOM_LIST_ROW_TITLE_CLASS =
  "pointer-events-none min-w-0 flex-1 truncate text-left font-subheading app-text-scaled [--app-text-size:clamp(0.98rem,1.35vw,1.18rem)] font-bold leading-tight text-[#f3d28d] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]"

export const ROW_COUNT_CLASS =
  "pointer-events-none shrink-0 font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,0.88vw,0.76rem)] font-semibold leading-none tabular-nums text-white/95 antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const ROOM_LIST_ROW_SETTINGS_CLASS =
  "pointer-events-none min-w-0 flex-1 truncate text-left font-subheading app-text-scaled [--app-text-size:clamp(0.58rem,0.82vw,0.7rem)] font-medium leading-none text-white/80 antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const ROW_DIM_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-sm bg-black/55 [filter:grayscale(0.6)]"

export const ROOM_LIST_FOOTER_CLASS =
  "pointer-events-none flex shrink-0 items-center justify-end pr-[0rem]"

export const PAGINATION_FOOTER_CLASS =
  "flex shrink-0 items-center justify-center min-h-[clamp(2.75rem,6vh,3.75rem)] py-[clamp(0.25rem,0.55vh,0.4rem)]"

export const PAGINATION_CLASS = "flex items-center gap-[clamp(0.45rem,0.85vw,0.65rem)]"

export const PAGE_ARROW_BTN_CLASS =
  "block w-[clamp(1.75rem,2.5vw,2.15rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 opacity-85 transition hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30 disabled:brightness-75"

export const PAGE_ARROW_IMG_CLASS = "block h-auto w-full select-none"

export const PAGE_TEXT_CLASS =
  "shrink-0 px-1 font-subheading app-text-scaled [--app-text-size:clamp(0.95rem,1.25vw,1.1rem)] font-semibold tabular-nums text-[#e8d5a8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"

export const ENTER_BTN_CLASS =
  "pointer-events-auto relative min-w-[clamp(6.25rem,11vw,7.75rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:hover:opacity-40"

export const ENTER_BTN_FRAME_CLASS = "block h-auto w-full select-none"

export const ENTER_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.92rem,1.25vw,1.05rem)] font-bold tracking-wide leading-none text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]"
