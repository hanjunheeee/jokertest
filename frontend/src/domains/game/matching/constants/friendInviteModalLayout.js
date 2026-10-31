import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export {
  getInGameVotePanelStyle as getFriendInviteModalPanelStyle,
  INGAME_VOTE_CLOSE_BTN_CLASS as FRIEND_INVITE_MODAL_CLOSE_BTN_CLASS,
  INGAME_VOTE_CLOSE_BTN_IMG_CLASS as FRIEND_INVITE_MODAL_CLOSE_BTN_IMG_CLASS,
  INGAME_VOTE_FRAME_IMAGE_CLASS as FRIEND_INVITE_MODAL_FRAME_IMAGE_CLASS,
  INGAME_VOTE_PANEL_INNER_CLASS as FRIEND_INVITE_MODAL_INNER_CLASS,
  INGAME_VOTE_PANEL_INSET as FRIEND_INVITE_MODAL_INSET,
  INGAME_VOTE_TITLE_CLASS as FRIEND_INVITE_MODAL_TITLE_CLASS,
} from "@/domains/game/ingame/constants/vote/ingameVoteLayout.js"

export const FRIEND_INVITE_MODAL_SHELL_CLASS = "fixed inset-0 z-[52]"

export const FRIEND_INVITE_MODAL_BACKDROP_CLASS =
  "absolute inset-0 cursor-default border-0 bg-black/45 p-0"

export const FRIEND_INVITE_MODAL_WRAP_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[clamp(0.5rem,2vw,1rem)] py-[clamp(0.75rem,3vh,1.5rem)]"

export const FRIEND_INVITE_MODAL_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const FRIEND_INVITE_MODAL_SCROLL_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain pr-[clamp(0.35rem,1.2cqi,0.55rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const FRIEND_INVITE_ROW_CLASS =
  "relative w-full list-none border-b border-[#3a2818]/70 py-[clamp(0.38rem,0.9vh,0.52rem)] last:border-b-0"

export const FRIEND_INVITE_ROW_INNER_CLASS =
  "flex min-w-0 items-center gap-[clamp(0.45rem,0.9vw,0.65rem)]"

export const FRIEND_INVITE_PROFILE_WRAP_CLASS =
  "relative size-[clamp(3.2rem,3.6vw,3.8rem)] shrink-0 select-none"

export const FRIEND_INVITE_PROFILE_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-[46%] z-[1] aspect-square w-[67%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

export const FRIEND_INVITE_INFO_CLASS =
  "flex min-w-0 flex-1 flex-col justify-center"

export const FRIEND_INVITE_NAME_ROW_CLASS =
  "flex min-w-0 flex-col gap-[clamp(0.12rem,0.35vh,0.2rem)]"

export const FRIEND_INVITE_NAME_CLASS =
  "min-w-0 truncate font-display text-[clamp(0.92rem,1.18vw,1.08rem)] font-medium leading-tight tracking-normal text-white antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const FRIEND_INVITE_STATS_CLASS =
  "min-w-0 truncate font-subheading text-[clamp(0.78rem,1.02vw,0.92rem)] font-bold leading-none text-white/55 tabular-nums"

export const FRIEND_INVITE_EMPTY_CLASS =
  "mb-[clamp(0.35rem,1cqi,0.5rem)] shrink-0 text-center font-subheading text-[clamp(0.58rem,1.85cqi,0.72rem)] font-bold text-white/70"

export const FRIEND_INVITE_ROW_ACTION_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(5.85rem,22cqi,7.25rem)] shrink-0 -translate-x-[clamp(0.45rem,2cqi,0.85rem)] cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-default disabled:opacity-90"

export const FRIEND_INVITE_ROW_ACTION_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.97] group-disabled:transform-none"

export const FRIEND_INVITE_ROW_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] text-center font-subheading text-[clamp(0.62rem,2.1cqi,0.78rem)] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] group-disabled:text-[#ebe2cc]/75"
