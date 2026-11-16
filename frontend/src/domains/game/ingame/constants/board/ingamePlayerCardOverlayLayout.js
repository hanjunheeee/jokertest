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

// 꺼진 버튼 아래 까닭 글 한 줄 (어두운 막 위 밝은 글자, 전역 p 색에 안 묻히게 색을 줄에 직접 줌)
// 글 뒤 어두운 바탕 따로 깖: 밝은 카드 그림 위에서도 대비 4.5 넘게 (흰 그림 위 약 10:1)
export const OVERLAY_REASON_CLASS =
  "pointer-events-none self-center rounded-sm bg-black/55 px-[0.5em] py-[0.15em] text-center font-subheading text-[clamp(0.6rem,3.6cqw,0.78rem)] font-bold leading-snug text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
