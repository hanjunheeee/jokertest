// ── StorePanel ──────────────────────────────────────────────

export const STORE_PANEL_CLASS =
  "absolute left-1/2 top-[44%] z-20 w-[min(62rem,85vw)] -translate-x-1/2 -translate-y-1/2"

export const STORE_PANEL_INNER_PAD = {
  paddingTop: "9.5%",
  paddingBottom: "8.5%",
  paddingLeft: "8.5%",
  paddingRight: "8.5%",
}

export const STORE_PANEL_FRAME_CLASS =
  "pointer-events-none block h-auto w-full select-none"

export const STORE_PANEL_CONTENT_CLASS = "absolute inset-0 flex min-h-0 flex-col"

export const STORE_PANEL_MAIN_ROW_CLASS =
  "flex min-h-0 flex-1 gap-[clamp(0.55rem,1.15vw,0.9rem)] pt-[clamp(2.25rem,4.8vh,3.35rem)]"

export const STORE_PANEL_GRID_COLUMN_CLASS = "flex min-h-0 min-w-0 flex-[1.58] flex-col"

export const STORE_PANEL_SCROLL_AREA_CLASS = "min-h-0 flex-1 overflow-y-auto overscroll-contain"

export const STORE_PANEL_SIDEBAR_CLASS =
  "w-[26%] min-w-[9.25rem] shrink-0 pl-[clamp(0.9rem,1.4vw,1.1rem)]"

// ── StoreItemGrid ───────────────────────────────────────────

export const STORE_SLOT_IMAGE_WRAP_CLASS =
  "my-[clamp(0.15rem,0.35vh,0.25rem)] flex h-[clamp(5.5rem,9vw,7.5rem)] w-full items-center justify-center"

export const STORE_SLOT_IMAGE_CLASS =
  "block h-full w-full max-w-[clamp(7.75rem,12.5vw,11.25rem)] select-none object-contain object-center"

export const STORE_SLOT_SKIN_IMAGE_WRAP_CLASS =
  "relative my-[clamp(0.15rem,0.35vh,0.25rem)] flex h-[clamp(5.5rem,9vw,7.5rem)] w-full items-center justify-center overflow-hidden"

export const STORE_SKIN_STANDING_CROP_IMAGE_CLASS =
  "absolute top-0 left-1/2 block h-[380%] w-[172%] -translate-x-1/2 select-none object-cover object-[center_5%]"

export const STORE_SLOT_CARD_CLASS =
  "flex w-full flex-col overflow-hidden rounded-md border border-[#2a1810]/14 transition-[box-shadow,ring-color] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.12),_0_4px_14px_rgba(0,0,0,0.16),_0_2px_5px_rgba(0,0,0,0.10)]"

export const STORE_SLOT_CARD_SELECTED_CLASS =
  "border-[#b83232]/55 ring-2 ring-[#c43c3c]/60 [box-shadow:inset_0_1px_0_rgba(245,240,230,0.16),_0_4px_14px_rgba(0,0,0,0.16),_0_0_16px_rgba(180,40,40,0.38),_0_0_6px_rgba(220,50,50,0.28)]"

export const STORE_SLOT_TOP_CLASS =
  "flex flex-col items-center bg-[#1a0f0a]/06 px-[clamp(0.35rem,0.75vw,0.55rem)] pt-[clamp(0.35rem,0.75vh,0.55rem)] pb-[clamp(0.25rem,0.55vh,0.4rem)]"

export const STORE_SLOT_NAME_WRAP_CLASS =
  "flex min-h-[clamp(2.35rem,4.2vh,2.75rem)] w-full flex-col items-center justify-center gap-[clamp(0.05rem,0.15vh,0.1rem)] rounded-sm border border-[#2a1810]/12 bg-[#1a0f0a]/10 px-[clamp(0.3rem,0.55vw,0.45rem)] py-[clamp(0.2rem,0.45vh,0.3rem)] text-center [box-shadow:inset_0_1px_0_rgba(245,240,230,0.14)]"

/** `-` 위 직업 접두 (예: 경비원) */
export const STORE_SLOT_NAME_JOB_CLASS =
  "line-clamp-1 w-full font-subheading text-[clamp(0.72rem,0.92vw,0.82rem)] font-bold leading-snug text-[#5c554d]"

/** 상품명 본문 — 스킨명·단일 이름 */
export const STORE_SLOT_NAME_TITLE_CLASS =
  "line-clamp-1 w-full font-subheading text-[clamp(0.88rem,1.12vw,1rem)] font-extrabold leading-snug text-[#140c08]"

/** @deprecated STORE_SLOT_NAME_JOB_CLASS / STORE_SLOT_NAME_TITLE_CLASS 사용 */
export const STORE_SLOT_NAME_LINE_CLASS = STORE_SLOT_NAME_TITLE_CLASS

/** @deprecated StoreItemSlotName + STORE_SLOT_NAME_LINE_CLASS 사용 */
export const STORE_SLOT_NAME_TEXT_CLASS =
  "font-subheading text-[clamp(0.9rem,1.2vw,1.05rem)] font-extrabold leading-snug text-[#140c08] whitespace-nowrap"

/** @deprecated StoreItemSlotName 사용 */
export const STORE_SLOT_NAME_CLASS =
  "line-clamp-1 w-full px-1 text-center font-subheading text-[clamp(0.9rem,1.2vw,1.05rem)] font-extrabold leading-snug text-[#140c08]"

export const STORE_SLOT_PRICE_CLASS =
  "flex w-full items-center justify-center gap-[clamp(0.2rem,0.4vw,0.3rem)] border-t border-[#2a1810]/14 bg-[#1a0f0a]/24 px-[clamp(0.35rem,0.75vw,0.55rem)] py-[clamp(0.3rem,0.65vh,0.45rem)] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.08)]"

export const STORE_SLOT_PRICE_SELECTED_CLASS = "bg-[#1a0f0a]/32"

export const STORE_SLOT_PRICE_TEXT_CLASS =
  "font-subheading text-[clamp(0.82rem,1.1vw,0.95rem)] font-bold text-white"

export const STORE_SLOT_PRICE_AMOUNT_CLASS =
  "font-subheading text-[clamp(0.82rem,1.1vw,0.95rem)] font-bold tabular-nums text-white"

export const STORE_SLOT_PRICE_ICON_CLASS =
  "block h-[clamp(0.85rem,1.35vw,1rem)] w-auto shrink-0 select-none object-contain"

export const STORE_ITEM_SLOT_WRAP_CLASS = "relative w-full"

export const STORE_ITEM_SLOT_BTN_CLASS =
  "flex min-h-0 w-full cursor-pointer flex-col items-center justify-center overflow-visible border-0 bg-transparent p-0 transition-opacity hover:opacity-95"

export const STORE_BULK_BTN_WRAP_CLASS =
  "mb-[clamp(0.35rem,0.75vh,0.55rem)] flex items-center justify-between gap-[clamp(0.65rem,1.2vw,0.95rem)] px-[clamp(0.15rem,0.35vw,0.25rem)]"

export const STORE_SKIN_NOTICE_CLASS =
  "flex min-w-0 flex-1 items-center gap-[clamp(0.35rem,0.55vw,0.45rem)]"

export const STORE_SKIN_NOTICE_ICON_CLASS =
  "block h-[clamp(0.95rem,1.35vw,1.12rem)] w-auto shrink-0 select-none object-contain"

export const STORE_SKIN_NOTICE_TEXT_CLASS =
  "font-subheading text-[clamp(0.7rem,0.92vw,0.82rem)] font-extrabold leading-snug text-[#2a0e08]"

export const STORE_BULK_BTN_CLASS =
  "relative w-[clamp(5rem,8.5vw,6.75rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const STORE_BULK_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.68rem,0.92vw,0.78rem)] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const STORE_BULK_BTN_IMAGE_CLASS = "block h-auto w-full select-none"

export const STORE_EMPTY_GRID_CLASS =
  "flex min-h-[clamp(12rem,28vh,16rem)] w-full items-center justify-center px-[clamp(0.75rem,1.5vw,1.25rem)]"

export const STORE_EMPTY_MESSAGE_CLASS =
  "text-center font-display text-[clamp(1.35rem,2vw,1.65rem)] font-medium leading-snug text-[#2a1810]/55 antialiased"

export const STORE_GRID_CLASS =
  "grid grid-cols-4 gap-x-[clamp(0.5rem,1.05vw,0.75rem)] gap-y-[clamp(0.85rem,1.75vh,1.2rem)] p-[clamp(0.15rem,0.35vw,0.25rem)]"

export const STORE_PREVIEW_TOGGLE_BTN_CLASS =
  "group absolute right-[clamp(0.2rem,0.4vw,0.3rem)] top-[clamp(0.3rem,1.0vh,0.4rem)] z-10 h-[clamp(1.1rem,1.55vw,1.28rem)] w-[clamp(1.1rem,1.55vw,1.28rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const STORE_PREVIEW_TOGGLE_IMG_CLASS =
  "interactive-scale-sm block h-full w-full select-none object-contain"

// ── StoreSidebar ──────────────────────────────────────────────

export const STORE_SIDEBAR_WRAP_CLASS =
  "flex h-full w-full flex-col gap-[clamp(0.75rem,1.6vh,1.05rem)] px-[clamp(0.25rem,0.65vw,0.45rem)] py-[clamp(0.25rem,0.65vh,0.4rem)] font-subheading"

export const STORE_SIDEBAR_SECTION_CLASS =
  "flex min-h-0 flex-1 flex-col gap-[clamp(0.45rem,0.95vh,0.65rem)]"

export const STORE_SIDEBAR_HEADER_WRAP_CLASS =
  "border-b border-[#2a1810]/28 px-[clamp(0.5rem,0.95vw,0.7rem)] pb-[clamp(0.35rem,0.75vh,0.5rem)]"

export const STORE_SIDEBAR_HEADER_CLASS =
  "text-left font-display text-[clamp(1.38rem,1.95vw,1.68rem)] font-medium text-text-body"

export const STORE_SIDEBAR_LIST_CLASS =
  "flex min-h-0 flex-1 flex-col gap-[clamp(0.3rem,0.65vh,0.42rem)] overflow-hidden px-[clamp(0.5rem,0.95vw,0.75rem)] py-[clamp(0.45rem,0.9vh,0.65rem)]"

export const STORE_CATEGORY_ROW_CLASS =
  "w-full cursor-pointer rounded-sm px-[clamp(0.45rem,0.85vw,0.65rem)] py-[clamp(0.38rem,0.8vh,0.52rem)] text-left text-[clamp(0.95rem,1.25vw,1.1rem)] font-bold leading-snug transition-[background-color,color] bg-[#1a0f0a]/06 text-[#2a1810]/90 hover:bg-[#1a0f0a]/10"

export const STORE_CATEGORY_ROW_SELECTED_CLASS =
  "bg-[#1a0f0a]/32 text-white [box-shadow:inset_0_1px_0_rgba(245,240,230,0.08)]"

// ── StoreSelectedItemDetail ───────────────────────────────────

export const STORE_DETAIL_SECTION_CLASS =
  "mt-auto mb-[clamp(0.85rem,1.8vh,1.2rem)] shrink-0 rounded-md bg-[#1a0f0a]/22 px-[clamp(0.4rem,0.8vw,0.55rem)] py-[clamp(0.4rem,0.85vh,0.55rem)] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.10),_0_6px_18px_rgba(0,0,0,0.16)]"

export const STORE_DETAIL_ROW_CLASS =
  "flex items-center gap-[clamp(0.45rem,0.95vw,0.7rem)]"

export const STORE_DETAIL_IMAGE_WRAP_CLASS =
  "relative flex h-[clamp(3.75rem,6.5vw,5rem)] w-[clamp(3.75rem,6.5vw,5rem)] shrink-0 items-center justify-center overflow-hidden"

export const STORE_DETAIL_SKIN_CROP_IMAGE_CLASS = STORE_SKIN_STANDING_CROP_IMAGE_CLASS

export const STORE_DETAIL_IMAGE_CLASS =
  "block h-full w-full select-none object-contain object-center"

export const STORE_DETAIL_INFO_CLASS =
  "flex min-w-0 flex-1 flex-col justify-center gap-[clamp(0.15rem,0.35vh,0.22rem)] font-subheading"

export const STORE_DETAIL_NAME_ROW_CLASS = "flex flex-wrap items-baseline gap-x-2 gap-y-0.5"

export const STORE_DETAIL_NAME_CLASS =
  "font-subheading text-[clamp(1rem,1.45vw,1.18rem)] font-extrabold leading-tight text-[#140c08]"

export const STORE_DETAIL_TAG_CLASS =
  "rounded-sm bg-[#2a1810]/18 px-1.5 py-0.5 text-[clamp(0.65rem,0.9vw,0.75rem)] font-bold text-[#6b3a28]"

export const STORE_DETAIL_META_CLASS =
  "text-[clamp(0.78rem,1.05vw,0.9rem)] font-bold text-[#6b4a32]"

export const STORE_DETAIL_META_DIVIDER_CLASS = "mx-1.5 text-[#8b7355]/70"

export const STORE_DETAIL_PRICE_ROW_CLASS =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"

export const STORE_DETAIL_PRICE_GROUP_CLASS =
  "flex flex-wrap items-center gap-[clamp(0.35rem,0.65vw,0.5rem)]"

export const STORE_DETAIL_PRICE_LABEL_CLASS =
  "text-[clamp(0.88rem,1.15vw,1rem)] font-bold text-[#3d1810]"

export const STORE_DETAIL_PRICE_TEXT_CLASS =
  "text-[clamp(0.95rem,1.25vw,1.08rem)] font-bold text-white"

export const STORE_DETAIL_PRICE_AMOUNT_CLASS =
  "text-[clamp(0.95rem,1.25vw,1.08rem)] font-bold tabular-nums text-white"

export const STORE_DETAIL_PRICE_ICON_CLASS =
  "block h-[clamp(1.15rem,1.9vw,1.45rem)] w-auto shrink-0 select-none object-contain"

export const STORE_PURCHASE_BTN_CLASS =
  "relative w-[clamp(4.5rem,8vw,6.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const STORE_PURCHASE_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.75rem,1.05vw,0.88rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const STORE_PURCHASE_BTN_IMAGE_CLASS = "block h-auto w-full select-none"

// ── StoreCurrencyBalance ──────────────────────────────────────

export const STORE_CURRENCY_POSITION_CLASS =
  "absolute right-[2.5%] top-[2.5%] z-30 sm:right-[3%] sm:top-[3%]"

export const STORE_CURRENCY_FRAME_CLASS =
  "flex items-center gap-[clamp(0.65rem,1.2vw,0.95rem)] rounded-md border border-[#8b7355]/50 bg-[#f5f0e6]/84 px-[clamp(0.7rem,1.15vw,0.95rem)] py-[clamp(0.38rem,0.7vh,0.52rem)] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.55),_0_4px_14px_rgba(26,15,10,0.24)] backdrop-blur-[3px]"

export const STORE_CURRENCY_DIVIDER_CLASS =
  "h-[clamp(1rem,1.55vw,1.2rem)] w-px shrink-0 bg-[#2a1810]/20"

export const STORE_CURRENCY_ITEM_CLASS =
  "flex items-center gap-[clamp(0.3rem,0.55vw,0.45rem)]"

export const STORE_CURRENCY_ICON_CLASS =
  "block h-[clamp(1.35rem,2.1vw,1.65rem)] w-auto shrink-0 select-none object-contain"

export const STORE_CURRENCY_AMOUNT_CLASS =
  "font-subheading text-[clamp(0.95rem,1.25vw,1.1rem)] font-bold tabular-nums text-[#2a1810]"
