/**
 * 인게임 투표현황 팝업·열기 버튼 레이아웃.
 *
 * prototype 투표현황창.png — 중앙 모달
 */
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const INGAME_VOTE_PANEL_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1],
}

export const INGAME_VOTE_BACKDROP_CLASS =
  "fixed inset-0 z-[45] cursor-default border-0 bg-black/45 p-0"

export const INGAME_VOTE_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[46] flex items-center justify-center px-[clamp(0.5rem,2vw,1rem)] py-[clamp(0.75rem,3vh,1.5rem)]"

export function getInGameVotePanelStyle() {
  return {
    width: "clamp(28rem, 52vw, 42rem)",
  }
}

export const INGAME_VOTE_PANEL_INNER_CLASS =
  "pointer-events-auto relative w-full [container-type:inline-size]"

export const INGAME_VOTE_FRAME_IMAGE_CLASS =
  "pointer-events-none relative z-[1] block h-auto w-full select-none"

/** 프레임 PNG 내부 콘텐츠 inset — 타이틀 플레이트·본문·하단 버튼 */
export const INGAME_VOTE_PANEL_INSET = {
  paddingTop: "clamp(5.2rem, 16.2cqi, 6.55rem)",
  paddingBottom: "clamp(1.95rem, 6.2cqi, 2.55rem)",
  paddingLeft: "clamp(1.35rem, 5.2cqi, 2rem)",
  paddingRight: "clamp(1.35rem, 5.2cqi, 2rem)",
}

export const INGAME_VOTE_CLOSE_BTN_CLASS =
  "interactive-scale absolute top-[clamp(3rem,3.8cqi,4rem)] right-[clamp(0.5rem,-0.35cqi,2rem)] z-20 border-0 bg-transparent p-0 leading-none"

export const INGAME_VOTE_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(3rem,9.5cqi,3.9rem)] select-none"

/** 타이틀 플레이트 — 프레임 상단 장식 영역 */
export const INGAME_VOTE_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[clamp(2.15rem,6.2cqi,2.65rem)] z-[2] w-[clamp(9rem,36cqi,12rem)] -translate-x-1/2 text-center font-display text-[clamp(1.32rem,4.95cqi,1.72rem)] font-medium leading-none tracking-normal text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const INGAME_VOTE_SUBTITLE_CLASS =
  "mb-[clamp(0.55rem,1.6cqi,0.75rem)] shrink-0 text-center font-subheading text-[clamp(0.62rem,2.1cqi,0.78rem)] font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const INGAME_VOTE_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const INGAME_VOTE_GRID_CLASS =
  `grid h-full min-h-0 grid-cols-2 gap-x-[clamp(0.52rem,2.1cqi,0.82rem)] gap-y-[clamp(0.33rem,1.12cqi,0.52rem)] overflow-y-auto overscroll-contain pr-[clamp(0.35rem,1.2cqi,0.55rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const INGAME_VOTE_ROW_CLASS = "relative min-w-0 list-none"

export const INGAME_VOTE_ROW_INNER_CLASS =
  "flex min-w-0 items-center gap-[clamp(0.27rem,1.12cqi,0.42rem)] rounded-sm border border-[#3a2818]/70 bg-[#120a06]/45 px-[clamp(0.27rem,1.12cqi,0.42rem)] py-[clamp(0.24rem,0.82cqi,0.36rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const INGAME_VOTE_PROFILE_WRAP_CLASS =
  "relative size-[clamp(2.78rem,9.75cqi,3.52rem)] shrink-0 overflow-hidden rounded-[2px] border border-[#5a4030]/70 bg-[#1a1008]/80"

export const INGAME_VOTE_NAME_CLASS =
  "min-w-0 flex-1 truncate font-subheading text-[clamp(0.87rem,3.08cqi,1.08rem)] font-bold leading-tight text-white"

export const INGAME_VOTE_COUNT_WRAP_CLASS =
  "flex shrink-0 items-center gap-[clamp(0.12rem,0.52cqi,0.18rem)] tabular-nums"

export const INGAME_VOTE_COUNT_CLASS =
  "font-subheading text-[clamp(0.87rem,3.08cqi,1.08rem)] font-bold leading-none"

export const INGAME_VOTE_COUNT_ACTIVE_CLASS = "text-[#d62828]"
export const INGAME_VOTE_COUNT_IDLE_CLASS = "text-[#8a8078]"

export const INGAME_VOTE_CROWN_CLASS =
  "font-subheading text-[clamp(0.78rem,2.78cqi,0.99rem)] leading-none text-[#d62828]"

export const INGAME_VOTE_CHECKBOX_CLASS =
  "interactive-scale relative block w-[clamp(1.42rem,4.8cqi,1.72rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const INGAME_VOTE_CHECKBOX_IMG_CLASS =
  "block h-auto w-full select-none"

export const INGAME_VOTE_CHECKMARK_CLASS =
  "pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"

export const INGAME_VOTE_FOOTER_CLASS =
  "mt-[clamp(0.55rem,1.6cqi,0.75rem)] flex shrink-0 justify-center"

export const INGAME_VOTE_SUBMIT_BTN_CLASS =
  "interactive-scale relative block w-[clamp(7.5rem,28cqi,9.5rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const INGAME_VOTE_SUBMIT_BTN_IMG_CLASS =
  "block h-auto w-full select-none"

export const INGAME_VOTE_SUBMIT_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center pb-[2%] pt-[clamp(0.12rem,0.45cqi,0.18rem)] font-subheading text-[clamp(0.72rem,2.55cqi,0.9rem)] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** timebar 우측 하단 — InGameTimebar stack children */
export const INGAME_VOTE_TOGGLE_BTN_WRAP_CLASS = "relative shrink-0 self-end"

export const INGAME_VOTE_TOGGLE_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(5.65rem,36cqi,7.3rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const INGAME_VOTE_TOGGLE_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.96]"

export const INGAME_VOTE_TOGGLE_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] pb-[4%] text-center font-subheading text-[clamp(0.66rem,3.2cqi,0.82rem)] font-bold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"