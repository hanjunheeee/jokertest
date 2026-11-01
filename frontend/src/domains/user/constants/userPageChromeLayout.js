// 사용자 화면(마이페이지·계정·이모티콘) 위층 className (뒤로 버튼·소리 조절 자리)
// UserPageChrome이 씀
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import { PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS } from "@/shared/constants/soundControlLayout.js"

export const LAYER_CLASS = "pointer-events-none absolute inset-0 z-40"

export const BACK_BTN_CLASS =
  `${BACK_BUTTON_PAGE_POSITION_CLASS} pointer-events-auto z-40`

export const SOUND_CONTROL_AREA_CLASS = PAGE_SOUND_CONTROL_ELEVATED_AREA_CLASS
