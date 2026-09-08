export const PODIUM_PAGE_ROOT_CLASS = "relative h-svh w-full overflow-hidden bg-black"

export const PODIUM_BG_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center"

export const PODIUM_CONTENT_CLASS =
  "relative z-10 mx-auto flex h-full w-full max-w-[min(96rem,98vw)] flex-col px-[clamp(1.25rem,3vw,2.5rem)] pb-[clamp(5.5rem,11vh,7rem)] pt-[clamp(1.35rem,3.2vh,2.15rem)]"

export const PODIUM_HEADER_WRAP_CLASS =
  "relative mx-auto mb-[clamp(0.35rem,1vh,0.55rem)] w-[clamp(14rem,28vw,22rem)] shrink-0"

export const PODIUM_HEADER_PLATE_CLASS = "block h-auto w-full select-none"

export const PODIUM_HEADER_TITLE_CLASS =
  "pointer-events-none absolute inset-0 flex items-start justify-center px-[12%] pt-[3.8%] font-display text-[clamp(1.18rem,1.72vw,1.45rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const PODIUM_TOP_THREE_WRAP_CLASS =
  "relative mx-auto mt-[clamp(0.55rem,1.6vh,1rem)] mb-[clamp(0.45rem,1.3vh,0.75rem)] flex w-full max-w-[min(58rem,94vw)] shrink-0 items-end justify-center gap-[clamp(0.75rem,2.4vw,1.9rem)]"

export const PODIUM_TOP_PLAYER_CARD_CLASS = "flex min-w-0 flex-col items-center"

export const PODIUM_TOP_PLAYER_CARD_RANK1_CLASS =
  `${PODIUM_TOP_PLAYER_CARD_CLASS} w-[clamp(10.75rem,20.5vw,15.25rem)] translate-y-[clamp(0.15rem,0.55vh,0.45rem)]`

export const PODIUM_TOP_PLAYER_CARD_RANK2_CLASS =
  `${PODIUM_TOP_PLAYER_CARD_CLASS} w-[clamp(8.75rem,16.5vw,12.25rem)] mb-[clamp(0.1rem,0.55vh,0.35rem)]`

export const PODIUM_TOP_PLAYER_CARD_RANK3_CLASS =
  `${PODIUM_TOP_PLAYER_CARD_CLASS} w-[clamp(8.75rem,16.5vw,12.25rem)] mb-[clamp(0.1rem,0.55vh,0.35rem)]`

export const PODIUM_TOP_PLAYER_FRAME_WRAP_CLASS = "relative w-full"

export const PODIUM_TOP_PLAYER_PROFILE_SLOT_CLASS =
  "absolute inset-x-[13%] top-[17%] bottom-[25%] z-0 overflow-hidden rounded-full"

export const PODIUM_TOP_PLAYER_PHOTO_CLASS = "block h-full w-full object-cover object-center"

export const PODIUM_TOP_PLAYER_FRAME_CLASS =
  "pointer-events-none relative z-10 block h-auto w-full select-none"

export const PODIUM_TOP_PLAYER_NICKNAME_BASE_CLASS =
  "pointer-events-none absolute inset-x-[9%] z-20 text-center font-display font-bold leading-none text-[#1a1008] antialiased"

export const PODIUM_TOP_PLAYER_NICKNAME_RANK1_CLASS =
  `${PODIUM_TOP_PLAYER_NICKNAME_BASE_CLASS} bottom-[21.5%] text-[clamp(0.9rem,1.25vw,1.1rem)]`

export const PODIUM_TOP_PLAYER_NICKNAME_RANK2_CLASS =
  `${PODIUM_TOP_PLAYER_NICKNAME_BASE_CLASS} bottom-[20.5%] text-[clamp(0.84rem,1.18vw,1.02rem)]`

export const PODIUM_TOP_PLAYER_NICKNAME_RANK3_CLASS =
  `${PODIUM_TOP_PLAYER_NICKNAME_BASE_CLASS} bottom-[20.5%] text-[clamp(0.84rem,1.18vw,1.02rem)]`

export const PODIUM_TABLE_SECTION_CLASS =
  "relative mx-auto h-[min(46vh,31rem)] w-[min(74vw,64rem)] max-w-[64rem] shrink-0"

export const PODIUM_TABLE_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const PODIUM_TABLE_OVERLAY_CLASS = "pointer-events-none absolute inset-0"

export const PODIUM_TABLE_INSET_CLASS =
  "pointer-events-auto absolute inset-x-[8%] top-[9%] bottom-[13%] flex min-h-0 flex-col"

export const PODIUM_TABLE_COLUMNS_CLASS =
  "grid min-h-0 flex-1 grid-cols-2 gap-x-[clamp(1.25rem,3.2vw,2.35rem)]"

export const PODIUM_TABLE_COLUMN_CLASS =
  "min-h-0 min-w-0 [&_th:nth-child(2)]:pl-[clamp(0.45rem,0.9vw,0.65rem)] [&_th:nth-child(3)]:pl-[clamp(0.45rem,0.9vw,0.65rem)] [&_td:nth-child(2)]:pl-[clamp(0.45rem,0.9vw,0.65rem)] [&_td:nth-child(3)]:pl-[clamp(0.45rem,0.9vw,0.65rem)] [&_td:nth-child(2)]:w-[clamp(3rem,4.1vw,3.55rem)] [&_td:nth-child(2)_div]:h-[clamp(2.6rem,3.75vw,3.25rem)] [&_td:nth-child(2)_div]:w-[clamp(2.6rem,3.75vw,3.25rem)] [&_td:nth-child(2)_img:first-child]:h-[70%] [&_td:nth-child(2)_img:first-child]:w-[70%]"

/** thead 유지 — tbody 행만 아래로 */
export const PODIUM_TABLE_TBODY_OFFSET_CLASS =
  "[&>tr:first-child>td]:pt-[clamp(1.25rem,2.5vh,1.7rem)]"

export const PODIUM_TABLE_HEAD_CLASS =
  "font-subheading text-[clamp(0.8rem,1.05vw,0.92rem)] leading-snug font-black text-[#f5f0e6]"

export const PODIUM_TABLE_HEAD_CELL_CLASS =
  "whitespace-nowrap px-[0.35rem] pb-[0.38rem] pt-[0.15rem] text-left align-bottom first:pl-0 last:pr-0 text-[#f5f0e6]"

export const PODIUM_TABLE_HEAD_NUM_CELL_CLASS =
  `${PODIUM_TABLE_HEAD_CELL_CLASS} w-[2.65rem] text-right`

export const PODIUM_TABLE_HEAD_WINRATE_CELL_CLASS =
  `${PODIUM_TABLE_HEAD_CELL_CLASS} w-[2.35rem] text-right pr-0`

export const PODIUM_TABLE_AREA_CLASS =
  "relative mx-auto mt-[clamp(0.65rem,1.5vh,1rem)] flex min-h-0 w-full max-w-[min(92rem,98vw)] flex-1 items-center self-center"

export const PODIUM_TABLE_ROW_CLASS = "relative mx-auto shrink-0"

export const PODIUM_TABLE_NAV_ARROW_BTN_BASE =
  "interactive-scale absolute top-[54%] z-40 w-[clamp(3.5rem,5.2vw,4.75rem)] -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0 opacity-95 transition hover:opacity-100 disabled:cursor-default disabled:opacity-25"

export const PODIUM_TABLE_NAV_ARROW_PREV_CLASS = "left-0 -translate-x-[34%]"

export const PODIUM_TABLE_NAV_ARROW_NEXT_CLASS = "right-0 translate-x-[34%]"

export const PODIUM_TABLE_NAV_ARROW_IMG_CLASS = "block h-auto w-full select-none"

export const PODIUM_TABLE_PAGE_NODES_WRAP_CLASS =
  "pointer-events-auto absolute bottom-[clamp(1.35rem,3.2vh,1.95rem)] left-1/2 z-30 flex -translate-x-1/2 items-center justify-center gap-[clamp(0.35rem,0.75vw,0.55rem)]"

export const PODIUM_TABLE_PAGE_NODE_BASE_CLASS =
  "h-[clamp(0.55rem,0.85vw,0.7rem)] w-[clamp(0.55rem,0.85vw,0.7rem)] shrink-0 cursor-pointer rounded-full border border-[#2a1810]/80 bg-[#2a1810]/35 p-0 transition"

export const PODIUM_TABLE_PAGE_NODE_ACTIVE_CLASS =
  "border-[#1a1008] bg-[#3d2a1c] shadow-[0_0_0.35rem_rgba(26,16,8,0.5)]"
