import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../shared/constants/customScrollbarStyles.js"

export const LIBRARY_PAGE_ROOT_CLASS = "relative h-svh w-full overflow-hidden bg-black"

export const LIBRARY_BG_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center"

export const BOOK_STAGE_CLASS =
  "absolute inset-0 z-10 flex items-center justify-center px-[clamp(0.75rem,2.5vw,2rem)] py-[clamp(1.5rem,6vh,3.5rem)]"

export const BOOK_SHELL_CLASS =
  "relative w-[clamp(31rem,58vw,62rem)] max-w-[92vw]"

export const BOOK_SHELL_OFFSET_CLASS =
  "-translate-y-[clamp(0.85rem,2.5vh,1.65rem)]"

export const BOOK_FRAME_CLASS = "block h-auto w-full select-none"

export const BOOK_TOC_WRAP_CLASS =
  "pointer-events-none absolute left-1/2 top-0 z-20 w-[clamp(9.5rem,16.5vw,13.5rem)] -translate-x-1/2 -translate-y-[36%]"

export const LIBRARY_BOOK_TOC_CLASS = BOOK_TOC_WRAP_CLASS

export const BOOK_TOC_IMG_CLASS = "block h-auto w-full select-none"

export const BOOKMARK_STACK_CLASS =
  "absolute right-0 top-[18%] z-30 flex translate-x-[52%] flex-col items-stretch gap-[clamp(0.3rem,0.75vh,0.5rem)]"

export const BOOKMARK_BTN_CLASS =
  "interactive-scale cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const BOOKMARK_ITEM_CLASS =
  `${BOOKMARK_BTN_CLASS} w-[clamp(4.75rem,7.8vw,6.25rem)]`

export const BOOKMARK_IMG_CLASS = "block h-auto w-full select-none"

export const BOOK_CONTENT_CLASS =
  "absolute inset-x-[6.8%] top-[8.5%] bottom-[8.5%] z-10 flex min-h-0 flex-col overflow-visible"

export const BOOK_SPREAD_CLASS =
  "flex min-h-0 flex-1 w-full gap-[clamp(0.35rem,0.85vw,0.7rem)] overflow-visible"

export const BOOK_PAGE_BASE_CLASS = "relative min-h-0 min-w-0 flex-1"

export const BOOK_PAGE_SCROLL_CLASS =
  `${BOOK_PAGE_BASE_CLASS} overflow-y-auto overscroll-contain pb-[clamp(2.1rem,4.5vh,2.85rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const BOOK_LEFT_PAGE_CLASS = BOOK_PAGE_SCROLL_CLASS

export const PAGE_NAV_BAR_CLASS =
  "relative z-20 flex shrink-0 w-full"

export const PAGE_NAV_SLOT_CLASS =
  "flex min-w-0 flex-1 items-end px-[clamp(0.35rem,1.1vw,0.6rem)] pb-[clamp(0.45rem,1.1vh,0.7rem)] pt-[clamp(0.28rem,0.65vh,0.45rem)]"

export const PAGE_NAV_SLOT_NEXT_CLASS =
  `${PAGE_NAV_SLOT_CLASS} justify-end translate-x-[clamp(0.4rem,0.95vw,0.7rem)]`

export const PAGE_NAV_ARROW_BTN_CLASS =
  "interactive-scale block w-[clamp(2.9rem,4.2vw,3.7rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 opacity-90 transition hover:opacity-100 disabled:cursor-default disabled:opacity-0"

export const PAGE_NAV_ARROW_IMG_CLASS = "block h-auto w-full select-none"