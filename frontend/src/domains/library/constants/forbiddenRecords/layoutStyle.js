// 금지된 기록 쪽 화면 모양 className (원고 글·잠금 층·해금 조건·보상)
// forbiddenRecords/ 왼쪽·오른쪽 쪽과 해금 조건 컴포넌트가 씀
import { BOOK_PAGE_BASE_CLASS, BOOK_PAGE_SCROLL_CLASS } from "../libraryLayoutStyle.js"

// 잉크 글자 공통 (글꼴·색·살짝 그림자)
const LIBRARY_TEXT_FONT_CLASS = "font-subheading"
const INK_READABILITY_CLASS =
  "antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.1)]"
const INK_TITLE_COLOR_CLASS = "text-[#120a06]"
const INK_BODY_COLOR_CLASS = "text-[#1a1008]"

// 쪽 틀: 왼쪽, 오른쪽 풀림·잠김 (잠김은 핏자국이 쪽 밖으로 넘쳐 보임)
export const LEFT_PAGE_CLASS =
  `${BOOK_PAGE_SCROLL_CLASS} pl-[clamp(0.35rem,1.2vw,0.65rem)] pr-[clamp(0.5rem,1.45vw,0.8rem)] pt-[clamp(0.45rem,1.1vh,0.7rem)]`

export const BOOK_RIGHT_PAGE_CLASS =
  `${BOOK_PAGE_SCROLL_CLASS} pl-[clamp(0.2rem,0.5vw,0.45rem)]`

export const BOOK_RIGHT_PAGE_LOCKED_CLASS =
  `${BOOK_PAGE_BASE_CLASS} overflow-visible pl-[clamp(0.2rem,0.5vw,0.45rem)] -mt-[clamp(0.35rem,1vh,0.55rem)]`

// 왼쪽 원고 제목·본문
export const SECTION_CLASS = "not-first:mt-[clamp(0.85rem,1.8vh,1.25rem)]"

export const SECTION_TITLE_CLASS =
  `${LIBRARY_TEXT_FONT_CLASS} app-text-scaled [--app-text-size:clamp(1.08rem,1.38vw,1.24rem)] font-extrabold leading-snug ${INK_TITLE_COLOR_CLASS} ${INK_READABILITY_CLASS}`

export const SECTION_BODY_CLASS =
  `whitespace-pre-line ${LIBRARY_TEXT_FONT_CLASS} app-text-scaled [--app-text-size:clamp(0.8rem,1.15vw,0.97rem)] font-medium leading-[1.7] ${INK_BODY_COLOR_CLASS} ${INK_READABILITY_CLASS}`

export const SECTION_BODY_WRAP_CLASS =
  "mt-[clamp(0.35rem,0.8vh,0.55rem)] flex flex-col gap-[clamp(0.55rem,1.2vh,0.85rem)]"

// 잠긴 오른쪽: 핏자국 그림 위에 해금 조건 겹침
export const LOCK_LAYER_CLASS =
  "relative h-full min-h-[clamp(12rem,32vh,18rem)] w-full overflow-visible"

export const BLOOD_CLASS =
  "pointer-events-none absolute left-[-10%] top-[3%] z-0 h-[88%] w-[112%] max-w-none select-none object-contain object-left-top"

export const UNLOCK_LAYER_CLASS =
  "absolute inset-0 z-[1] flex items-center justify-center px-[8%]"

// 해금 조건 글자 (흰 글씨 + 진한 그림자)
const UNLOCK_INK_CLASS =
  "font-display font-medium text-white antialiased [text-shadow:0_2px_6px_rgba(0,0,0,0.85)]"

export const UNLOCK_STACK_CLASS =
  "pointer-events-none flex flex-col items-center text-center"

export const UNLOCK_ROW_CLASS =
  "flex items-center justify-center gap-[clamp(0.12rem,0.35vw,0.22rem)]"

export const UNLOCK_BRACKET_CLASS =
  `${UNLOCK_INK_CLASS} shrink-0 app-text-scaled [--app-text-size:clamp(1.75rem,2.25vw,2.35rem)] leading-none`

export const UNLOCK_CONDITION_CLASS =
  `${UNLOCK_INK_CLASS} shrink-0 whitespace-nowrap app-text-scaled [--app-text-size:clamp(1.15rem,1.55vw,1.75rem)] leading-none`

export const UNLOCK_SUFFIX_CLASS =
  `${UNLOCK_INK_CLASS} mt-[clamp(0.35rem,0.9vh,0.55rem)] app-text-scaled [--app-text-size:clamp(1.55rem,2vw,2.05rem)] leading-none`

export const UNLOCK_CHALLENGE_GROUP_CLASS =
  "flex -translate-y-[clamp(0.55rem,1.35vh,0.9rem)] flex-col items-center"

// 진행도·보상 줄
export const UNLOCK_PROGRESS_STACK_CLASS =
  "mt-[clamp(0.75rem,1.4vh,1rem)] flex flex-col items-center gap-[clamp(0.25rem,0.5vh,0.35rem)]"

const UNLOCK_PROGRESS_INK_CLASS =
  "antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_2px_10px_rgba(0,0,0,0.9)]"

export const UNLOCK_PROGRESS_LABEL_CLASS =
  `${LIBRARY_TEXT_FONT_CLASS} ${UNLOCK_PROGRESS_INK_CLASS} app-text-scaled [--app-text-size:clamp(0.9rem,1.15vw,1rem)] font-semibold leading-none text-[#f0e6d8]`

export const UNLOCK_PROGRESS_VALUE_CLASS =
  `font-display ${UNLOCK_PROGRESS_INK_CLASS} whitespace-nowrap app-text-scaled [--app-text-size:clamp(1.15rem,1.5vw,1.32rem)] font-medium leading-none text-white`

export const UNLOCK_REWARD_STACK_CLASS =
  "mt-[clamp(1.05rem,2.1vh,1.4rem)] flex flex-col items-center gap-[clamp(0.3rem,0.55vh,0.42rem)]"

export const UNLOCK_REWARD_LABEL_CLASS =
  `${LIBRARY_TEXT_FONT_CLASS} ${UNLOCK_PROGRESS_INK_CLASS} app-text-scaled [--app-text-size:clamp(0.9rem,1.15vw,1rem)] font-semibold leading-none text-[#f0e6d8]`

export const UNLOCK_REWARD_ROW_CLASS =
  "flex items-center justify-center gap-[clamp(0.75rem,1.35vw,1rem)]"

export const UNLOCK_REWARD_ITEM_CLASS =
  "flex items-center gap-[clamp(0.18rem,0.35vw,0.28rem)]"

export const UNLOCK_REWARD_ICON_CLASS =
  "h-[clamp(1.4rem,1.9vw,1.7rem)] w-auto shrink-0 select-none object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"

export const UNLOCK_REWARD_COUNT_CLASS =
  `font-display ${UNLOCK_PROGRESS_INK_CLASS} app-text-scaled [--app-text-size:clamp(0.95rem,1.22vw,1.08rem)] font-medium leading-none text-white`

// 풀린 기록 본문
export const UNLOCKED_BODY_CLASS =
  `px-[8%] text-center ${LIBRARY_TEXT_FONT_CLASS} app-text-scaled [--app-text-size:clamp(0.9rem,1.15vw,1.02rem)] font-medium leading-[1.7] ${INK_BODY_COLOR_CLASS} ${INK_READABILITY_CLASS}`