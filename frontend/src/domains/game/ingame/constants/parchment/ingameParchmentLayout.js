import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../../../shared/constants/customScrollbarStyles.js"

export const IMG_URL = "/frame/양피지 모달.png".normalize("NFD")

export const FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(40rem,92cqw,132svh)] select-none"

export const IMG_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full object-contain"

export const CONTENT_CLASS =
  `absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto overscroll-contain px-[16%] py-[17%] text-center text-[#3a1a0c] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const FALLBACK_FRAME_CLASS =
  "pointer-events-auto relative w-[min(40rem,92cqw)] rounded-lg border border-[#6b4321] bg-gradient-to-b from-[#f3e5bd] via-[#e7d19f] to-[#c9a05f] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

export const FALLBACK_CONTENT_CLASS =
  `flex max-h-[80svh] flex-col items-center justify-center gap-2 overflow-y-auto overscroll-contain px-6 py-7 text-center text-[#3a1a0c] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`
