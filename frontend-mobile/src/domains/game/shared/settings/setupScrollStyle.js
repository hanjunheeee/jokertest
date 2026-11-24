// 방 설정·대기방 설정 변경: 양피지 목록 + 오른쪽 그림 스크롤 막대
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

const PARCHMENT_FRAME_CLASS =
  "rounded-md border-2 border-[#4a3426] shadow-[inset_0_0_24px_rgba(60,35,15,0.45),0_8px_24px_rgba(0,0,0,0.5)]"

export const SETUP_SETTINGS_SCROLL_WRAP_CLASS = "relative h-full min-h-0 w-full flex-1"

export const SETUP_SETTINGS_SCROLL_AREA_CLASS = `h-full min-h-0 w-full overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-1 pr-[clamp(1.45rem,6vw,1.9rem)] ${PARCHMENT_FRAME_CLASS} ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 막대 세로 길이: 양피지 테두리 안쪽만 (위·아래 여백)
export const SETUP_SETTINGS_SCROLLBAR_CLASS =
  "z-20 !right-[clamp(0.22rem,0.85vw,0.38rem)] !top-[clamp(0.85rem,4.5%,1.35rem)] !bottom-[clamp(0.85rem,4.5%,1.35rem)] !h-auto !w-[clamp(0.82rem,1.2rem,1.08rem)] !translate-x-0 origin-top"