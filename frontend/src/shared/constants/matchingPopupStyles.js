// 매칭 대기 팝업의 버튼·자리·글자 className
// matching 대기 팝업과 notifications 알림 창 레이아웃이 씀
export const MATCHING_BTN_SCALE_WRAP_CLASS =
  "relative block w-full transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]"

export const MATCHING_BTN_IMG_SCALE_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]"

export const MATCHING_BTN_FOCUS_CLASS =
  "outline-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5f0e6]"

export const MATCHING_ROOM_CODE_BTN_WRAP_CLASS =
  `group absolute right-[clamp(0%,0.2vw,0.75%)] top-[clamp(0.1rem,0.65vh,0.45rem)] z-[4] block w-[clamp(7.25rem,10.5vw,8.75rem)] cursor-pointer border-0 bg-transparent p-0 leading-none ${MATCHING_BTN_FOCUS_CLASS}`

export const MATCHING_START_GAME_BTN_AREA_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex flex-col items-center justify-end pb-[clamp(4.5rem,10.5%,4.5rem)]"

export const MATCHING_ACTION_BTN_ROW_CLASS =
  "pointer-events-auto mx-auto flex w-full max-w-[min(92%,36rem)] flex-wrap items-center justify-center gap-x-[clamp(0.55rem,1.15vw,0.85rem)] gap-y-[clamp(0.4rem,1vh,0.6rem)]"

export const MATCHING_ACTION_BTN_CLASS =
  `group w-[clamp(8.5rem,18vw,11.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none ${MATCHING_BTN_FOCUS_CLASS}`

export const MATCHING_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(0.88rem,1.25vw,1.05rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const MATCHING_ROOM_CODE_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.1vw,0.95rem)] font-bold tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const MATCHING_HOST_ACTION_COL_CLASS =
  "absolute top-[2.5%] left-[2.5%] z-30 flex flex-row flex-nowrap items-center gap-x-[clamp(0.3rem,0.55vw,0.45rem)] sm:top-[3%] sm:left-[3%]"

export const MATCHING_HOST_ACTION_BTN_CLASS =
  `group w-[clamp(6.5rem,10.5vw,7.75rem)] shrink-0 flex-none cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-50 ${MATCHING_BTN_FOCUS_CLASS}`

export const MATCHING_HOST_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center whitespace-nowrap px-[4%] font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.88rem)] font-bold leading-none tracking-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const MATCHING_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[5.85%] z-[2] w-[72%] -translate-x-1/2 text-center font-display app-text-scaled [--app-text-size:clamp(2rem,3.15vw,2.75rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]"

export const MATCHING_PROMPT_CLASS =
  "text-center font-subheading app-text-scaled [--app-text-size:clamp(1.38rem,1.92vw,1.58rem)] font-bold leading-snug text-[#1a1008]"

export const MATCHING_SLOTS_GRID_CLASS =
  "mt-[clamp(3.75rem,7.8vh,5.75rem)] flex min-h-[clamp(6.65rem,13.5vh,9.35rem)] shrink-0 flex-col items-center justify-center gap-[clamp(0.42rem,0.88vh,0.68rem)]"

export const MATCHING_SLOTS_ROW_CLASS =
  "flex items-end justify-center gap-[clamp(0.42rem,1vw,0.82rem)]"

export const MATCHING_SLOT_CLASS_LARGE =
  "block h-auto w-[clamp(5.35rem,9.4vw,7.35rem)] max-w-full shrink-0 select-none object-contain"

export const MATCHING_SLOT_CLASS_COMPACT =
  "block h-auto w-[clamp(4.25rem,7.2vw,5.75rem)] max-w-full shrink-0 select-none object-contain"

export const MATCHING_SLOT_NOT_READY_OFFSET_CLASS =
  "-translate-y-[clamp(0.42rem,2.1vh,0.75rem)]"

export const MATCHING_SLOT_WRAP_CLASS =
  "flex flex-col items-center"

export const MATCHING_WAITING_MESSAGE_CLASS =
  "mt-[clamp(0.58rem,1.2vh,0.92rem)] shrink-0 text-center font-subheading app-text-scaled [--app-text-size:clamp(1.08rem,1.42vw,1.22rem)] font-bold text-[#1a1008]"

export const MATCHING_PARTY_HEADER_CLASS =
  "absolute top-[2.5%] right-[2.5%] z-20 flex items-center gap-[clamp(0.5rem,0.95vw,0.72rem)] sm:top-[3%] sm:right-[3%]"

export const MATCHING_PARTY_TEXT_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(1.28rem,1.72vw,1.5rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"

export const MATCHING_PARTY_COUNT_CLASS =
  "font-display app-text-scaled [--app-text-size:clamp(1.55rem,2.1vw,1.82rem)] font-medium leading-none text-text-main tabular-nums antialiased"

export const MATCHING_PARTY_ICON_CLASS =
  "block h-[clamp(1.9rem,2.65vw,2.35rem)] w-auto shrink-0 select-none object-contain opacity-95"

export const MATCHING_MODAL_CLOSE_BTN_CLASS =
  "group absolute right-[clamp(-0.4rem,-1%,-0.15rem)] top-[clamp(0.95rem,4.2%,1.65rem)] z-20 block w-[clamp(3.75rem,7.4vw,5.1rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

// 가운데 팝업 전체 자리·크기
export const MATCHING_PANEL_WRAP_CLASS =
  "absolute left-1/2 top-[48%] z-20 flex w-[min(58rem,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col items-center origin-center scale-[0.92]"
