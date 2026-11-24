// 마이페이지 모바일: 프로필·뒤로 제외 본문만 세로에서 폭 조절(비율 유지)
export const MY_PAGE_SCROLL_PAD_CLASS = "pb-4"

export const MY_PAGE_CONTENT_WRAP =
  "mx-auto flex w-full max-w-[26rem] flex-col px-4 md:max-w-[30rem] land:max-w-[52rem] lg:max-w-[52rem]"

// 세로: 프로필 제외 본문만 약 91% 폭 (가로 land:contents 로 그리드 유지)
export const MY_PAGE_BODY_SCALE =
  "mx-auto flex w-[91%] min-w-0 max-w-[23.7rem] flex-col gap-2.5 land:contents land:max-w-none"

export const MY_PAGE_INNER_STACK =
  "flex flex-col gap-2.5 land:grid land:grid-cols-2 land:items-start land:gap-x-4 land:gap-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6"

export const MY_PAGE_PROFILE_ROOT_EXTRA = "mt-2.5 land:mt-3"

export const MY_PAGE_FATE_WRAPPER_EXTRA = "mt-2.5 land:mt-0"

// 운명의 가면 본문 칸 (데스크톱 FATE_MASK_DESC_INSET 대비 조금 아래)
export const MY_PAGE_FATE_DESC_INSET = {
  top: "62%",
  bottom: "14%",
  left: "14%",
  right: "14%",
}

export const MY_PAGE_BLOOD_ROW_LABEL_CLASS =
  "font-subheading app-text-scaled [--app-text-size:4.2cqi] min-w-0 break-keep font-bold leading-snug text-[#3d1810]"

export const MY_PAGE_BLOOD_ROW_VALUE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:4.4cqi] min-w-0 break-keep text-right font-bold leading-snug tracking-wide text-[#2a0e08] tabular-nums"

// 피의 기록 줄 세로 위치 (0: 전체 판수, 1: 구분선·승률)
export const MY_PAGE_BLOOD_ROW_OFFSET = ["translate-y-[0.45em]", "translate-y-[0.25em]"]

export const MY_PAGE_ACTIONS_WRAP =
  "relative z-20 mx-auto flex w-full justify-center px-1 pt-2.5 land:col-span-2 land:max-w-none land:pt-4 lg:col-span-2"

export const MY_PAGE_ACTIONS_GRID_CLASS =
  "grid w-full max-w-[20.5rem] grid-cols-2 gap-1.5 land:max-w-[min(34rem,100%)] land:grid-cols-4 land:gap-2"
