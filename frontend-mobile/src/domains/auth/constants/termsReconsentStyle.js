// 약관 재동의 양피지 창 안쪽 글·줄·버튼 모양 (데스크톱 termsStyle의 TERMS_RECONSENT_* 값 그대로)
// components/terms/TermsReconsent가 씀, 데스크톱 화면 폴더(components)는 모바일에서 못 불러 옮겨 둠

export const TERMS_RECONSENT_BODY_CLASS =
  "mx-auto flex w-[min(100%,92%)] min-h-0 min-w-0 flex-1 flex-col gap-[clamp(0.4rem,1vh,0.65rem)]"

export const TERMS_RECONSENT_GUIDE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.15vw,0.88rem)] font-semibold leading-snug text-[#3a1a0c]/90 break-keep"

export const TERMS_RECONSENT_LIST_CLASS = "flex w-full min-w-0 flex-col gap-[clamp(0.35rem,0.8vh,0.5rem)]"

export const TERMS_RECONSENT_ROW_CLASS = "flex min-w-0 items-center justify-between gap-2"

export const TERMS_RECONSENT_ITEM_LABEL_CLASS =
  "min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.85rem)] font-semibold leading-snug text-[#2a1208]"

export const TERMS_RECONSENT_ACTIONS_CLASS =
  "mt-[clamp(1.85rem,4.6vh,2.55rem)] flex w-full shrink-0 justify-center"

export const TERMS_RECONSENT_BTN_CLASS =
  "w-[clamp(9.5rem,42%,12.5rem)] shrink-0"
