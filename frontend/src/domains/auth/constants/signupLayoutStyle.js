import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const SIGNUP_HEADER_TEXT_CLASS =
  "mt-[56px] mb-[-10px] font-subheading app-text-scaled [--app-text-size:12px] font-bold leading-snug text-text-body/90"

export const SIGNUP_FORM_BODY_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden"

export const SIGNUP_SCROLL_WRAP_CLASS =
  "relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden"

export const SIGNUP_SCROLL_AREA_CLASS =
  `absolute inset-0 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain pt-3 pb-12 pr-[clamp(0.85rem,1.6vw,1.15rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const SIGNUP_SCROLLBAR_CLASS =
  "z-10 !h-auto !translate-x-0 -translate-y-1 !top-0 !bottom-6"

export const SIGNUP_HINT_TEXT_CLASS =
  "px-2 text-center font-subheading app-text-scaled [--app-text-size:12px] leading-snug text-black"

export const SIGNUP_SUBMIT_BUTTON_WRAP_CLASS =
  "mx-auto mt-0.5 w-[94%] max-h-[2.65rem] overflow-hidden"

export const SIGNUP_SUBMIT_BUTTON_CLASS =
  "block w-full origin-top scale-[0.62] cursor-pointer"

export const SIGNUP_MODE_SWITCH_CLASS = "mt-2 mb-2 origin-top scale-[0.94] [&_p]:mt-0"

const SIGNUP_ACTION_BUTTON_SCALE_CLASS = "shrink-0 cursor-pointer scale-[0.64]"

export const SIGNUP_ACTION_BUTTON_INTERACTION_CLASS =
  "transition-transform duration-200 ease-out hover:scale-[0.68] active:scale-[0.61] disabled:hover:scale-[0.64] disabled:active:scale-[0.64]"

export const SIGNUP_EMAIL_CHECK_BLOCK_CLASS =
  "relative z-10 mx-auto mt-0.5 grid min-h-[2.5rem] w-[97%] grid-cols-1 grid-rows-1 py-0 leading-none"

export const SIGNUP_EMAIL_CHECK_BUTTON_CLASS =
  "col-start-1 row-start-1 justify-self-start min-w-[7.5rem] shrink-0 cursor-pointer [&_img]:block [&_img]:h-[2.5rem] [&_img]:w-full"

export const SIGNUP_EMAIL_CHECK_BUTTON_LABEL_CLASS =
  "whitespace-nowrap px-1 app-text-scaled [--app-text-size:12px] leading-none"

export const SIGNUP_EMAIL_CHECK_MESSAGE_LAYER_CLASS =
  "pointer-events-none col-start-1 row-start-1 flex min-w-0 items-center justify-end self-stretch pl-[8rem] pr-[2%]"

export const SIGNUP_EMAIL_CHECK_MESSAGE_CLASS =
  "shrink-0 whitespace-nowrap app-text-scaled [--app-text-size:13px] leading-none"

export const SIGNUP_EMAIL_CHECK_MESSAGE_AVAILABLE_CLASS = "text-emerald-800"

export const SIGNUP_EMAIL_CHECK_MESSAGE_ERROR_CLASS = "text-red-800"
export const SIGNUP_EMAIL_VERIFICATION_BLOCK_CLASS =
  "mx-auto flex w-[97%] flex-col gap-0.5 rounded bg-white/10 px-1.5 py-1"

export const SIGNUP_EMAIL_VERIFICATION_TITLE_CLASS =
  "px-1 font-subheading app-text-scaled [--app-text-size:13px] font-bold leading-none text-black"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_CLASS = "shrink-0 px-1"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_SLOT_RESERVED_CLASS =
  "min-h-[1.35rem]"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_ERROR_CLASS =
  "app-text-scaled [--app-text-size:13px] leading-tight text-red-800"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_INFO_CLASS =
  "app-text-scaled [--app-text-size:11px] leading-tight text-white/70"

export const SIGNUP_EMAIL_VERIFICATION_NOTICE_SUCCESS_CLASS =
  "app-text-scaled [--app-text-size:11px] leading-tight text-emerald-400"

export const SIGNUP_CODE_SEND_BUTTON_CLASS =
  `${SIGNUP_ACTION_BUTTON_SCALE_CLASS} origin-right w-[clamp(5rem,32%,5.8rem)]`

export const SIGNUP_ACTION_BUTTON_LABEL_CLASS =
  "!text-black app-text-scaled [--app-text-size:15px] leading-tight"
