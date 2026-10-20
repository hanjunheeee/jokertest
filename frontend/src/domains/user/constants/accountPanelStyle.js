import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

// 계정 관리 패널 — 로그인 프레임(AuthFrame)과 같은 inset 비율
export const ACCOUNT_PANEL_FRAME_INSET = {
  paddingTop: "31.5%",
  paddingBottom: "6.5%",
  paddingLeft: "11%",
  paddingRight: "10%",
}

// 화면 중앙 배치 — motion.div와 분리해야 transform이 덮이지 않는다.
export const ACCOUNT_PANEL_POSITION_CLASS =
  "absolute left-1/2 top-[calc(50%-1.75rem)] z-10 w-full max-w-[min(29.5rem,74vw)] -translate-x-1/2 -translate-y-1/2 px-3"

// 등장 애니메이션만 담당하는 내부 래퍼입니다.
export const ACCOUNT_PANEL_WRAP_CLASS = "relative w-full"

export const ACCOUNT_PANEL_FRAME_SHELL_CLASS = "relative w-full"

export const ACCOUNT_PANEL_FRAME_IMG_CLASS =
  "pointer-events-none block h-auto w-full select-none"

export const ACCOUNT_PANEL_FRAME_CONTENT_CLASS =
  "absolute inset-0 flex min-h-0 flex-col overflow-x-visible overflow-y-hidden"

export const ACCOUNT_PANEL_SCROLL_CLASS =
  `relative flex min-h-0 flex-1 flex-col overflow-x-visible overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// 각 섹션 제목에 들어가는 글자 스타일입니다.
export const ACCOUNT_PANEL_HEADING_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,0.98vw,0.82rem)] font-bold text-[#e8dfc8] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

// 닉네임·비밀번호 변경 섹션 제목 — 양피지 프레임 위 가독용 검정.
export const ACCOUNT_PANEL_FORM_HEADING_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,0.98vw,0.82rem)] font-bold text-black"

// 닉네임/비밀번호 섹션과 form에 들어가는 공통 간격입니다.
export const ACCOUNT_PANEL_CONTENT_CLASS =
  "flex flex-col gap-[clamp(0.7rem,1.75vh,1.05rem)] pt-[clamp(0.6rem,1.6vh,0.85rem)]"
export const ACCOUNT_PANEL_SECTION_CLASS = "flex flex-col gap-[clamp(0.4rem,0.75vh,0.52rem)]"
export const ACCOUNT_PANEL_DIVIDER_SECTION_CLASS =
  `${ACCOUNT_PANEL_SECTION_CLASS} border-b border-[#8b6a3e]/30 pb-[clamp(0.7rem,1.55vh,1.05rem)]`
export const ACCOUNT_PANEL_FORM_CLASS =
  "flex w-full flex-col gap-[clamp(0.35rem,0.7vh,0.45rem)]"

export const ACCOUNT_PANEL_ACTION_AREA_CLASS =
  "flex w-full flex-col gap-[clamp(0.25rem,0.5vh,0.35rem)]"

export const ACCOUNT_PANEL_FEEDBACK_LINE_CLASS = "w-full min-w-0 overflow-x-auto"

export const ACCOUNT_PANEL_ACTION_BUTTON_ROW_CLASS = "flex w-full justify-end"

// 계정 관리 입력칸 — 폼 가로 전체 사용.
export const ACCOUNT_PANEL_INPUT_WRAP_CLASS = "w-full max-w-full"

// 확인 버튼에 들어가는 이미지와 글자 스타일입니다.
export const ACCOUNT_PANEL_CONFIRM_BTN_SRC = "/button/버튼(수락 및 긍정).png".normalize("NFD")
export const ACCOUNT_PANEL_CONFIRM_BTN_CLASS =
  "relative ml-auto block w-[clamp(5.4rem,10vw,7.6rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
export const ACCOUNT_PANEL_CONFIRM_BTN_IMG_CLASS = "block h-auto w-full select-none"
export const ACCOUNT_PANEL_CONFIRM_BTN_TEXT_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.6rem,0.75vw,0.68rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

// 성공/실패 메시지에 들어가는 글자 스타일입니다.
export const ACCOUNT_PANEL_FEEDBACK_BASE_CLASS =
  "block w-full whitespace-nowrap font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.05vw,0.84rem)] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
export const ACCOUNT_PANEL_FEEDBACK_SUCCESS_CLASS = "text-[#2E6B3A]"
export const ACCOUNT_PANEL_FEEDBACK_ERROR_CLASS = "text-[#9C3D32]"
