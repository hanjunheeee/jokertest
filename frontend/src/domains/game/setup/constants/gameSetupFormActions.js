/** 설정 패널 하단 — 저장·취소 이미지 버튼 공통 */
export const GAME_SETUP_FORM_ACTION_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(13.5rem,20vw,17.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60"

export const GAME_SETUP_FORM_ACTION_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(1.22rem,1.75vw,1.42rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 저장 단독 — 가운데 정렬 */
export const GAME_SETUP_FORM_ACTIONS_SINGLE_CLASS =
  "mx-auto mt-[clamp(0.55rem,1.2vh,0.85rem)] w-fit"

/** 저장 + 취소 — 가로 1줄(저장 왼쪽, 취소 오른쪽) */
export const GAME_SETUP_FORM_ACTIONS_ROW_CLASS =
  "mx-auto mt-[clamp(0.55rem,1.2vh,0.85rem)] flex w-fit flex-row flex-nowrap items-center justify-center gap-x-[clamp(0.55rem,1.15vw,0.85rem)]"
