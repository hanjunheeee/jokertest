// 고객센터(문의) 팝업 — 보내기·목록으로 버튼 (데스크톱)
import { REASON_BTN_CLASS, REASON_OFF_CLASS } from "@/domains/report/constants/reportLayout.js"

export const INQUIRY_DETAIL_ROOT_CLASS = "flex min-h-0 flex-1 flex-col"

export const INQUIRY_DETAIL_SCROLL_CLASS =
  "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain"

export const INQUIRY_BACK_BTN_CLASS = `${REASON_BTN_CLASS} ${REASON_OFF_CLASS} mt-1 shrink-0 self-end px-3`
export const INQUIRY_SUBMIT_BTN_CLASS =
  "group relative mx-auto mt-1 block h-[clamp(2.25rem,7.5cqi,2.65rem)] w-[clamp(7.75rem,30cqi,9.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-default disabled:opacity-80 disabled:hover:scale-100"

export const INQUIRY_SUBMIT_BTN_IMG_CLASS =
  "pointer-events-none block h-full w-full select-none object-contain"

export const INQUIRY_SUBMIT_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,2.3cqi,0.9rem)] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
