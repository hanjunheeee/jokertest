// 마이페이지 레이아웃 + 피의 기록·운명의 가면 프레임 스타일

export const MY_PAGE_UI_FADE = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1],
}

export const MY_PAGE_ROOT_CLASS = "relative z-10 flex h-full min-h-0 flex-col"
export const MY_PAGE_MAIN_CLASS =
  "relative flex min-h-0 flex-1 items-center justify-center px-[clamp(1rem,3vw,2rem)] pt-[clamp(2.5rem,6vh,4.5rem)] pb-[clamp(1rem,2.5vh,1.5rem)]"

export const MY_PAGE_CENTER_STACK_CLASS =
  "flex w-full min-w-0 -translate-y-[clamp(0.75rem,2.5vh,1.75rem)] flex-col items-center gap-[clamp(0.55rem,1.4vh,0.9rem)]"

export const MY_PAGE_BANNER_WRAP_CLASS =
  "absolute top-[2.5%] left-[0.5%] z-20 sm:top-[3%] sm:left-[1%]"

export const MY_PAGE_FRAME_WIDTH_CLASS = "w-[min(100%,clamp(26rem,68vw,34rem))]"

export const MY_PAGE_SUMMARY_PANEL_CLASS =
  "flex w-full min-w-0 shrink-0 items-center justify-center px-[clamp(0.5rem,2vw,1rem)]"

export const MY_PAGE_SUMMARY_BLOOD_RECORD_CLASS =
  "relative mx-auto w-[min(100%,clamp(26rem,68vw,34rem))] shrink-0 [container-type:inline-size]"

export const MY_PAGE_ACTION_BUTTONS_WRAP_CLASS = "absolute top-[2.5%] right-[0.5%] z-20 flex flex-col items-stretch gap-[clamp(0.35rem,0.75vh,0.55rem)] sm:top-[3%] sm:right-[1%]"
export const MY_PAGE_ACTION_BUTTON_CLASS = "relative block w-[clamp(6.25rem,10vw,8.5rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85"
export const MY_PAGE_ACTION_BUTTON_IMG_CLASS = "block h-auto w-full select-none"
export const MY_PAGE_ACTION_BUTTON_TEXT_CLASS = "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.78rem,1.05vw,0.92rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

// 피의 기록 프레임
export const BLOOD_RECORD_TEXT_SHADOW = "0 1px 2px rgba(255,255,255,0.35), 0 1px 3px rgba(0,0,0,0.5)"

export const BLOOD_RECORD_CONTENT_INSET = {
  top: "24%",
  bottom: "14%",
  left: "15%",
  right: "15%",
}

export const BLOOD_RECORD_ROW_LABEL_CLASS = "font-subheading text-[3.6cqi] font-bold leading-none text-[#3d1810]"
export const BLOOD_RECORD_ROW_VALUE_CLASS = "font-subheading text-[3.8cqi] font-bold leading-none tracking-wide text-[#2a0e08] tabular-nums"

export const BLOOD_RECORD_FRAME_IMG_CLASS = "block h-auto w-full shrink-0 select-none"

// 운명의 가면 프레임
export const FATE_MASK_UI_FADE = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1],
}

export const FATE_MASK_TEXT_SHADOW = "0 1px 2px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.55)"

export const FATE_MASK_DESCRIPTION_INSET = {
  top: "55.5%",
  bottom: "20%",
  left: "14%",
  right: "14%",
}

export const FATE_MASK_FOOTER_CLASS =
  "pointer-events-none flex w-full shrink-0 justify-center px-[clamp(0.5rem,2vw,1rem)]"

export const FATE_MASK_FRAME_WRAP_CLASS =
  "relative mx-auto w-[min(100%,clamp(26rem,68vw,34rem))] [container-type:inline-size]"

export const FATE_MASK_DESCRIPTION_CLASS = "pointer-events-none absolute flex items-end justify-center pb-[0.18em] text-center font-subheading text-[3.1cqi] font-bold leading-[1.55] text-[#e8e4dc]"
export const FATE_MASK_HIGHLIGHT_CLASS = "text-[#e8c878] [text-shadow:0_0_10px_rgba(232,200,120,0.45)]"

export const FATE_MASK_FRAME_IMG_CLASS = "block h-auto w-full select-none"
