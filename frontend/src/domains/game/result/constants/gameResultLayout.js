/**
 * 게임 결과 화면 레이아웃 — prototype 게임 결과창 시안-승리/패배.png
 */
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const GAME_RESULT_PAGE_CLASS = "relative h-svh w-full overflow-hidden bg-black"

export const GAME_RESULT_BG_CLASS =
  "absolute inset-0 h-full w-full object-cover object-center"

export const GAME_RESULT_SHELL_CLASS =
  "absolute inset-0 z-10 flex flex-col items-center pt-[clamp(0.85rem,2.2vh,1.75rem)]"

/** 프레임 PNG — 배경 분리 (인게임: 그림자 레이어 + 선명 레이어) */
export const GAME_RESULT_FRAME_SHADOW_FILTER_CLASS =
  "[filter:drop-shadow(0_8px_18px_rgba(0,0,0,0.82))_drop-shadow(0_24px_56px_rgba(0,0,0,0.72))]"

export const GAME_RESULT_FRAME_STACK_WRAP_CLASS =
  "relative w-full overflow-visible"

export const GAME_RESULT_FRAME_SHADOW_LAYER_FILL_CLASS =
  `pointer-events-none absolute inset-0 z-0 block h-full w-full select-none object-fill ${GAME_RESULT_FRAME_SHADOW_FILTER_CLASS}`

export const GAME_RESULT_FRAME_SHADOW_LAYER_BLOCK_CLASS =
  `pointer-events-none absolute inset-0 z-0 block h-auto w-full select-none ${GAME_RESULT_FRAME_SHADOW_FILTER_CLASS}`

export const GAME_RESULT_FRAME_IMAGE_FILL_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"

export const GAME_RESULT_FRAME_IMAGE_BLOCK_CLASS =
  "relative z-[2] block h-auto w-full select-none"

export const GAME_RESULT_PORTRAIT_FRAME_STACK_CLASS =
  "relative z-[1] w-full overflow-visible"

/** 상단 승리/패배 배너 */
export const GAME_RESULT_BANNER_WRAP_CLASS =
  "relative w-[clamp(16rem,34vw,28rem)] shrink-0 overflow-visible [container-type:inline-size]"

export const GAME_RESULT_BANNER_LABEL_CLASS =
  "pointer-events-none absolute inset-0 z-[3] flex items-center justify-center px-[14%] pt-[2%] pb-[1%] font-display text-[clamp(2.5rem,10.5cqi,4.25rem)] font-medium leading-none tracking-normal antialiased [text-shadow:0_2px_6px_rgba(0,0,0,0.75)]"

export const GAME_RESULT_BANNER_LABEL_WIN_CLASS = "text-[#f0d8a8]"
export const GAME_RESULT_BANNER_LABEL_LOSE_CLASS = "text-[#d8d0c4]"

/** 본문 — 플레이어 목록 + MVP (배경 중앙 패널 안에 수렴) */
export const GAME_RESULT_BODY_CLASS =
  "mx-auto flex min-h-0 w-full max-w-[min(88vw,70rem)] flex-1 items-start justify-center gap-[clamp(3rem,9vw,6rem)] px-[clamp(0.75rem,2.5vw,2rem)] pb-[clamp(1.25rem,3.5vh,2.25rem)] pt-[clamp(1.5rem,3.5vh,2.35rem)]"

/** 좌측 플레이어 목록 패널 */
export const GAME_RESULT_PLAYER_LIST_WRAP_CLASS =
  "relative h-[clamp(26rem,72vh,40rem)] w-[clamp(13.5rem,26vw,23rem)] max-w-[24rem] shrink-0 overflow-visible [container-type:inline-size]"

export const GAME_RESULT_PLAYER_LIST_INSET_CLASS =
  "absolute inset-0 z-[2] flex min-h-0 flex-col px-[9%] pb-[8%] pt-[7.5%]"

export const GAME_RESULT_PLAYER_LIST_TITLE_CLASS =
  "-mt-[0.35rem] mb-[clamp(0.65rem,1.8vh,1rem)] flex min-h-[clamp(2.75rem,10cqi,3.5rem)] shrink-0 items-center justify-center text-center font-display text-[clamp(1.5rem,3.5cqi,1.8rem)] font-medium leading-none tracking-normal text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const GAME_RESULT_PLAYER_LIST_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const GAME_RESULT_PLAYER_LIST_SCROLL_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain pr-[clamp(1.1rem,4cqi,1.5rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

/** 플레이어 행 — 전적목록 행 패턴 기반 */
export const GAME_RESULT_PLAYER_ROW_CLASS =
  "relative mt-[clamp(0.22rem,0.65vh,0.35rem)] w-full list-none first:mt-0"

export const GAME_RESULT_PLAYER_ROW_INNER_CLASS =
  "flex items-center gap-[clamp(0.25rem,1.2cqi,0.45rem)] rounded-sm border border-[#3a2818]/75 bg-[#120a06]/50 px-[clamp(0.3rem,1.4cqi,0.45rem)] py-[clamp(0.22rem,0.65vh,0.32rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const GAME_RESULT_PLAYER_PROFILE_WRAP_CLASS =
  "relative size-[clamp(4.5rem,17.25cqi,5.65rem)] shrink-0"

export const GAME_RESULT_PLAYER_PROFILE_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"

export const GAME_RESULT_PLAYER_NAME_CLASS =
  "min-w-0 flex-1 truncate font-subheading text-[clamp(0.95rem,3.6cqi,1.18rem)] font-bold leading-tight text-white"

export const GAME_RESULT_PLAYER_JOB_CLASS =
  "shrink-0 font-subheading text-[clamp(0.86rem,3.2cqi,1.06rem)] font-bold leading-none text-[#c8a878] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 우측 MVP */
export const GAME_RESULT_MVP_PANEL_CLASS =
  "mt-[clamp(2.25rem,5.5vh,3.25rem)] flex h-[clamp(26rem,72vh,40rem)] w-[clamp(14rem,28vw,22rem)] max-w-[24rem] shrink-0 flex-col items-center justify-start [container-type:inline-size]"

export const GAME_RESULT_MVP_NAMEPLATE_WRAP_CLASS =
  "relative mb-[clamp(1rem,2.8vh,1.5rem)] w-[clamp(15rem,100cqi,20rem)] shrink-0 overflow-visible"

export const GAME_RESULT_MVP_NAMEPLATE_LABEL_CLASS =
  "pointer-events-none absolute inset-0 z-[3] flex items-center justify-center px-[10%] pt-[3%] font-display text-[clamp(1.5rem,3.5cqi,1.8rem)] font-medium leading-none tracking-normal text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const GAME_RESULT_MVP_PORTRAIT_WRAP_CLASS =
  "relative w-[clamp(14rem,94cqi,19rem)] shrink-0 overflow-visible [container-type:inline-size]"

/** MVP 플레이어 프레임 하단 닉네임칸 — 인게임 카드 nameplate 기준, 약간 위로 */
export const GAME_RESULT_MVP_PLAYER_NAME_INSET = {
  bottom: "3.1%",
  left: "11%",
  right: "11%",
  height: "15%",
}

export const GAME_RESULT_MVP_PLAYER_NAME_CLASS =
  "pointer-events-none absolute z-[11] flex items-center justify-center overflow-hidden px-[6%] text-center font-display text-[clamp(1.15rem,8.8cqi,1.7rem)] font-medium leading-none tracking-normal text-black antialiased"
