// 게임 설정 패널 모양 상수
// components/GameSetupPanel이 씀
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../../shared/constants/customScrollbarStyles.js"

export const PANEL_WRAP_CLASS =
  "absolute left-1/2 top-[48%] z-20 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.82]"

export const PANEL_CLASS =
  "flex w-[min(76rem,96vw)] flex-col items-center"

// 프레임 그림 안쪽 여백 (탭·본문이 그림 테두리 안에 들어가게)
export const FRAME_OVERLAY_INSET = {
  paddingTop: "3.75%",
  paddingBottom: "14%",
  paddingLeft: "9.5%",
  paddingRight: "9.5%",
}

// 본문 스크롤 영역 (기본 스크롤바는 숨김)
export const SETUP_CONTENT_CLASS =
  `flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-clip pt-[clamp(1.35rem,1.85vh,2.5rem)] pb-[clamp(3.25rem,5vh,4.25rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`
