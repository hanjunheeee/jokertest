import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const PROFILE_EDIT_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

export const PROFILE_EDIT_BACKDROP_CLASS =
  "fixed inset-0 z-[55] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

export const PROFILE_EDIT_PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center p-[clamp(1rem,3vw,2rem)]"

export const PROFILE_EDIT_PANEL_CLASS =
  "pointer-events-auto relative flex w-[min(36rem,92vw)] max-w-[42rem] flex-col overflow-hidden rounded-[1.1rem] border border-[#b83232]/40 bg-[#f5f0e6]/84 ring-1 ring-[#c43c3c]/14 backdrop-blur-[6px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.48),0_16px_42px_rgba(26,15,10,0.36)]"

export const PROFILE_EDIT_HEADER_CLASS =
  "border-b border-[#2a1810]/14 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.65rem,1.2vh,0.85rem)]"

export const PROFILE_EDIT_TABS_CLASS =
  "flex items-center justify-center gap-[clamp(0.35rem,0.75vw,0.55rem)]"

export const PROFILE_EDIT_TAB_BTN_CLASS =
  "relative w-[clamp(7.5rem,22vw,9.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90"

export const PROFILE_EDIT_TAB_BTN_IMAGE_CLASS = "block h-auto w-full select-none"

export const PROFILE_EDIT_TAB_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.78rem,1.05vw,0.92rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const PROFILE_EDIT_TAB_BTN_LABEL_INACTIVE_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.78rem,1.05vw,0.92rem)] font-bold text-[#5c554d] [text-shadow:0_1px_1px_rgba(245,240,230,0.35)]"

export const PROFILE_EDIT_PREVIEW_SECTION_CLASS =
  "flex items-center justify-center border-b border-[#2a1810]/12 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.85rem,1.8vh,1.15rem)]"

export const PROFILE_EDIT_PREVIEW_WRAP_CLASS =
  "relative aspect-square w-[clamp(6.5rem,18vw,9.5rem)] select-none"

export const PROFILE_EDIT_PREVIEW_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-1/2 z-[1] aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

export const PROFILE_EDIT_PREVIEW_PHOTO_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.28] select-none object-cover object-center"

export const PROFILE_EDIT_PREVIEW_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"

export const PROFILE_EDIT_GRID_SECTION_CLASS =
  `min-h-[min(10rem,28vh)] max-h-[min(16rem,38vh)] overflow-y-auto overscroll-contain px-[clamp(0.75rem,1.35vw,1rem)] py-[clamp(0.65rem,1.2vh,0.85rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const PROFILE_EDIT_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(clamp(3.75rem,11vw,4.75rem),1fr))] gap-[clamp(0.45rem,0.85vw,0.65rem)]"

export const PROFILE_EDIT_OPTION_BTN_CLASS =
  "cursor-pointer border-0 bg-transparent p-0"

export const PROFILE_EDIT_OPTION_CARD_CLASS =
  "flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-[#2a1810]/14 bg-[#1a0f0a]/06 transition-[box-shadow,ring-color] [box-shadow:inset_0_1px_0_rgba(245,240,230,0.12),_0_4px_14px_rgba(0,0,0,0.12)]"

export const PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS =
  "border-[#b83232]/55 ring-2 ring-[#c43c3c]/60 [box-shadow:inset_0_1px_0_rgba(245,240,230,0.16),_0_4px_14px_rgba(0,0,0,0.16),_0_0_16px_rgba(180,40,40,0.38),_0_0_6px_rgba(220,50,50,0.28)]"

export const PROFILE_EDIT_OPTION_PHOTO_WRAP_CLASS =
  "flex h-[82%] w-[82%] items-center justify-center overflow-hidden rounded-full"

export const PROFILE_EDIT_OPTION_PHOTO_CLASS =
  "block h-full w-full min-h-full min-w-full scale-[1.22] select-none object-cover object-center"

export const PROFILE_EDIT_OPTION_BORDER_CLASS =
  "block h-[88%] w-[88%] select-none object-contain object-center"

export const PROFILE_EDIT_FOOTER_CLASS =
  "border-t border-[#2a1810]/14 px-[clamp(0.85rem,1.5vw,1.15rem)] py-[clamp(0.75rem,1.35vh,1rem)]"

export const PROFILE_EDIT_CONFIRM_BTN_CLASS =
  "relative mx-auto block w-[min(100%,14rem)] cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

export const PROFILE_EDIT_CONFIRM_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.82rem,1.1vw,0.95rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const PROFILE_EDIT_CONFIRM_BTN_IMAGE_CLASS = "block h-auto w-full select-none"

export const PROFILE_EDIT_CLOSE_BTN_CLASS =
  "interactive-scale absolute right-[clamp(0.35rem,2%,0.65rem)] top-[clamp(0.45rem,2.2%,0.65rem)] z-20 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const PROFILE_EDIT_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.1rem,3.8vw,2.65rem)] select-none"

// 프로필 수정 — 선택지 catalog

const PROFILE_PHOTO_BASE = "/shopItem/player-profile/"
const PROFILE_BORDER_BASE = "/shopItem/player- profileborder/"

/** 무료로 제공되는 프로필 이미지 (더미친구 제외) */
export const PROFILE_EDIT_FREE_PHOTOS = [
  "프로필-금빛가면.png",
  "프로필-마인.png",
  "프로필-사냥꾼.png",
  "프로필-기사.png",
  "프로필-붉은기운.png",
  "프로필-악당.png",
  "프로필-영애.png",
  "프로필-수녀.png",
  "프로필-영주.png",
  "프로필-화관쓴소녀.png",
  "프로필-암살자.png",
  "프로필-역병의사.png",
  "프로필-그림자.png",
  "프로필-음유시인.png",
  "프로필-드워프.png",
  "프로필-귀부인.png",
].map((name) => `${PROFILE_PHOTO_BASE}${name}`.normalize("NFD"))

/** 보유 중인 프로필 테두리 (구매 로직 연동 전 — 평민만) */
export const PROFILE_EDIT_OWNED_BORDERS = [
  `${PROFILE_BORDER_BASE}프로필프레임-평민.png`.normalize("NFD"),
]

export const PROFILE_EDIT_TAB_PHOTO = "photo"
export const PROFILE_EDIT_TAB_BORDER = "border"

export const PROFILE_EDIT_TABS = [
  { id: PROFILE_EDIT_TAB_PHOTO, label: "프로필 수정" },
  { id: PROFILE_EDIT_TAB_BORDER, label: "테두리 수정" },
]
