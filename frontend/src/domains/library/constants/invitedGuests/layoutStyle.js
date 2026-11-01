// 초대받은 손님 펼침면 화면 모양 (글자·칸·표·보상·안내 문구 className)
// 초대받은 손님 펼침면·칸 컴포넌트와 jobCatalog.js(그림 크기)가 씀

// 공통 글자 모양, 왼쪽·오른쪽 쪽 위 여백·살짝 위아래 밀기
const INVITED_GUESTS_TEXT = "font-subheading antialiased text-[#1a1008] [text-shadow:0_1px_2px_rgba(0,0,0,0.08)]"
const LEFT_PAGE_PADDING_TOP = "pt-[clamp(0.55rem,1.1vh,0.78rem)]"
const RIGHT_PAGE_PADDING_TOP = "pt-[clamp(0.78rem,1.55vh,1.05rem)]"
const SPREAD_BOTTOM_INSET = "pb-[clamp(0.75rem,1.75vh,1.15rem)]"
const LEFT_PAGE_SHIFT = "-translate-y-[clamp(0.12rem,0.45vh,0.32rem)]"
const RIGHT_PAGE_SHIFT = "translate-y-[clamp(0.08rem,0.3vh,0.2rem)]"

// 펼침면 칸 나누기: 왼쪽 위·아래, 오른쪽은 한 줄 통째 (안에서 위·아래)
export const SPREAD_GRID_CLASS =
  `grid min-h-0 w-full flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_auto] overflow-visible ${SPREAD_BOTTOM_INSET}`

export const SPREAD_LEFT_UPPER_CELL_CLASS =
  `col-start-1 row-start-1 min-h-0 overflow-hidden ${LEFT_PAGE_PADDING_TOP} ${LEFT_PAGE_SHIFT} pl-[clamp(0.35rem,1.2vw,0.65rem)] pr-[clamp(0.45rem,1.2vw,0.75rem)]`

export const SPREAD_LEFT_LOWER_CELL_CLASS =
  `col-start-1 row-start-2 ${LEFT_PAGE_SHIFT} pl-[clamp(0.35rem,1.2vw,0.65rem)] pr-[clamp(0.85rem,2vw,1.15rem)]`

export const SPREAD_RIGHT_COLUMN_CLASS =
  `col-start-2 row-span-2 grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-visible overscroll-none ${RIGHT_PAGE_PADDING_TOP} ${RIGHT_PAGE_SHIFT} pl-[clamp(1.35rem,2.75vw,1.85rem)] pr-[clamp(0.35rem,1.2vw,0.65rem)]`

export const SPREAD_RIGHT_UPPER_CELL_CLASS = "relative z-20 min-h-0 overflow-visible"

export const SPREAD_RIGHT_LOWER_CELL_CLASS = "self-end shrink-0"

export const SPREAD_UPPER_SECTION_CLASS =
  "flex shrink-0 flex-col gap-[clamp(0.35rem,0.75vh,0.5rem)]"

// 직업 탭 (오른쪽 위 칸 바깥으로 살짝 올림)
export const JOB_TABS_ANCHOR_CLASS =
  "pointer-events-auto absolute right-0 top-[-6px] z-30 -translate-y-[clamp(1.1rem,2.65vh,1.62rem)]"

export const JOB_TABS_CLASS =
  "flex max-w-full flex-nowrap items-stretch justify-end gap-[clamp(0.14rem,0.34vw,0.26rem)]"

export const JOB_TAB_BTN_CLASS =
  "interactive-scale relative inline-flex shrink-0 items-center justify-center border-0 bg-transparent px-[clamp(0.52rem,1.05vw,0.72rem)] py-[clamp(0.24rem,0.48vh,0.34rem)] min-h-[clamp(1.45rem,2.05vw,1.68rem)] leading-none whitespace-nowrap"

export const JOB_TAB_BG_IMG_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill object-center"

export const JOB_TAB_LABEL_CLASS =
  "relative z-10 font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,0.82vw,0.74rem)] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const JOB_TAB_LABEL_ACTIVE_CLASS = "text-[#e8f0dc]"

export const JOB_TAB_LABEL_INACTIVE_CLASS = "text-[#ebe2cc]/90"

// 직업 이름·칸 제목
export const JOB_TITLE_CLASS =
  "font-display text-center app-text-scaled [--app-text-size:clamp(1.45rem,2.25vw,1.9rem)] font-medium leading-snug text-[#120a06] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.1)]"

export const SECTION_TITLE_CLASS =
  `${INVITED_GUESTS_TEXT} app-text-scaled [--app-text-size:clamp(1rem,1.32vw,1.14rem)] font-black leading-snug text-[#120a06]`

// 직업 설명 문단 + 서 있는 그림 (직업마다 큰 그림·올린 그림 따로)
export const INTRO_SECTION_CLASS =
  "flex flex-col gap-[clamp(0.45rem,1vh,0.65rem)]"

export const INTRO_ROW_CLASS =
  "grid grid-cols-[minmax(0,1fr)_clamp(5.75rem,30%,7.75rem)] items-end gap-[clamp(0.45rem,1vw,0.65rem)]"

export const INTRO_TEXT_STACK_CLASS = "flex min-w-0 flex-col gap-[clamp(0.35rem,0.75vh,0.5rem)]"

export const INTRO_TEXT_CLASS =
  `${INVITED_GUESTS_TEXT} app-text-scaled [--app-text-size:clamp(0.68rem,0.92vw,0.8rem)] font-medium leading-[1.55]`

export const STANDING_IMG_WRAP_CLASS =
  "relative -translate-y-[clamp(0.55rem,1.2vh,0.85rem)] self-end"

export const STANDING_IMG_WRAP_RAISED_CLASS =
  "relative -translate-y-[clamp(0.95rem,2.05vh,1.35rem)] self-end"

export const STANDING_IMG_CLASS =
  "block h-auto max-h-[clamp(8.75rem,27vh,11.25rem)] w-full select-none object-contain object-bottom"

export const STANDING_IMG_LG_CLASS =
  "block h-auto max-h-[clamp(10.25rem,31vh,12.75rem)] w-full select-none object-contain object-bottom"

// 표 칸 묶음
export const TABLE_SECTION_CLASS =
  "relative flex min-h-0 flex-col gap-[clamp(0.35rem,0.65vh,0.45rem)]"

export const STATS_SECTION_CLASS = TABLE_SECTION_CLASS

export const CHALLENGES_SECTION_CLASS = "shrink-0"

// 도전과제 보상: 재화 아이콘·개수, 테두리 크게 보기 버튼
export const REWARD_ROW_CLASS =
  "flex flex-wrap items-center justify-end gap-[clamp(0.3rem,0.55vw,0.45rem)]"

export const REWARD_CURRENCY_CLASS = "flex items-center gap-[0.12rem]"

export const REWARD_ICON_CLASS =
  "h-[clamp(1.15rem,1.55vw,1.3rem)] w-auto shrink-0 select-none object-contain"

export const REWARD_COUNT_CLASS =
  `${INVITED_GUESTS_TEXT} app-text-scaled [--app-text-size:clamp(0.74rem,0.98vw,0.86rem)] font-semibold tabular-nums`

export const REWARD_BORDER_CLASS = "flex items-center gap-[0.2rem]"

export const REWARD_BORDER_BTN_CLASS =
  `${REWARD_BORDER_CLASS} interactive-scale max-w-full cursor-pointer rounded-[0.35rem] border border-[#2a1810]/16 bg-[#f5f0e6]/32 px-[clamp(0.4rem,0.85vw,0.55rem)] py-[clamp(0.24rem,0.48vh,0.32rem)] leading-none transition-[background-color,border-color,box-shadow] hover:border-[#2a1810]/28 hover:bg-[#f5f0e6]/48 hover:shadow-[0_1px_0_rgba(255,255,255,0.35)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a1810]/30`

export const REWARD_BORDER_ICON_CLASS =
  "h-[clamp(1.25rem,1.65vw,1.45rem)] w-[clamp(1.25rem,1.65vw,1.45rem)] shrink-0 select-none object-contain"

export const REWARD_BORDER_LABEL_CLASS =
  `${INVITED_GUESTS_TEXT} app-text-scaled [--app-text-size:clamp(0.72rem,0.94vw,0.82rem)] font-semibold leading-tight`

// 전적·랭킹을 불러오는 중·실패·빈 목록 안내 문구
export const STATE_MSG_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.76rem,0.98vw,0.88rem)] leading-snug text-[#1a1008]/80"
export const STATE_RETRY_BTN_CLASS =
  "mt-1 underline underline-offset-2 text-[#1a1008]"
