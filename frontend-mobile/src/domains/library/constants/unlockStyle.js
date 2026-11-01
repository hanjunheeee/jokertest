// 잠긴 기록 해금 조건 글자 모양 (핏자국 위 흰 글씨·진행도·보상 아이콘)
// forbidden/UnlockCondition.jsx가 씀, 값은 데스크톱 forbiddenRecords/layoutStyle.js와 같게 폰 크기로 고정
// 데스크톱 constants의 class 문자열은 모바일 Tailwind가 안 만들어 줘서(@source 안 먹음) 여기 따로 둠

const UNLOCK_INK = "font-display font-medium text-white antialiased [text-shadow:0_2px_6px_rgba(0,0,0,0.85)]"
const PROGRESS_INK = "antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_2px_10px_rgba(0,0,0,0.9)]"

export const UNLOCK_STACK_CLASS = "pointer-events-none flex flex-col items-center text-center"
export const UNLOCK_GROUP_CLASS = "flex -translate-y-2 flex-col items-center"
export const UNLOCK_ROW_CLASS = "flex max-w-full items-center justify-center gap-1"
export const UNLOCK_BRACKET_CLASS = `${UNLOCK_INK} shrink-0 app-text-scaled [--app-text-size:1.75rem] leading-none`
export const UNLOCK_CONDITION_CLASS = `${UNLOCK_INK} app-text-scaled [--app-text-size:1.15rem] leading-tight`
export const UNLOCK_SUFFIX_CLASS = `${UNLOCK_INK} mt-1.5 app-text-scaled [--app-text-size:1.55rem] leading-none`

export const PROGRESS_STACK_CLASS = "mt-3 flex flex-col items-center gap-1"
export const PROGRESS_LABEL_CLASS =
  `font-subheading ${PROGRESS_INK} app-text-scaled [--app-text-size:0.9rem] font-semibold leading-none text-[#f0e6d8]`
export const PROGRESS_VALUE_CLASS =
  `font-display ${PROGRESS_INK} app-text-scaled [--app-text-size:1.15rem] font-medium leading-tight text-white`

export const REWARD_STACK_CLASS = "mt-4 flex flex-col items-center gap-1.5"
export const REWARD_ROW_CLASS = "flex items-center justify-center gap-3"
export const REWARD_ITEM_CLASS = "flex items-center gap-1"
export const REWARD_ICON_CLASS =
  "h-[1.6rem] w-auto shrink-0 select-none object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
export const REWARD_COUNT_CLASS =
  `font-display ${PROGRESS_INK} app-text-scaled [--app-text-size:1rem] font-medium leading-none text-white`
