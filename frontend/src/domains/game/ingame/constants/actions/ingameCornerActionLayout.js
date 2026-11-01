// 오른쪽 아래 행동 패널 모양: 패널 자리·그림 버튼·투표 현황 버튼
// 오른쪽 아래 행동 패널·그림 행동 버튼(InGameImageActionButton)이 사용

// 패널 자리 (오른쪽 아래, 버튼 글자 크기는 패널 폭 기준)
export const PANEL_CLASS =
  "pointer-events-auto absolute bottom-[clamp(1.25rem,3.6vh,2rem)] right-[clamp(0.35rem,1.2vw,0.85rem)] z-10 flex items-end justify-end gap-[clamp(0.35rem,1.1vw,0.65rem)] [container-type:inline-size]"

// 그림 행동 버튼(기권·건너뛰기) 틀·그림·글자
export const CORNER_ACTION_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(7.2rem,22vw,9.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:opacity-45"

export const CORNER_ACTION_BTN_WRAP_CLASS = "relative shrink-0"

export const CORNER_ACTION_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.96] group-disabled:hover:scale-100 group-disabled:active:scale-100"

export const CORNER_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] pb-[4%] text-center font-subheading text-[clamp(0.82rem,4.1cqi,1.05rem)] font-bold leading-tight text-white translate-y-[clamp(0.18rem,1.05cqi,0.3rem)] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 투표 현황 버튼도 같은 모양 씀
export const VOTE_TOGGLE_WRAP_CLASS = CORNER_ACTION_BTN_WRAP_CLASS

export const VOTE_TOGGLE_BTN_CLASS = CORNER_ACTION_BTN_CLASS

export const VOTE_TOGGLE_BTN_IMG_CLASS = CORNER_ACTION_BTN_IMG_CLASS

export const VOTE_TOGGLE_BTN_LABEL_CLASS = CORNER_ACTION_BTN_LABEL_CLASS
