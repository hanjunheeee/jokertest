import { LIBRARY_BOOK_PAGE_BASE_CLASS, LIBRARY_BOOK_PAGE_SCROLL_CLASS } from "@/domains/library/constants/libraryLayoutStyle.js"

const LIBRARY_TEXT_FONT_CLASS = "font-subheading"
const LIBRARY_INK_READABILITY_CLASS =
  "antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.1)]"
const LIBRARY_INK_TITLE_COLOR_CLASS = "text-[#120a06]"
const LIBRARY_INK_BODY_COLOR_CLASS = "text-[#1a1008]"

export const LIBRARY_FORBIDDEN_LEFT_PAGE_CLASS =
  `${LIBRARY_BOOK_PAGE_SCROLL_CLASS} pl-[clamp(0.35rem,1.2vw,0.65rem)] pr-[clamp(0.5rem,1.45vw,0.8rem)] pt-[clamp(0.45rem,1.1vh,0.7rem)]`

export const LIBRARY_BOOK_RIGHT_PAGE_CLASS =
  `${LIBRARY_BOOK_PAGE_SCROLL_CLASS} pl-[clamp(0.2rem,0.5vw,0.45rem)]`

export const LIBRARY_BOOK_RIGHT_PAGE_LOCKED_CLASS =
  `${LIBRARY_BOOK_PAGE_BASE_CLASS} overflow-visible pl-[clamp(0.2rem,0.5vw,0.45rem)] -mt-[clamp(0.35rem,1vh,0.55rem)]`

export const LIBRARY_FORBIDDEN_SECTION_CLASS = "not-first:mt-[clamp(0.85rem,1.8vh,1.25rem)]"

export const LIBRARY_FORBIDDEN_SECTION_TITLE_CLASS =
  `${LIBRARY_TEXT_FONT_CLASS} text-[clamp(1.08rem,1.38vw,1.24rem)] font-extrabold leading-snug ${LIBRARY_INK_TITLE_COLOR_CLASS} ${LIBRARY_INK_READABILITY_CLASS}`

export const LIBRARY_FORBIDDEN_SECTION_BODY_CLASS =
  `whitespace-pre-line ${LIBRARY_TEXT_FONT_CLASS} text-[clamp(0.8rem,1.15vw,0.97rem)] font-medium leading-[1.7] ${LIBRARY_INK_BODY_COLOR_CLASS} ${LIBRARY_INK_READABILITY_CLASS}`

export const LIBRARY_FORBIDDEN_SECTION_BODY_WRAP_CLASS =
  "mt-[clamp(0.35rem,0.8vh,0.55rem)] flex flex-col gap-[clamp(0.55rem,1.2vh,0.85rem)]"

export const LIBRARY_FORBIDDEN_LOCK_LAYER_CLASS =
  "relative h-full min-h-[clamp(12rem,32vh,18rem)] w-full overflow-visible"

export const LIBRARY_FORBIDDEN_BLOOD_CLASS =
  "pointer-events-none absolute left-[-10%] top-[3%] z-0 h-[88%] w-[112%] max-w-none select-none object-contain object-left-top"

export const LIBRARY_FORBIDDEN_UNLOCK_LAYER_CLASS =
  "absolute inset-0 z-[1] flex items-center justify-center px-[8%]"

const LIBRARY_FORBIDDEN_UNLOCK_INK_CLASS =
  "font-display font-medium text-white antialiased [text-shadow:0_2px_6px_rgba(0,0,0,0.85)]"

export const LIBRARY_FORBIDDEN_UNLOCK_STACK_CLASS =
  "pointer-events-none flex flex-col items-center text-center"

export const LIBRARY_FORBIDDEN_UNLOCK_ROW_CLASS =
  "flex items-center justify-center gap-[clamp(0.12rem,0.35vw,0.22rem)]"

export const LIBRARY_FORBIDDEN_UNLOCK_BRACKET_CLASS =
  `${LIBRARY_FORBIDDEN_UNLOCK_INK_CLASS} shrink-0 text-[clamp(1.75rem,2.25vw,2.35rem)] leading-none`

export const LIBRARY_FORBIDDEN_UNLOCK_CONDITION_CLASS =
  `${LIBRARY_FORBIDDEN_UNLOCK_INK_CLASS} shrink-0 whitespace-nowrap text-[clamp(1.15rem,1.55vw,1.75rem)] leading-none`

export const LIBRARY_FORBIDDEN_UNLOCK_SUFFIX_CLASS =
  `${LIBRARY_FORBIDDEN_UNLOCK_INK_CLASS} mt-[clamp(0.35rem,0.9vh,0.55rem)] text-[clamp(1.55rem,2vw,2.05rem)] leading-none`

export const LIBRARY_FORBIDDEN_UNLOCK_CHALLENGE_GROUP_CLASS =
  "flex -translate-y-[clamp(0.55rem,1.35vh,0.9rem)] flex-col items-center"

export const LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_STACK_CLASS =
  "mt-[clamp(0.75rem,1.4vh,1rem)] flex flex-col items-center gap-[clamp(0.25rem,0.5vh,0.35rem)]"

const LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_INK_CLASS =
  "antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_2px_10px_rgba(0,0,0,0.9)]"

export const LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_LABEL_CLASS =
  `${LIBRARY_TEXT_FONT_CLASS} ${LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_INK_CLASS} text-[clamp(0.9rem,1.15vw,1rem)] font-semibold leading-none text-[#f0e6d8]`

export const LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_VALUE_CLASS =
  `font-display ${LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_INK_CLASS} whitespace-nowrap text-[clamp(1.15rem,1.5vw,1.32rem)] font-medium leading-none text-white`

export const LIBRARY_FORBIDDEN_UNLOCK_REWARD_STACK_CLASS =
  "mt-[clamp(1.05rem,2.1vh,1.4rem)] flex flex-col items-center gap-[clamp(0.3rem,0.55vh,0.42rem)]"

export const LIBRARY_FORBIDDEN_UNLOCK_REWARD_LABEL_CLASS =
  `${LIBRARY_TEXT_FONT_CLASS} ${LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_INK_CLASS} text-[clamp(0.9rem,1.15vw,1rem)] font-semibold leading-none text-[#f0e6d8]`

export const LIBRARY_FORBIDDEN_UNLOCK_REWARD_ROW_CLASS =
  "flex items-center justify-center gap-[clamp(0.75rem,1.35vw,1rem)]"

export const LIBRARY_FORBIDDEN_UNLOCK_REWARD_ITEM_CLASS =
  "flex items-center gap-[clamp(0.18rem,0.35vw,0.28rem)]"

export const LIBRARY_FORBIDDEN_UNLOCK_REWARD_ICON_CLASS =
  "h-[clamp(1.4rem,1.9vw,1.7rem)] w-auto shrink-0 select-none object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"

export const LIBRARY_FORBIDDEN_UNLOCK_REWARD_COUNT_CLASS =
  `font-display ${LIBRARY_FORBIDDEN_UNLOCK_PROGRESS_INK_CLASS} text-[clamp(0.95rem,1.22vw,1.08rem)] font-medium leading-none text-white`

export const LIBRARY_FORBIDDEN_UNLOCKED_BODY_CLASS =
  `px-[8%] text-center ${LIBRARY_TEXT_FONT_CLASS} text-[clamp(0.9rem,1.15vw,1.02rem)] font-medium leading-[1.7] ${LIBRARY_INK_BODY_COLOR_CLASS} ${LIBRARY_INK_READABILITY_CLASS}`
