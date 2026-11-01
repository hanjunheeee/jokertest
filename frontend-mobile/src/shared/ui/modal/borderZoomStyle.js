// 프로필 테두리 확대 창 모양·움직임 (창 틀·그림 칸·이름)
// BorderZoomModal이 씀, 값은 데스크톱 공용 profileBorderZoomLayout.js (화면 폴더라 못 불러 옮겨 적음), 창 폭만 폰 비율(46vw → 88vw)

// 뒤판·창이 같은 속도로 나타나고 사라짐 (데스크톱 ZOOM_TRANSITION)
export const ZOOM_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

export const PANEL_CLASS =
  "pointer-events-auto relative flex max-h-[calc(100svh-2rem)] w-[min(24rem,88vw)] flex-col overflow-hidden rounded-[1.25rem] border border-[#b83232]/40 bg-[#f5f0e6]/78 ring-1 ring-[#c43c3c]/16 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),inset_0_-2px_10px_rgba(42,24,16,0.07),0_14px_40px_rgba(26,15,10,0.34),0_0_28px_rgba(196,60,60,0.12)]"

export const ILLUSTRATION_WRAP_CLASS =
  "relative flex min-h-[min(20rem,46vh)] w-full items-center justify-center bg-[#1a0f0a]/06 px-3 py-4 [box-shadow:inset_0_2px_14px_rgba(26,15,10,0.08)]"

export const ILLUSTRATION_CLASS = "block h-[min(18rem,40vh)] w-[min(18rem,40vh)] select-none object-contain"

export const TITLE_CLASS =
  "font-subheading border-t border-[#2a1810]/12 px-3.5 py-2.5 text-center app-text-scaled [--app-text-size:0.88rem] font-black leading-snug text-[#120a06] antialiased"
