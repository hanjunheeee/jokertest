import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const FRIEND_PANEL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

export const FRIEND_PANEL_BACKDROP_CLASS = "absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"

export const FRIEND_PANEL_CLASS =
  "absolute right-0 top-[2.5%] bottom-[clamp(7.5rem,13vh,10.5rem)] z-30 w-[clamp(17.5rem,22.5vw,25.5rem)] max-w-[26rem] sm:bottom-[clamp(8rem,14vh,11rem)]"

export const FRIEND_PANEL_FRAME_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const FRIEND_PANEL_CONTENT_CLASS = "relative flex h-full min-h-0 flex-col"

export const FRIEND_PANEL_INSET_STYLE = {
  paddingTop: "clamp(4rem, 17%, 5.3rem)",
  paddingBottom: "clamp(2.75rem, 11%, 3.5rem)",
  paddingLeft: "10.5%",
  paddingRight: "10.5%",
}

export const FRIEND_SEARCH_ZONE_CLASS =
  "mb-4 shrink-0 rounded-md border border-white/20 bg-black/40 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_10px_rgba(0,0,0,0.35)]"

export const FRIEND_SEARCH_LABEL_CLASS =
  "mb-1.5 font-subheading app-text-scaled [--app-text-size:14px] font-bold tracking-wide text-[#ebe2cc]"

export const FRIEND_SEARCH_INPUT_FRAME_CLASS = "block h-auto w-full select-none"

export const FRIEND_SEARCH_INPUT_CLASS =
  "absolute inset-0 bg-transparent pl-[17%] pr-[6%] font-subheading app-text-scaled [--app-text-size:12px] leading-none text-white/85 outline-none placeholder:text-white/65"

export const FRIEND_VIEW_TAB_LIST_CLASS =
  "mb-3 flex shrink-0 items-stretch gap-[clamp(0.25rem,0.55vw,0.4rem)]"

export const FRIEND_VIEW_TAB_BUTTON_CLASS =
  "interactive-scale relative flex-1 overflow-hidden border-0 bg-transparent p-0 leading-none"

export const FRIEND_VIEW_TAB_IMAGE_CLASS =
  "block h-[clamp(1.48rem,2.15vw,1.78rem)] w-full select-none object-fill object-center"

export const FRIEND_VIEW_TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.68rem,0.95vw,0.82rem)] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const FRIEND_FOLDER_SECTION_CLASS =
  "relative shrink-0 overflow-hidden rounded-md border border-white/25 px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.45)] backdrop-blur-sm"

export const FRIEND_FOLDER_BACKDROP_CLASS = "pointer-events-none absolute inset-0 bg-black/65"

export const FRIEND_FOLDER_CONTENT_CLASS = "relative z-10"

export const FRIEND_FOLDER_HEADER_CLASS =
  "mt-0 flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 [&_img]:opacity-100 [&_span]:font-bold [&_span]:text-white"

export const FRIEND_FOLDER_ICON_CLASS = "h-4 w-4 shrink-0 select-none"

export const FRIEND_FOLDER_LABEL_CLASS = "font-subheading app-text-scaled [--app-text-size:13px] text-white/90"

export const FRIEND_FOLDER_CHEVRON_CLASS = "ml-auto h-3 w-3 shrink-0 select-none opacity-90"

export const FRIEND_FOLDER_LIST_CLASS = "mt-1.5 overflow-visible pr-0.5"

export const FRIEND_ROW_ITEM_CLASS = "relative mt-2 w-full list-none"

export const FRIEND_ROW_FRAME_CLASS = "block h-auto w-full select-none"

export const FRIEND_ROW_CONTENT_CLASS = "absolute inset-0 flex items-center gap-1.5 px-[6%] py-[6%]"

export const FRIEND_ROW_FAVORITE_BUTTON_CLASS =
  "relative z-[2] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const FRIEND_ROW_FAVORITE_STAR_CLASS =
  "block size-[clamp(1.05rem,1.45vw,1.25rem)] select-none text-[#a89262]/45"

export const FRIEND_ROW_FAVORITE_STAR_ACTIVE_CLASS =
  "block size-[clamp(1.05rem,1.45vw,1.25rem)] select-none text-[#e8c56a]"

export const FRIEND_ROW_PROFILE_PORTRAIT_WRAP_CLASS =
  "relative z-[2] size-[3.6rem] shrink-0 select-none"

export const FRIEND_LIST_PROFILE_PORTRAIT_WRAP_CLASS =
  "relative z-[2] size-[3.6rem] shrink-0 select-none"

export const FRIEND_ROW_INFO_CLASS = "min-w-0 flex-1"

export const FRIEND_ROW_NAME_CLASS =
  "truncate font-subheading app-text-scaled [--app-text-size:clamp(0.8rem,1.05vw,0.95rem)] leading-tight text-white"

export const FRIEND_ROW_STATUS_WRAP_CLASS = "mt-1 flex items-center gap-1.5"

export const FRIEND_ROW_STATUS_BADGE_CLASS = "relative inline-flex h-[1.15rem] w-[1.15rem] shrink-0"

export const FRIEND_ROW_OFFLINE_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-full bg-black/80"

export const FRIEND_ROW_STATUS_TEXT_CLASS = "app-text-scaled [--app-text-size:10px] leading-none"

export const FRIEND_LIST_TAB_CLASS = "flex h-full min-h-0 flex-col"

export const FRIEND_LIST_FILTER_RESULT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const FRIEND_LIST_STATUS_MESSAGE_CLASS = "app-text-scaled [--app-text-size:16px]"

export const FRIEND_LIST_STATUS_DETAIL_CLASS = "app-text-scaled [--app-text-size:14px]"

export const FRIEND_LIST_STATUS_DETAIL_MUTED_CLASS =
  `${FRIEND_LIST_STATUS_DETAIL_CLASS} text-white/45`

export const FRIEND_LIST_STATUS_DETAIL_ERROR_CLASS =
  `${FRIEND_LIST_STATUS_DETAIL_CLASS} text-red-300/90`

export const FRIEND_LIST_FILTER_EMPTY_CLASS =
  `mt-6 text-center ${FRIEND_LIST_STATUS_MESSAGE_CLASS} text-white/50`

export const FRIEND_TAB_SCROLLABLE_LIST_CLASS =
  `mt-1 max-h-[12rem] overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const FRIEND_TAB_GROUP_GAP_CLASS = "mt-3.5"

export const FRIEND_REQUEST_TAB_CLASS = "relative flex min-h-0 flex-1 flex-col"

export const FRIEND_REQUEST_RESULT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[clamp(2.6rem,4.2vw,3.1rem)] pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const FRIEND_REQUEST_EMPTY_CLASS =
  `mt-10 text-center ${FRIEND_LIST_STATUS_MESSAGE_CLASS} text-white/50`

export const FRIEND_REQUEST_BACK_BUTTON_CLASS = "absolute bottom-0 left-0 z-10"

export const FRIEND_ACCEPT_TAB_CLASS = "flex h-full min-h-0 flex-col"

export const FRIEND_ACCEPT_TOOLBAR_CLASS =
  "relative mt-3 flex w-full shrink-0 items-center justify-end gap-[clamp(0.3rem,0.55vw,0.45rem)] pr-[clamp(0.65rem,3.5%,1rem)]"

export const FRIEND_ACCEPT_ALL_BUTTON_CLASS =
  "relative w-[clamp(4.75rem,38%,6.1rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const FRIEND_ACCEPT_ALL_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,0.9vw,0.76rem)] font-bold tracking-wide text-[#e8f0dc] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

export const FRIEND_ACCEPT_REFRESH_BUTTON_CLASS =
  "group w-[clamp(1.45rem,2.1vw,1.7rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

export const FRIEND_ACCEPT_BUTTON_IMAGE_CLASS = "block h-auto w-full select-none"

export const FRIEND_ACCEPT_REFRESH_BUTTON_IMAGE_CLASS =
  `interactive-scale-sm ${FRIEND_ACCEPT_BUTTON_IMAGE_CLASS}`

export const FRIEND_ACCEPT_LIST_CLASS =
  `mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const FRIEND_ACCEPT_EMPTY_CLASS =
  `mt-10 text-center ${FRIEND_LIST_STATUS_MESSAGE_CLASS} text-white/50`

export const FRIEND_LIST_STATUS_ERROR_CLASS =
  `${FRIEND_LIST_STATUS_MESSAGE_CLASS} text-red-300/90`

export const FRIEND_ACCEPT_BACK_BUTTON_CLASS = "mt-2"

export const INCOMING_FRIEND_ACTIONS_CLASS =
  "flex shrink-0 items-center gap-[clamp(0.2rem,0.45vw,0.35rem)]"

export const INCOMING_FRIEND_ACTION_BUTTON_CLASS =
  "block w-[clamp(1.85rem,2.8vw,2.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const RECOMMENDED_FRIEND_ROW_CLASS = "relative mt-2 w-full list-none"

export const RECOMMENDED_FRIEND_ROW_FRAME_CLASS = "block h-auto w-full select-none"

export const RECOMMENDED_FRIEND_ROW_CONTENT_CLASS =
  "absolute inset-0 flex items-center justify-between gap-1 px-[6%] py-[6%]"

export const RECOMMENDED_FRIEND_INFO_WRAP_CLASS =
  "flex min-w-0 max-w-[58%] items-center gap-2"

export const RECOMMENDED_FRIEND_TEXT_WRAP_CLASS = "min-w-0"

export const RECOMMENDED_FRIEND_NAME_CLASS =
  "truncate font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1vw,0.92rem)] leading-tight text-white"

export const RECOMMENDED_FRIEND_STATUS_WRAP_CLASS = "mt-0.5 flex items-center gap-1.5"

export const RECOMMENDED_FRIEND_STATUS_BADGE_CLASS = "relative inline-flex h-[1.05rem] w-[1.05rem] shrink-0"

export const RECOMMENDED_FRIEND_OFFLINE_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 rounded-full bg-black/80"

export const RECOMMENDED_FRIEND_STATUS_TEXT_CLASS = "app-text-scaled [--app-text-size:9px] leading-none"

export const RECOMMENDED_FRIEND_ACTIONS_CLASS =
  "relative z-[2] flex shrink-0 items-center gap-[clamp(0.25rem,0.55vw,0.45rem)]"

export const RECOMMENDED_FRIEND_ACTION_BUTTON_CLASS =
  "block w-[clamp(2.25rem,3.45vw,2.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const RECOMMENDED_FRIEND_SENT_BUTTON_CLASS = "opacity-40 cursor-default"

export const RECOMMENDED_FRIEND_ACTION_IMAGE_CLASS = "block h-auto w-full select-none"
