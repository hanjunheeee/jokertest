import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export {
  getVotePanelStyle as getInGameKickPlayerPanelStyle,
  VOTE_CLOSE_BTN_CLASS as INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS,
  VOTE_CLOSE_BTN_IMG_CLASS as INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_IMG_CLASS,
  VOTE_FRAME_IMG_CLASS as INGAME_KICK_PLAYER_MODAL_FRAME_IMAGE_CLASS,
  VOTE_PANEL_INNER_CLASS as INGAME_KICK_PLAYER_MODAL_INNER_CLASS,
  INGAME_VOTE_PANEL_INSET as INGAME_KICK_PLAYER_MODAL_INSET,
  INGAME_VOTE_TITLE_CLASS as INGAME_KICK_PLAYER_MODAL_TITLE_CLASS,
} from "../../vote/ingameVoteLayout.js"

export const MODAL_SHELL_CLASS = "fixed inset-0 z-[52]"

export const MODAL_BACKDROP_CLASS =
  "absolute inset-0 cursor-default border-0 bg-black/45 p-0"

export const MODAL_WRAP_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[clamp(0.5rem,2vw,1rem)] py-[clamp(0.75rem,3vh,1.5rem)]"

export const MODAL_SUBTITLE_CLASS =
  "mb-[clamp(0.28rem,0.8cqi,0.4rem)] shrink-0 text-center font-subheading text-[clamp(0.62rem,2.1cqi,0.78rem)] font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const MODAL_NOTICE_CLASS =
  "mb-[clamp(0.55rem,1.6cqi,0.75rem)] shrink-0 text-center font-subheading text-[clamp(0.58rem,1.85cqi,0.72rem)] font-bold leading-snug text-white/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const MODAL_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const MODAL_SCROLL_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain pr-[clamp(0.35rem,1.2cqi,0.55rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const ROW_CLASS = "relative min-w-0 list-none"

export const ROW_INNER_CLASS =
  "flex min-w-0 items-center gap-[clamp(0.27rem,1.12cqi,0.42rem)] rounded-sm border border-[#3a2818]/70 bg-[#120a06]/45 px-[clamp(0.27rem,1.12cqi,0.42rem)] py-[clamp(0.24rem,0.82cqi,0.36rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const PROFILE_WRAP_CLASS =
  "relative size-[clamp(2.78rem,9.75cqi,3.52rem)] shrink-0 select-none"

export const PROFILE_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-[46%] z-[1] aspect-square w-[67%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

export const NAME_CLASS =
  "min-w-0 flex-1 truncate font-subheading text-[clamp(0.87rem,3.08cqi,1.08rem)] font-bold leading-tight text-white"

export const ACTION_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(4.85rem,18.5cqi,6.15rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-default disabled:opacity-90"

export const ACTION_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.03] group-active:scale-[0.97] group-disabled:transform-none"

export const ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] text-center font-subheading text-[clamp(0.58rem,1.95cqi,0.72rem)] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)] group-disabled:text-[#ebe2cc]/75"
