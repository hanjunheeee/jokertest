// 계정 관리 패널 className·틀 여백
// 계정 관리 패널 컴포넌트들·DiscordAccountLink가 씀
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 패널 자리·틀 (로그인 틀 그림 안쪽 여백 — AuthScene 액자와 가로 맞춤)
export const FRAME_INSET = {
  paddingTop: "34%",
  paddingBottom: "7.25%",
  paddingLeft: "13%",
  paddingRight: "13%",
}

export const POSITION_CLASS =
  "absolute left-1/2 top-[calc(50%-1.75rem)] z-10 w-full max-w-[min(29.5rem,74vw)] min-w-0 -translate-x-1/2 -translate-y-1/2 px-3"

export const WRAP_CLASS = "relative w-full min-w-0 max-w-full overflow-hidden"

// 로그인 액자(625) + 아래 장식(700). 내용 창은 638/700으로 살짝 여유
const FRAME_CONTENT_VIEW_H = 638
const FRAME_ACCOUNT_H = 700

export const FRAME_SHELL_CLASS = "relative aspect-[403/700] w-full min-w-0 max-w-full"

export const FRAME_IMG_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const FRAME_CONTENT_CLASS =
  "absolute inset-x-0 top-0 flex min-h-0 min-w-0 flex-col overflow-hidden"

export const FRAME_CONTENT_HEIGHT = `${(FRAME_CONTENT_VIEW_H / FRAME_ACCOUNT_H) * 100}%`

export const SCROLL_CLASS =
  `relative box-border flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-clip overflow-y-auto overscroll-contain pb-3 pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 모바일 계정 폼과 동일: 제목·본문·입력·버튼은 액자 안쪽 94% (크기는 유지, 좌우만 맞춤)
export const PANEL_INSET_WIDTH_CLASS = "mx-auto w-[94%] min-w-0 max-w-full"

export const PANEL_FORM_HEADING_CLASS = `${PANEL_INSET_WIDTH_CLASS} font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,0.98vw,0.82rem)] font-bold text-black`

export const PANEL_MUTED_TEXT_CLASS = `${PANEL_INSET_WIDTH_CLASS} font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,0.85vw,0.72rem)] text-black/70 break-all`

export const PANEL_GUIDE_TEXT_CLASS = `${PANEL_INSET_WIDTH_CLASS} font-subheading app-text-scaled [--app-text-size:clamp(0.6rem,0.8vw,0.7rem)] text-black/70 break-keep`

export const CONTENT_CLASS =
  "flex w-full min-w-0 max-w-full flex-col gap-[clamp(0.7rem,1.75vh,1.05rem)] overflow-x-clip pt-[clamp(0.6rem,1.6vh,0.85rem)]"

export const CONTENT_BOTTOM_SPACER_CLASS = "shrink-0 min-h-[clamp(0.35rem,1vh,0.55rem)]"

export const PANEL_SECTION_CLASS = "flex w-full min-w-0 max-w-full flex-col gap-[clamp(0.4rem,0.75vh,0.52rem)]"
export const DIVIDER_SECTION_CLASS =
  `${PANEL_SECTION_CLASS} border-b border-[#8b6a3e]/30 pb-[clamp(0.7rem,1.55vh,1.05rem)]`
export const PANEL_FORM_CLASS =
  "flex w-full min-w-0 max-w-full flex-col gap-[clamp(0.35rem,0.7vh,0.45rem)]"

export const PANEL_ACTION_AREA_CLASS =
  `${PANEL_INSET_WIDTH_CLASS} flex flex-col gap-[clamp(0.25rem,0.5vh,0.35rem)]`

export const PANEL_FEEDBACK_LINE_CLASS = "w-full min-w-0 max-w-full overflow-hidden"

export const PANEL_ACTION_BTN_ROW_CLASS = "flex w-full min-w-0 max-w-full justify-end overflow-hidden"

export const INPUT_WRAP_CLASS = `${PANEL_INSET_WIDTH_CLASS} overflow-hidden`

export const PANEL_INLINE_LINK_CLASS = `${PANEL_INSET_WIDTH_CLASS} auth-text-link max-w-full text-left break-keep`

// 확인 버튼
export const CONFIRM_BTN_SRC = "/button/버튼(수락 및 긍정).webp".normalize("NFD")
export const CONFIRM_BTN_CLASS =
  "relative ml-auto block w-[clamp(5.4rem,10vw,7.6rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
export const CONFIRM_BTN_IMG_CLASS = "block h-auto w-full select-none"
export const CONFIRM_BTN_TEXT_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.6rem,0.75vw,0.68rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

// 결과 문구 (성공·실패 색), 긴 글은 낱말 단위로 꺾음 (한 줄 고정이면 칸 폭을 넘는 끝이 잘렸음)
export const FEEDBACK_BASE_CLASS =
  "block w-full min-w-0 break-keep font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.84rem)] font-bold leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
// 계정 판 양피지와 밝기가 비슷하면 안 읽혀 같은 초록·빨강 계열에서 가장 짙게 (모바일 계정 화면도 이 값을 씀)
export const FEEDBACK_SUCCESS_CLASS = "text-[#163a1e]"
export const FEEDBACK_ERROR_CLASS = "text-[#5a0f08]"
