const INVITED_GUESTS_TEXT = "font-subheading antialiased text-[#1a1008] [text-shadow:0_1px_2px_rgba(0,0,0,0.08)]"
const INVITED_GUESTS_TITLE = `${INVITED_GUESTS_TEXT} font-extrabold text-[#120a06]`
const INVITED_GUESTS_LEFT_PAGE_PADDING_TOP = "pt-[clamp(0.55rem,1.1vh,0.78rem)]"
const INVITED_GUESTS_RIGHT_PAGE_PADDING_TOP = "pt-[clamp(0.78rem,1.55vh,1.05rem)]"
const INVITED_GUESTS_SPREAD_BOTTOM_INSET = "pb-[clamp(0.75rem,1.75vh,1.15rem)]"
const INVITED_GUESTS_LEFT_PAGE_SHIFT = "-translate-y-[clamp(0.12rem,0.45vh,0.32rem)]"
const INVITED_GUESTS_RIGHT_PAGE_SHIFT = "translate-y-[clamp(0.08rem,0.3vh,0.2rem)]"

/** spread — 2행 grid로 좌·우 하단(전적 / 도전과제) Y 끝 정렬 */
export const INVITED_GUESTS_SPREAD_GRID_CLASS =
  `grid min-h-0 w-full flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_auto] overflow-visible ${INVITED_GUESTS_SPREAD_BOTTOM_INSET}`

export const INVITED_GUESTS_SPREAD_LEFT_UPPER_CELL_CLASS =
  `col-start-1 row-start-1 min-h-0 overflow-hidden ${INVITED_GUESTS_LEFT_PAGE_PADDING_TOP} ${INVITED_GUESTS_LEFT_PAGE_SHIFT} pl-[clamp(0.35rem,1.2vw,0.65rem)] pr-[clamp(0.45rem,1.2vw,0.75rem)]`

export const INVITED_GUESTS_SPREAD_LEFT_LOWER_CELL_CLASS =
  `col-start-1 row-start-2 ${INVITED_GUESTS_LEFT_PAGE_SHIFT} pl-[clamp(0.35rem,1.2vw,0.65rem)] pr-[clamp(0.85rem,2vw,1.15rem)]`

export const INVITED_GUESTS_SPREAD_RIGHT_COLUMN_CLASS =
  `col-start-2 row-span-2 grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-visible overscroll-none ${INVITED_GUESTS_RIGHT_PAGE_PADDING_TOP} ${INVITED_GUESTS_RIGHT_PAGE_SHIFT} pl-[clamp(1.35rem,2.75vw,1.85rem)] pr-[clamp(0.35rem,1.2vw,0.65rem)]`

export const INVITED_GUESTS_SPREAD_RIGHT_UPPER_CELL_CLASS = "relative z-20 min-h-0 overflow-visible"

export const INVITED_GUESTS_SPREAD_RIGHT_LOWER_CELL_CLASS = "self-end shrink-0"

/** 좌·우 spread — 상단(직업 소개 / 랭킹) */
export const INVITED_GUESTS_SPREAD_UPPER_SECTION_CLASS =
  "flex shrink-0 flex-col gap-[clamp(0.35rem,0.75vh,0.5rem)]"

export const INVITED_GUESTS_JOB_TABS_ANCHOR_CLASS =
  "pointer-events-auto absolute right-0 top-[-6px] z-30 -translate-y-[clamp(1.1rem,2.65vh,1.62rem)]"

export const INVITED_GUESTS_JOB_TABS_CLASS =
  "flex max-w-full flex-nowrap items-stretch justify-end gap-[clamp(0.14rem,0.34vw,0.26rem)]"

export const INVITED_GUESTS_JOB_TAB_BUTTON_CLASS =
  "interactive-scale relative inline-flex shrink-0 items-center justify-center border-0 bg-transparent px-[clamp(0.52rem,1.05vw,0.72rem)] py-[clamp(0.24rem,0.48vh,0.34rem)] min-h-[clamp(1.45rem,2.05vw,1.68rem)] leading-none whitespace-nowrap"

export const INVITED_GUESTS_JOB_TAB_BG_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill object-center"

export const INVITED_GUESTS_JOB_TAB_LABEL_CLASS =
  "relative z-10 font-subheading text-[clamp(0.62rem,0.82vw,0.74rem)] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const INVITED_GUESTS_JOB_TAB_LABEL_ACTIVE_CLASS = "text-[#e8f0dc]"

export const INVITED_GUESTS_JOB_TAB_LABEL_INACTIVE_CLASS = "text-[#ebe2cc]/90"

export const INVITED_GUESTS_JOB_TITLE_CLASS =
  "font-display text-center text-[clamp(1.45rem,2.25vw,1.9rem)] font-medium leading-snug text-[#120a06] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.1)]"

export const INVITED_GUESTS_SECTION_TITLE_CLASS =
  `${INVITED_GUESTS_TEXT} text-[clamp(1rem,1.32vw,1.14rem)] font-black leading-snug text-[#120a06]`

export const INVITED_GUESTS_INTRO_SECTION_CLASS =
  "flex flex-col gap-[clamp(0.45rem,1vh,0.65rem)]"

export const INVITED_GUESTS_INTRO_ROW_CLASS =
  "grid grid-cols-[minmax(0,1fr)_clamp(5.75rem,30%,7.75rem)] items-end gap-[clamp(0.45rem,1vw,0.65rem)]"

export const INVITED_GUESTS_INTRO_TEXT_STACK_CLASS = "flex min-w-0 flex-col gap-[clamp(0.35rem,0.75vh,0.5rem)]"

export const INVITED_GUESTS_INTRO_TEXT_CLASS =
  `${INVITED_GUESTS_TEXT} text-[clamp(0.68rem,0.92vw,0.8rem)] font-medium leading-[1.55]`

export const INVITED_GUESTS_STANDING_IMAGE_WRAP_CLASS =
  "relative -translate-y-[clamp(0.55rem,1.2vh,0.85rem)] self-end"

export const INVITED_GUESTS_STANDING_IMAGE_WRAP_RAISED_CLASS =
  "relative -translate-y-[clamp(0.95rem,2.05vh,1.35rem)] self-end"

export const INVITED_GUESTS_STANDING_IMAGE_CLASS =
  "block h-auto max-h-[clamp(8.75rem,27vh,11.25rem)] w-full select-none object-contain object-bottom"

export const INVITED_GUESTS_STANDING_IMAGE_LG_CLASS =
  "block h-auto max-h-[clamp(10.25rem,31vh,12.75rem)] w-full select-none object-contain object-bottom"

export const INVITED_GUESTS_TABLE_SECTION_CLASS =
  "relative flex min-h-0 flex-col gap-[clamp(0.35rem,0.65vh,0.45rem)]"

export const INVITED_GUESTS_STATS_SECTION_CLASS = INVITED_GUESTS_TABLE_SECTION_CLASS

export const INVITED_GUESTS_CHALLENGES_SECTION_CLASS = "shrink-0"

export const INVITED_GUESTS_REWARD_ROW_CLASS =
  "flex flex-wrap items-center justify-end gap-[clamp(0.3rem,0.55vw,0.45rem)]"

export const INVITED_GUESTS_REWARD_CURRENCY_CLASS = "flex items-center gap-[0.12rem]"

export const INVITED_GUESTS_REWARD_ICON_CLASS =
  "h-[clamp(1.15rem,1.55vw,1.3rem)] w-auto shrink-0 select-none object-contain"

export const INVITED_GUESTS_REWARD_COUNT_CLASS =
  `${INVITED_GUESTS_TEXT} text-[clamp(0.74rem,0.98vw,0.86rem)] font-semibold tabular-nums`

export const INVITED_GUESTS_REWARD_BORDER_CLASS = "flex items-center gap-[0.2rem]"

export const INVITED_GUESTS_REWARD_BORDER_BUTTON_CLASS =
  `${INVITED_GUESTS_REWARD_BORDER_CLASS} interactive-scale max-w-full cursor-pointer rounded-[0.35rem] border border-[#2a1810]/16 bg-[#f5f0e6]/32 px-[clamp(0.4rem,0.85vw,0.55rem)] py-[clamp(0.24rem,0.48vh,0.32rem)] leading-none transition-[background-color,border-color,box-shadow] hover:border-[#2a1810]/28 hover:bg-[#f5f0e6]/48 hover:shadow-[0_1px_0_rgba(255,255,255,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a1810]/30`

export const INVITED_GUESTS_REWARD_BORDER_ICON_CLASS =
  "h-[clamp(1.25rem,1.65vw,1.45rem)] w-[clamp(1.25rem,1.65vw,1.45rem)] shrink-0 select-none object-contain"

export const INVITED_GUESTS_REWARD_BORDER_LABEL_CLASS =
  `${INVITED_GUESTS_TEXT} text-[clamp(0.72rem,0.94vw,0.82rem)] font-semibold leading-tight`
