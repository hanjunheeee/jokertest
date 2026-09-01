/**
 * 인게임 좌측 슬라이드 패널 — 전적목록·설정 등 공통 shell·헤더 레이아웃.
 */
export const INGAME_SIDE_PANEL_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

export const INGAME_SIDE_PANEL_CLASS =
  "absolute left-0 top-[2.5%] bottom-[clamp(7.5rem,13vh,10.5rem)] z-30 w-[clamp(17.5rem,22.5vw,25.5rem)] max-w-[26rem] sm:bottom-[clamp(8rem,14vh,11rem)]"

export const INGAME_SIDE_PANEL_INSET = {
  paddingTop: "clamp(4rem, 17%, 5.3rem)",
  paddingBottom: "clamp(2.75rem, 11%, 3.5rem)",
  paddingLeft: "10.5%",
  paddingRight: "10.5%",
}

export const INGAME_SIDE_PANEL_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const INGAME_SIDE_PANEL_BACKDROP_CLASS =
  "absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"

export const INGAME_SIDE_PANEL_CLOSE_BTN_CLASS =
  "interactive-scale absolute top-[clamp(1.35rem,7.5%,1.85rem)] right-[clamp(0.35rem,2.4%,0.72rem)] z-40 border-0 bg-transparent p-0 leading-none"

export const INGAME_SIDE_PANEL_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.6rem,3.95vw,3.2rem)] select-none"

export const INGAME_SIDE_PANEL_HEADER_WRAP_CLASS =
  "relative mb-[clamp(0.45rem,1.2vh,0.65rem)] w-full shrink-0"

export const INGAME_SIDE_PANEL_HEADER_PLATE_CLASS =
  "block h-auto w-full select-none"

export const INGAME_SIDE_PANEL_HEADER_TITLE_CLASS =
  "pointer-events-none absolute inset-0 flex items-start justify-center px-[12%] pt-[3.8%] font-display text-[clamp(1.18rem,1.72vw,1.45rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const INGAME_SIDE_PANEL_HEADER_SUBTITLE_CLASS =
  "mt-[clamp(0.42rem,1vh,0.58rem)] text-center font-subheading text-[clamp(0.62rem,0.9vw,0.76rem)] leading-snug font-bold text-[#1a1008]"
