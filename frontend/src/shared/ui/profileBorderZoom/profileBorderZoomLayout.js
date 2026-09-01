export const PROFILE_BORDER_ZOOM_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

export const PROFILE_BORDER_ZOOM_CLOSE_BUTTON_SRC =
  "/button/팝업 닫기 버튼.png".normalize("NFD")

export const PROFILE_BORDER_ZOOM_BACKDROP_CLASS =
  "fixed inset-0 z-40 cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

export const PROFILE_BORDER_ZOOM_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-[clamp(1rem,3vw,2rem)]"

export const PROFILE_BORDER_ZOOM_PANEL_CLASS =
  "pointer-events-auto relative flex w-[min(24rem,46vw)] max-w-[28rem] flex-col overflow-hidden rounded-[1.25rem] border border-[#b83232]/40 bg-[#f5f0e6]/78 ring-1 ring-[#c43c3c]/16 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),inset_0_-2px_10px_rgba(42,24,16,0.07),0_14px_40px_rgba(26,15,10,0.34),0_0_28px_rgba(196,60,60,0.12)]"

export const PROFILE_BORDER_ZOOM_ILLUSTRATION_WRAP_CLASS =
  "relative flex min-h-[min(20rem,46vh)] w-full items-center justify-center bg-[#1a0f0a]/06 px-[clamp(0.75rem,1.4vw,1.1rem)] py-[clamp(1rem,2vh,1.35rem)] [box-shadow:inset_0_2px_14px_rgba(26,15,10,0.08)]"

export const PROFILE_BORDER_ZOOM_ILLUSTRATION_CLASS =
  "block h-[min(18rem,40vh)] w-[min(18rem,40vh)] select-none object-contain"

export const PROFILE_BORDER_ZOOM_TITLE_CLASS =
  "font-subheading border-t border-[#2a1810]/12 px-[clamp(0.85rem,1.6vw,1.1rem)] py-[clamp(0.55rem,1vh,0.75rem)] text-center text-[clamp(0.82rem,1.05vw,0.94rem)] font-black leading-snug text-[#120a06] antialiased"

export const PROFILE_BORDER_ZOOM_CLOSE_BTN_CLASS =
  "interactive-scale absolute right-[clamp(0.35rem,2%,0.65rem)] top-[clamp(0.55rem,2.5%,0.85rem)] z-20 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const PROFILE_BORDER_ZOOM_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.35rem,4.2vw,3rem)] select-none"

/**
 * @typedef {{ icon: string, label: string }} ProfileBorderZoomItem
 */
