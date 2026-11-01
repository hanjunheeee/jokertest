// 카드 위 메뉴 모양: 덮개·버튼 줄·그림 버튼·글자
// 카드 메뉴(InGamePlayerCardMenu)가 사용

// 카드를 덮는 메뉴 판과 어두운 막
export const OVERLAY_WRAP_CLASS =
  "pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center px-[8%]"

export const OVERLAY_SCRIM_CLASS =
  "pointer-events-none absolute inset-0 bg-black/55"

// 메뉴 버튼 줄과 그림 버튼 (잠기면 흐리게)
export const OVERLAY_ACTIONS_CLASS =
  "relative z-10 flex w-full max-w-[92%] flex-col items-stretch gap-y-[clamp(0.35rem,2.5cqw,0.55rem)]"

export const OVERLAY_BTN_CLASS =
  "interactive-scale group relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:opacity-45"

export const OVERLAY_BTN_IMG_CLASS =
  "block h-auto w-full select-none"

export const OVERLAY_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] pb-[3%] font-subheading text-[clamp(0.68rem,4.2cqw,0.88rem)] font-bold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
