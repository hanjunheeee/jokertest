import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS } from "@/shared/constants/soundControlLayout.js"

/** 마이페이지·계정·이모티콘 관리 — 본문(z-10) 위에 올리는 조작 레이어 */
export const USER_PAGE_CHROME_LAYER_CLASS = "pointer-events-none absolute inset-0 z-40"

export const USER_PAGE_BACK_BUTTON_CLASS =
  `${BACK_BUTTON_PAGE_POSITION_CLASS} pointer-events-auto z-40`

/** 팔레트·패널 UI와 겹치지 않도록 본문보다 위 레이어에 둔다 */
export const USER_PAGE_SOUND_CONTROL_AREA_CLASS = PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS
