// 상점 쿠폰 양피지 창 레이아웃·문구·입력 (모바일 CouponDialog와 같은 역할)
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { FALLBACK_FRAME_CLASS } from "@/domains/game/ingame/constants/parchment/ingameParchmentLayout.js"
import { MODAL_ASSETS } from "@/domains/game/matching/constants/friendInviteModalAssets.js"
import { CONFIRM_BTN_CLASS_TIGHT } from "@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js"

export const COUPON_PARCHMENT_FRAME_CLASS =
  "pointer-events-auto relative aspect-[3/2] w-[min(36rem,90vw,92svh)] select-none"

export const COUPON_PARCHMENT_FALLBACK_FRAME_CLASS = FALLBACK_FRAME_CLASS

export const COUPON_PARCHMENT_CONTENT_CLASS = `absolute inset-0 flex min-h-0 flex-col items-stretch justify-start gap-[clamp(0.35rem,1vh,0.55rem)] overflow-y-auto overscroll-contain px-[18%] pb-[13%] pt-[12%] text-left text-[#3a1a0c] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const COUPON_PARCHMENT_FALLBACK_CONTENT_CLASS = `flex max-h-[80svh] min-h-0 flex-col items-stretch justify-start gap-2 overflow-y-auto overscroll-contain px-6 py-7 text-left text-[#3a1a0c] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const COUPON_DIALOG_TITLE_OFFSET_CLASS = "mt-[clamp(0.35rem,1vh,0.55rem)]"

export const COUPON_DIALOG_GUIDE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.15vw,0.88rem)] font-semibold leading-snug text-[#3a1a0c]/90 break-keep"

export const COUPON_DIALOG_FORM_CLASS =
  "mx-auto flex min-h-0 w-[min(100%,92%)] min-w-0 flex-1 flex-col gap-2"

export const COUPON_DIALOG_ACTIONS_CLASS =
  "mt-[clamp(0.65rem,1.6vh,1rem)] flex w-full flex-nowrap items-center justify-center gap-[clamp(0.35rem,1.2vw,0.75rem)]"

export const COUPON_DIALOG_BTN_CLASS = `${CONFIRM_BTN_CLASS_TIGHT} !mt-0 w-[clamp(6.2rem,14vw,7.4rem)] shrink-0`

export const COUPON_INPUT_WRAP_CLASS = "relative h-[clamp(2.15rem,4.5vh,2.5rem)] w-full min-w-0"

export const COUPON_INPUT_IMG_CLASS = "pointer-events-none block h-full w-full select-none object-fill"

export const COUPON_INPUT_ROW_CLASS =
  "absolute inset-0 flex items-center pl-[9%] pr-[4%]"

export const COUPON_INPUT_FIELD_CLASS =
  "min-w-0 flex-1 bg-transparent font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.1vw,0.9rem)] uppercase tracking-wide text-white outline-none placeholder:text-white/55"

// 성공·실패 글자색: 양피지 바탕(약 #bc9b6a)에서 대비 4.5 넘게 짙게 (#2E6B3A·#9C3D32는 2.5 남짓이라 PC 쿠폰 시험 A12-E-056~060이 못 읽음)
export const COUPON_DIALOG_SUCCESS_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1vw,0.82rem)] font-bold leading-snug text-[#143319]"

export const COUPON_DIALOG_ERROR_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1vw,0.82rem)] font-bold leading-snug text-[#5A1710]"

export const COUPON_CANCEL_BTN_ASSET = MODAL_ASSETS.cancelButton
