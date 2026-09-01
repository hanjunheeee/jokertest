export const STORE_BULK_PURCHASE_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

export const STORE_BULK_PURCHASE_BACKDROP_CLASS =
  "fixed inset-0 z-[55] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

export const STORE_BULK_PURCHASE_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center p-[clamp(1rem,3vw,2rem)]"

export const STORE_BULK_PURCHASE_PANEL_CLASS =
  "pointer-events-auto relative flex w-[min(36rem,92vw)] max-w-[42rem] flex-col overflow-hidden rounded-[1.1rem] border border-[#b83232]/40 bg-[#f5f0e6]/84 ring-1 ring-[#c43c3c]/14 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),0_16px_42px_rgba(26,15,10,0.36)]"

export const STORE_BULK_PURCHASE_HEADER_CLASS =
  "border-b border-[#2a1810]/14 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.65rem,1.2vh,0.85rem)]"

export const STORE_BULK_PURCHASE_TITLE_CLASS =
  "font-display text-[clamp(1.15rem,1.65vw,1.35rem)] font-medium text-[#3d1810]"

export const STORE_BULK_PURCHASE_BODY_CLASS =
  "flex min-h-[min(12rem,32vh)] max-h-[min(22rem,52vh)]"

export const STORE_BULK_PURCHASE_LIST_CLASS =
  "flex min-h-0 min-w-0 flex-[1.35] flex-col gap-[clamp(0.35rem,0.75vh,0.5rem)] overflow-y-auto overscroll-contain border-r border-[#2a1810]/12 px-[clamp(0.75rem,1.35vw,1rem)] py-[clamp(0.65rem,1.2vh,0.85rem)]"

export const STORE_BULK_PURCHASE_SUMMARY_CLASS =
  "flex min-w-[9.5rem] flex-[0.85] flex-col justify-between gap-[clamp(0.75rem,1.4vh,1rem)] px-[clamp(0.75rem,1.35vw,1rem)] py-[clamp(0.75rem,1.35vh,1rem)]"

export const STORE_BULK_PURCHASE_ITEM_ROW_CLASS =
  "flex items-center gap-[clamp(0.45rem,0.85vw,0.65rem)] rounded-sm bg-[#1a0f0a]/08 px-[clamp(0.4rem,0.75vw,0.55rem)] py-[clamp(0.35rem,0.7vh,0.5rem)]"

export const STORE_BULK_PURCHASE_ITEM_IMAGE_WRAP_CLASS =
  "flex h-[clamp(2.35rem,4.2vw,2.85rem)] w-[clamp(2.35rem,4.2vw,2.85rem)] shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[#1a0f0a]/06"

export const STORE_BULK_PURCHASE_ITEM_IMAGE_CLASS =
  "block h-full w-full select-none object-contain object-center"

export const STORE_BULK_PURCHASE_ITEM_INFO_CLASS =
  "flex min-w-0 flex-1 flex-col gap-[clamp(0.1rem,0.2vh,0.15rem)]"

export const STORE_BULK_PURCHASE_ITEM_NAME_CLASS =
  "line-clamp-2 font-subheading text-[clamp(0.78rem,1.05vw,0.9rem)] font-extrabold leading-snug text-[#140c08]"

export const STORE_BULK_PURCHASE_ITEM_PRICE_CLASS =
  "flex items-center gap-[clamp(0.15rem,0.3vw,0.25rem)]"

export const STORE_BULK_PURCHASE_ITEM_PRICE_AMOUNT_CLASS =
  "font-subheading text-[clamp(0.72rem,0.95vw,0.82rem)] font-bold tabular-nums text-[#5c554d]"

export const STORE_BULK_PURCHASE_ITEM_PRICE_ICON_CLASS =
  "block h-[clamp(0.72rem,1.1vw,0.85rem)] w-auto shrink-0 select-none object-contain"

export const STORE_BULK_PURCHASE_TOTAL_LABEL_CLASS =
  "font-subheading text-[clamp(0.88rem,1.15vw,1rem)] font-bold text-[#3d1810]"

export const STORE_BULK_PURCHASE_TOTAL_ROW_CLASS =
  "flex flex-col gap-[clamp(0.35rem,0.7vh,0.5rem)] rounded-sm bg-[#1a0f0a]/10 px-[clamp(0.55rem,1vw,0.75rem)] py-[clamp(0.55rem,1vh,0.75rem)]"

export const STORE_BULK_PURCHASE_TOTAL_AMOUNT_ROW_CLASS =
  "flex items-center justify-center gap-[clamp(0.25rem,0.45vw,0.35rem)]"

export const STORE_BULK_PURCHASE_TOTAL_AMOUNT_CLASS =
  "font-subheading text-[clamp(1.05rem,1.45vw,1.2rem)] font-extrabold tabular-nums text-[#140c08]"

export const STORE_BULK_PURCHASE_TOTAL_ICON_CLASS =
  "block h-[clamp(1.15rem,1.85vw,1.4rem)] w-auto shrink-0 select-none object-contain"

export const STORE_BULK_PURCHASE_TOTAL_PENDING_CLASS =
  "text-center font-subheading text-[clamp(0.95rem,1.25vw,1.08rem)] font-bold text-[#5c554d]"

export const STORE_BULK_PURCHASE_CONFIRM_BTN_CLASS =
  "relative w-full cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const STORE_BULK_PURCHASE_CONFIRM_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.82rem,1.1vw,0.95rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const STORE_BULK_PURCHASE_CONFIRM_BTN_IMAGE_CLASS = "block h-auto w-full select-none"

export const STORE_BULK_PURCHASE_CLOSE_BTN_CLASS =
  "interactive-scale absolute right-[clamp(0.35rem,2%,0.65rem)] top-[clamp(0.45rem,2.2%,0.65rem)] z-20 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const STORE_BULK_PURCHASE_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.1rem,3.8vw,2.65rem)] select-none"
