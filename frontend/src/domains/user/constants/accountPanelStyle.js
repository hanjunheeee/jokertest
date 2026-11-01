import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const FRAME_INSET = {
  paddingTop: "31.5%",
  paddingBottom: "6.5%",
  paddingLeft: "11%",
  paddingRight: "10%",
}

export const POSITION_CLASS =
  "absolute left-1/2 top-[calc(50%-1.75rem)] z-10 w-full max-w-[min(29.5rem,74vw)] -translate-x-1/2 -translate-y-1/2 px-3"

export const WRAP_CLASS = "relative w-full"

export const FRAME_SHELL_CLASS = "relative w-full"

export const FRAME_IMG_CLASS =
  "pointer-events-none block h-auto w-full select-none"

export const FRAME_CONTENT_CLASS =
  "absolute inset-0 flex min-h-0 flex-col overflow-x-visible overflow-y-hidden"

export const SCROLL_CLASS =
  `relative flex min-h-0 flex-1 flex-col overflow-x-visible overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const HEADING_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,0.98vw,0.82rem)] font-bold text-[#e8dfc8] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

export const PANEL_FORM_HEADING_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,0.98vw,0.82rem)] font-bold text-black"

export const CONTENT_CLASS =
  "flex flex-col gap-[clamp(0.7rem,1.75vh,1.05rem)] pt-[clamp(0.6rem,1.6vh,0.85rem)]"
export const PANEL_SECTION_CLASS = "flex flex-col gap-[clamp(0.4rem,0.75vh,0.52rem)]"
export const DIVIDER_SECTION_CLASS =
  `${PANEL_SECTION_CLASS} border-b border-[#8b6a3e]/30 pb-[clamp(0.7rem,1.55vh,1.05rem)]`
export const PANEL_FORM_CLASS =
  "flex w-full flex-col gap-[clamp(0.35rem,0.7vh,0.45rem)]"

export const PANEL_ACTION_AREA_CLASS =
  "flex w-full flex-col gap-[clamp(0.25rem,0.5vh,0.35rem)]"

export const PANEL_FEEDBACK_LINE_CLASS = "w-full min-w-0 overflow-x-auto"

export const PANEL_ACTION_BTN_ROW_CLASS = "flex w-full justify-end"

export const INPUT_WRAP_CLASS = "w-full max-w-full"

export const CONFIRM_BTN_SRC = "/button/버튼(수락 및 긍정).png".normalize("NFD")
export const CONFIRM_BTN_CLASS =
  "relative ml-auto block w-[clamp(5.4rem,10vw,7.6rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
export const CONFIRM_BTN_IMG_CLASS = "block h-auto w-full select-none"
export const CONFIRM_BTN_TEXT_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.6rem,0.75vw,0.68rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

export const FEEDBACK_BASE_CLASS =
  "block w-full whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.84rem)] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
export const FEEDBACK_SUCCESS_CLASS = "text-[#2E6B3A]"
export const FEEDBACK_ERROR_CLASS = "text-[#9C3D32]"
