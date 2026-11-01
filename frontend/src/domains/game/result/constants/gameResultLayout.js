// 결과 화면 모양 상수 (틀·띠·목록·줄·MVP·버튼 자리)
// 결과 컴포넌트·GameResultIntroVideo·GameResultPage가 씀
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 화면·배경·본체
export const GAME_RESULT_PAGE_CLASS = "relative h-svh w-full overflow-hidden bg-black"

export const GAME_RESULT_BG_CLASS =
  "absolute inset-0 h-full w-full object-cover object-center"

export const GAME_RESULT_SHELL_CLASS =
  "absolute inset-0 z-10 flex flex-col items-center pt-[clamp(0.85rem,2.2vh,1.75rem)]"

// 틀 그림 그림자·쌓기 (그림자 장은 아래, 진짜 장은 위)
export const FRAME_SHADOW_FILTER_CLASS =
  "[filter:drop-shadow(0_8px_18px_rgba(0,0,0,0.82))_drop-shadow(0_24px_56px_rgba(0,0,0,0.72))]"

export const FRAME_STACK_WRAP_CLASS =
  "relative w-full overflow-visible"

export const FRAME_SHADOW_LAYER_FILL_CLASS =
  `pointer-events-none absolute inset-0 z-0 block h-full w-full select-none object-fill ${FRAME_SHADOW_FILTER_CLASS}`

export const FRAME_SHADOW_LAYER_BLOCK_CLASS =
  `pointer-events-none absolute inset-0 z-0 block h-auto w-full select-none ${FRAME_SHADOW_FILTER_CLASS}`

export const FRAME_IMG_FILL_CLASS =
  "pointer-events-none absolute inset-0 z-[1] block h-full w-full select-none object-fill"

export const FRAME_IMG_BLOCK_CLASS =
  "relative z-[2] block h-auto w-full select-none"

export const PORTRAIT_FRAME_STACK_CLASS =
  "relative z-[1] w-full overflow-visible"

// 승패 띠
export const BANNER_WRAP_CLASS =
  "relative w-[clamp(16rem,34vw,28rem)] shrink-0 overflow-visible [container-type:inline-size]"

export const BANNER_LABEL_CLASS =
  "pointer-events-none absolute inset-0 z-[3] flex items-center justify-center px-[14%] pt-[2%] pb-[1%] font-display app-text-scaled [--app-text-size:clamp(2.5rem,10.5cqi,4.25rem)] font-medium leading-none tracking-normal antialiased [text-shadow:0_2px_6px_rgba(0,0,0,0.75)]"

export const BANNER_LABEL_WIN_CLASS = "text-[#f0d8a8]"
export const BANNER_LABEL_LOSE_CLASS = "text-[#d8d0c4]"

// 본체 안쪽 (목록 + MVP)
export const GAME_RESULT_BODY_CLASS =
  "mx-auto flex min-h-0 w-full max-w-[min(88vw,70rem)] flex-1 items-start justify-center gap-[clamp(3rem,9vw,6rem)] px-[clamp(0.75rem,2.5vw,2rem)] pb-[clamp(1.25rem,3.5vh,2.25rem)] pt-[clamp(0.5rem,1.1vh,0.85rem)]"

// 참가자 목록 틀·제목
export const PLAYER_LIST_WRAP_CLASS =
  "relative h-[clamp(26rem,72vh,40rem)] w-[clamp(13.5rem,26vw,23rem)] max-w-[24rem] shrink-0 overflow-visible [container-type:inline-size]"

export const PLAYER_LIST_INSET_CLASS =
  "absolute inset-0 z-[2] flex min-h-0 flex-col px-[9%] pb-[8%] pt-[7.5%]"

export const PLAYER_LIST_TITLE_CLASS =
  "-mt-[0.35rem] mb-[clamp(0.35rem,1vh,0.55rem)] flex min-h-[clamp(2.75rem,10cqi,3.5rem)] shrink-0 items-center justify-center text-center font-display app-text-scaled [--app-text-size:clamp(1.5rem,3.5cqi,1.8rem)] font-medium leading-none tracking-normal text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 이긴 진영 배지
export const WINNING_TEAM_BADGE_WRAP_CLASS =
  "mb-[clamp(0.55rem,1.4vh,0.85rem)] flex shrink-0 justify-center"

export const WINNING_TEAM_BADGE_CLASS =
  "inline-flex items-center justify-center rounded-full border px-[clamp(0.7rem,3.2cqi,1rem)] py-[clamp(0.22rem,0.75vh,0.38rem)] font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,2.9cqi,0.9rem)] font-bold leading-none tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const WINNING_TEAM_BADGE_CITIZEN_CLASS =
  "border-[#8fa8c8]/85 bg-[#152033]/85 text-[#d4e6ff]"

export const WINNING_TEAM_BADGE_JOKER_CLASS =
  "border-[#c87878]/85 bg-[#2a1212]/85 text-[#f0c8c8]"

// 목록 스크롤
export const PLAYER_LIST_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const PLAYER_LIST_SCROLL_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain pr-[clamp(1.1rem,4cqi,1.5rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const PLAYER_LIST_SCROLLBAR_CLASS =
  "z-[3] !h-auto !translate-x-[clamp(0.12rem,0.38vw,0.28rem)] -translate-y-[clamp(0.58rem,1.45vh,0.88rem)] !top-0 !bottom-[clamp(0.85rem,2.2vh,1.25rem)]"

// 참가자 줄 (SELF는 내 줄 강조)
export const PLAYER_ROW_CLASS =
  "relative mt-[clamp(0.22rem,0.65vh,0.35rem)] w-full list-none first:mt-0"

export const PLAYER_ROW_INNER_CLASS =
  "flex items-center gap-[clamp(0.25rem,1.2cqi,0.45rem)] rounded-sm border border-[#3a2818]/75 bg-[#120a06]/50 px-[clamp(0.3rem,1.4cqi,0.45rem)] py-[clamp(0.22rem,0.65vh,0.32rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const PLAYER_ROW_INNER_SELF_CLASS =
  "border-white/55 bg-white/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"

export const PLAYER_PROFILE_WRAP_CLASS =
  "relative size-[clamp(4.5rem,17.25cqi,5.65rem)] shrink-0 select-none"

export const PLAYER_PROFILE_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-[46%] z-[1] aspect-square w-[67%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

export const PLAYER_NAME_CLASS =
  "min-w-0 flex-1 truncate font-subheading app-text-scaled [--app-text-size:clamp(0.95rem,3.6cqi,1.18rem)] font-bold leading-tight text-white"

export const PLAYER_NAME_SELF_CLASS = "text-black [text-shadow:none]"

export const PLAYER_JOB_CLASS =
  "shrink-0 font-subheading app-text-scaled [--app-text-size:clamp(0.86rem,3.2cqi,1.06rem)] font-bold leading-none text-[#c8a878] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const PLAYER_JOB_SELF_CLASS = "text-black [text-shadow:none]"

export const PLAYER_INFO_CLASS =
  "flex min-w-0 flex-1 items-center gap-[clamp(0.28rem,1cqi,0.42rem)]"

export const PLAYER_SELF_BADGE_CLASS =
  "shrink-0 rounded-full border border-black/35 bg-black/10 px-[clamp(0.38rem,1.6cqi,0.55rem)] py-[clamp(0.1rem,0.28vh,0.16rem)] font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,2.2cqi,0.78rem)] font-bold leading-none text-black"

// MVP 칸
export const MVP_PANEL_CLASS =
  "mt-[clamp(2.25rem,5.5vh,3.25rem)] flex h-[clamp(26rem,72vh,40rem)] w-[clamp(14rem,28vw,22rem)] max-w-[24rem] shrink-0 flex-col items-center justify-start [container-type:inline-size]"

export const MVP_NAMEPLATE_WRAP_CLASS =
  "relative mb-[clamp(1rem,2.8vh,1.5rem)] w-[clamp(15rem,100cqi,20rem)] shrink-0 overflow-visible"

export const MVP_NAMEPLATE_LABEL_CLASS =
  "pointer-events-none absolute inset-0 z-[3] flex items-center justify-center px-[10%] pt-[3%] font-display app-text-scaled [--app-text-size:clamp(1.5rem,3.5cqi,1.8rem)] font-medium leading-none tracking-normal text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const MVP_PORTRAIT_WRAP_CLASS =
  "relative w-[clamp(14rem,94cqi,19rem)] shrink-0 overflow-visible [container-type:inline-size]"

export const MVP_PLAYER_NAME_INSET = {
  bottom: "3.1%",
  left: "11%",
  right: "11%",
  height: "15%",
}

export const MVP_PLAYER_NAME_CLASS =
  "pointer-events-none absolute z-[11] flex items-center justify-center overflow-hidden px-[6%] text-center font-display app-text-scaled [--app-text-size:clamp(1.15rem,8.8cqi,1.7rem)] font-medium leading-none tracking-normal text-black antialiased"

// 대기방·로비 버튼 자리
export const LOBBY_BTN_WRAP_CLASS =
  "absolute bottom-[clamp(1rem,3.2vh,2.25rem)] right-[clamp(1.25rem,4vw,3rem)] z-20 flex items-center justify-end gap-[clamp(0.45rem,1.2vw,0.75rem)]"
