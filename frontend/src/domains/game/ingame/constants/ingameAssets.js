// 판 배경 그림 (낮·밤)
// 판 배경(InGameBackground)이 사용

// 화면 맨 아래 검정(bg-black) 위에 전경보드를 얹을 때 그림 불투명도 (낮을수록 더 비침)
export const INGAME_BG_OVERLAY_OPACITY = 0.55

export const INGAME_BG_ROOT_CLASS = "absolute inset-0 bg-black"
export const INGAME_BG_BOTTOM_SHADE_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black via-black/45 to-transparent"

export const INGAME_ASSETS = {
  bg: "/bg/인게임-전경보드(뒷배경).webp",
  bgNight: "/bg/인게임-전경보드(뒷배경) 밤.webp",
}
