// 상품 칸 모양 class (카드·선택 표시·이름 칸·가격 줄), 색·그림자는 데스크톱 storeLayoutStyle 값 그대로
// grid/ 아래 ItemSlot·SlotName·SlotPrice가 씀
// 데스크톱 상수 class를 import하면 모바일 Tailwind가 그 class를 안 만들어서 (빌드 css에 없음) 여기 옮겨 적음

export const SLOT_CARD_CLASS =
    "relative flex w-full flex-col overflow-hidden rounded-md border border-[#2a1810]/14 bg-[#f5f0e6]/30 transition-[box-shadow] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.12),_0_4px_14px_rgba(0,0,0,0.16),_0_2px_5px_rgba(0,0,0,0.10)]"

export const SLOT_CARD_SELECTED_CLASS =
    "border-[#b83232]/55 ring-2 ring-[#c43c3c]/60 [box-shadow:inset_0_1px_0_rgba(245,240,230,0.16),_0_4px_14px_rgba(0,0,0,0.16),_0_0_16px_rgba(180,40,40,0.38),_0_0_6px_rgba(220,50,50,0.28)]"

export const SLOT_TOP_CLASS = "flex flex-col items-center bg-[#1a0f0a]/[0.06] px-1.5 pt-1.5 pb-1"

// 이름 칸 (직업 줄·스킨명 줄)
export const SLOT_NAME_WRAP_CLASS =
    "flex min-h-10 w-full min-w-0 flex-col items-center justify-center rounded-sm border border-[#2a1810]/12 bg-[#1a0f0a]/10 px-1 py-0.5 text-center [box-shadow:inset_0_1px_0_rgba(245,240,230,0.14)]"

export const SLOT_NAME_JOB_CLASS =
    "line-clamp-1 w-full font-subheading app-text-scaled [--app-text-size:0.7rem] font-bold leading-snug text-[#5c554d]"

export const SLOT_NAME_TITLE_CLASS =
    "line-clamp-1 w-full font-subheading app-text-scaled [--app-text-size:0.84rem] font-extrabold leading-snug text-[#140c08]"

// 가격 줄
export const SLOT_PRICE_CLASS =
    "flex w-full items-center justify-center gap-1 border-t border-[#2a1810]/14 bg-[#1a0f0a]/24 px-1.5 py-1.5 [box-shadow:inset_0_1px_0_rgba(245,240,230,0.08)]"

export const SLOT_PRICE_SELECTED_CLASS = "bg-[#1a0f0a]/32"

export const SLOT_PRICE_TEXT_CLASS =
    "font-subheading app-text-scaled [--app-text-size:0.85rem] font-bold tabular-nums text-white"

export const SLOT_PRICE_ICON_CLASS = "block h-4 w-4 shrink-0 select-none object-contain"
