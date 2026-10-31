import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const EMOTICON_PALETTE_UI_FADE = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1],
}

export const EMOTICON_PALETTE_ROOT_CLASS = "relative z-10 flex h-full min-h-0 flex-col"

export const EMOTICON_PALETTE_MAIN_CLASS =
  "relative flex min-h-0 flex-1 items-center justify-center px-[clamp(1rem,3cqw,2.5rem)] pt-[clamp(2rem,5vh,3.5rem)] pb-[clamp(4.5rem,10vh,6rem)]"

export const EMOTICON_PALETTE_CONTENT_CLASS =
  "flex w-full min-h-0 max-w-[min(72rem,96vw)] flex-col gap-[clamp(0.35rem,0.8vh,0.55rem)]"

export const EMOTICON_PALETTE_STATUS_WRAP_CLASS =
  "flex shrink-0 flex-col items-center gap-[clamp(0.25rem,0.5vh,0.35rem)]"

export const EMOTICON_PALETTE_STATUS_CLASS =
  "text-center font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.84rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const EMOTICON_PALETTE_CONFLICT_CLASS = "text-[#e8c878]"
export const EMOTICON_PALETTE_NOTICE_ERROR_CLASS = "text-[#9C3D32]"

export const EMOTICON_PALETTE_SAVE_SUCCESS_MESSAGE = "팔레트를 저장했습니다."

export const EMOTICON_PALETTE_SAVE_SUCCESS_MESSAGE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(1rem,2.8vw,1.65rem)] font-bold leading-snug tracking-wide text-[#3a1a0c]"

export const EMOTICON_PALETTE_ERROR_ROW_CLASS =
  "flex shrink-0 flex-wrap items-center justify-center gap-[clamp(0.45rem,0.9vw,0.65rem)]"

export const EMOTICON_PALETTE_RETRY_BTN_CLASS =
  "interactive-scale cursor-pointer rounded border border-[#c9b892]/60 bg-black/45 px-3 py-1 font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,0.95vw,0.78rem)] font-bold text-[#f5f0e6]"

export const EMOTICON_PALETTE_BODY_CLASS =
  "flex min-h-0 flex-1 flex-col gap-[clamp(0.85rem,1.75vh,1.2rem)] lg:flex-row lg:items-stretch lg:gap-[clamp(0.75rem,1.6vw,1.25rem)]"

export const EMOTICON_PALETTE_INVENTORY_SECTION_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col gap-[clamp(0.45rem,0.9vh,0.65rem)]"

export const EMOTICON_PALETTE_TOOLBAR_CLASS =
  "flex shrink-0 items-stretch gap-[clamp(0.35rem,0.75vw,0.55rem)]"

export const EMOTICON_PALETTE_SEARCH_WRAP_CLASS =
  "relative min-w-0 w-[calc(100%-clamp(5.5rem,14vw,7.75rem)-clamp(0.35rem,0.75vw,0.55rem))] shrink-0"

export const EMOTICON_PALETTE_SEARCH_FRAME_CLASS = "block h-auto w-full select-none"

export const EMOTICON_PALETTE_SEARCH_INPUT_CLASS =
  "absolute inset-0 bg-transparent pl-[10.5%] pr-[6%] -translate-y-[0.07rem] font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,0.95vw,0.78rem)] leading-none text-[#f5f0e6] outline-none placeholder:text-[#f5f0e6]/55 disabled:cursor-not-allowed disabled:opacity-50"

export const EMOTICON_PALETTE_FILTER_WRAP_CLASS =
  "relative w-[clamp(5.5rem,14vw,7.75rem)] shrink-0"

export const EMOTICON_PALETTE_FILTER_FRAME_CLASS =
  "flex h-full min-h-[clamp(1.58rem,2.7vw,1.82rem)] items-center rounded-sm border border-[#8b7355]/55 bg-[#c9b892]/78 px-[clamp(0.45rem,0.85vw,0.65rem)] py-[0.06rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_2px_8px_rgba(26,15,10,0.22)]"

export const EMOTICON_PALETTE_FILTER_LABEL_CLASS =
  "pointer-events-none min-w-0 flex-1 truncate font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,0.95vw,0.78rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]"

export const EMOTICON_PALETTE_FILTER_CHEVRON_CLASS =
  "pointer-events-none ml-1 h-[clamp(0.55rem,0.95vw,0.72rem)] w-[clamp(0.55rem,0.95vw,0.72rem)] shrink-0 select-none opacity-95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"

export const EMOTICON_PALETTE_FILTER_SELECT_CLASS =
  "absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"

export const EMOTICON_PALETTE_GRID_SCROLL_WRAP_CLASS =
  "relative min-h-0 flex-1 overflow-hidden"

export const EMOTICON_PALETTE_GRID_SCROLL_CLASS =
  `absolute inset-0 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain pr-[clamp(0.75rem,1.5vw,1.05rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const EMOTICON_PALETTE_GRID_SCROLLBAR_CLASS =
  "z-[15] !right-[clamp(0.35rem,0.65vw,0.5rem)] !translate-x-0"

export const EMOTICON_PALETTE_GRID_GAP_CLASS =
  "gap-x-[clamp(0.2rem,0.38vw,0.32rem)] gap-y-[clamp(0.2rem,0.38vw,0.32rem)]"

export const EMOTICON_PALETTE_GRID_CLASS =
  `grid grid-cols-3 content-start justify-items-start overflow-visible list-none p-[0.15rem] m-0 ${EMOTICON_PALETTE_GRID_GAP_CLASS}`

export const EMOTICON_PALETTE_GRID_ITEM_CLASS = "overflow-visible"

export const EMOTICON_PALETTE_PLATE_BTN_CLASS =
  "group relative z-0 block w-[clamp(6.5rem,11.8vw,9.25rem)] shrink-0 cursor-pointer overflow-visible border-0 bg-transparent p-[0.2rem] leading-none hover:z-30 disabled:cursor-not-allowed disabled:opacity-45"

export const EMOTICON_PALETTE_PLATE_INNER_CLASS =
  "relative block w-full origin-center transition-[transform,filter,opacity] duration-200 ease-out group-hover:scale-[1.04] group-active:scale-[0.98] group-disabled:scale-100"

export const EMOTICON_PALETTE_PLATE_UNOWNED_BTN_CLASS =
  "disabled:cursor-not-allowed disabled:opacity-100"

export const EMOTICON_PALETTE_PLATE_UNOWNED_INNER_CLASS =
  "opacity-55 brightness-[0.68] saturate-[0.72] group-hover:scale-100 group-active:scale-100"

export const EMOTICON_PALETTE_PLATE_UNOWNED_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 bg-black/28"

export const EMOTICON_PALETTE_PLATE_IMG_CLASS = "block h-auto w-full select-none"

export const EMOTICON_PALETTE_PLATE_ICON_WRAP_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center p-[18%]"

export const EMOTICON_PALETTE_PLATE_ICON_CLASS = "max-h-full max-w-full select-none"

export const EMOTICON_PALETTE_PLATE_NAMEPLATE_CLASS =
  "pointer-events-none fixed z-[120] w-[clamp(5.85rem,11vw,8.25rem)] leading-none"

export const EMOTICON_PALETTE_PLATE_NAMEPLATE_IMG_CLASS =
  "block h-auto w-full select-none"

export const EMOTICON_PALETTE_PLATE_NAMEPLATE_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.08vw,0.88rem)] font-bold leading-tight text-[#ebe2cc]/95 whitespace-nowrap"

export const EMOTICON_PALETTE_WHEEL_SECTION_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[clamp(0.55rem,1.1vh,0.85rem)]"

export const EMOTICON_PALETTE_WHEEL_WRAP_CLASS =
  "relative mx-auto w-[min(100%,clamp(21.5rem,100%,33rem))]"

export const EMOTICON_PALETTE_FRAME_IMG_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"

export const EMOTICON_PALETTE_FRAME_WIDTH = 769
export const EMOTICON_PALETTE_FRAME_HEIGHT = 738
export const EMOTICON_PALETTE_FRAME_ASPECT_RATIO =
  `${EMOTICON_PALETTE_FRAME_WIDTH} / ${EMOTICON_PALETTE_FRAME_HEIGHT}`

export const EMOTICON_PALETTE_SLOT_POSITIONS = [
  { top: "15%", left: "50%" },
  { top: "26%", left: "74%" },
  { top: "50%", left: "84%" },
  { top: "73.5%", left: "75%" },
  { top: "85%", left: "50%" },
  { top: "73.5%", left: "24%" },
  { top: "50%", left: "16%" },
  { top: "26%", left: "26%" },
]

export const EMOTICON_PALETTE_SLOT_BTN_CLASS =
  "absolute z-10 flex h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-[3px] bg-black/30 p-[2%] transition-[transform,box-shadow,background-color,border-color,opacity] duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-45"

export const EMOTICON_PALETTE_SLOT_SELECTED_CLASS =
  "z-20 scale-[1.08] border-[#a63d32] bg-[#8b3530]/42 shadow-[0_0_0.15rem_rgba(166,61,50,0.9),0_0_0.55rem_rgba(140,50,42,0.65),0_0_1rem_rgba(120,42,36,0.35),inset_0_0_0.4rem_rgba(180,80,70,0.2)]"

export const EMOTICON_PALETTE_SLOT_IDLE_CLASS = "border-transparent opacity-90"

export const EMOTICON_PALETTE_SLOT_EMPTY_CLASS =
  "app-text-scaled [--app-text-size:0.7rem] opacity-60"

export const EMOTICON_PALETTE_ACTION_ROW_CLASS =
  "flex shrink-0 items-center justify-center gap-[clamp(0.65rem,1.25vw,0.95rem)]"

export const EMOTICON_PALETTE_IMAGE_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(6.85rem,12.5vw,9.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-40"

export const EMOTICON_PALETTE_IMAGE_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.04] group-active:scale-[0.96]"

export const EMOTICON_PALETTE_IMAGE_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.08vw,0.94rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"
