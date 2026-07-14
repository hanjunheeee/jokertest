// 계정 관리 패널이 화면에 나타나는 위치와 크기입니다.
export const ACCOUNT_PANEL_WRAP_CLASS = "absolute left-1/2 top-1/2 z-10 w-[min(36rem,90vw)] -translate-x-1/2 -translate-y-1/2"

// 계정 관리 패널의 배경 박스 스타일입니다.
export const ACCOUNT_PANEL_BOX_CLASS = "rounded-sm bg-[#160d08]/88 px-[clamp(1.5rem,4vw,2.5rem)] py-[clamp(1.25rem,3vh,2rem)] shadow-[0_4px_32px_rgba(0,0,0,0.7)] ring-1 ring-[#8b6a3e]/35 backdrop-blur-sm"

// 패널 제목과 각 섹션 제목에 들어가는 글자 스타일입니다.
export const ACCOUNT_PANEL_TITLE_CLASS = "mb-[clamp(1rem,2.5vh,1.5rem)] font-subheading text-[clamp(1.1rem,1.6vw,1.3rem)] font-bold text-[#e8dfc8] [text-shadow:0_2px_4px_rgba(0,0,0,0.9)]"
export const ACCOUNT_PANEL_HEADING_CLASS = "font-subheading text-[clamp(1rem,1.4vw,1.15rem)] font-bold text-[#e8dfc8] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

// 닉네임/비밀번호 섹션과 form에 들어가는 공통 간격입니다.
export const ACCOUNT_PANEL_CONTENT_CLASS = "flex flex-col gap-[clamp(1rem,2.5vh,1.5rem)]"
export const ACCOUNT_PANEL_SECTION_CLASS = "flex flex-col gap-[clamp(0.55rem,1.1vh,0.75rem)]"
export const ACCOUNT_PANEL_DIVIDER_SECTION_CLASS = `${ACCOUNT_PANEL_SECTION_CLASS} border-b border-[#8b6a3e]/30 pb-[clamp(1rem,2.2vh,1.5rem)]`
export const ACCOUNT_PANEL_FORM_CLASS = "flex flex-col gap-[clamp(0.5rem,1vh,0.65rem)]"
export const ACCOUNT_PANEL_ACTION_ROW_CLASS = "flex items-center justify-between gap-3"

// 확인 버튼에 들어가는 이미지와 글자 스타일입니다.
export const ACCOUNT_PANEL_CONFIRM_BTN_SRC = "/button/버튼(수락 및 긍정).png"
export const ACCOUNT_PANEL_CONFIRM_BTN_CLASS = "relative block w-[clamp(7rem,13vw,10rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
export const ACCOUNT_PANEL_CONFIRM_BTN_IMG_CLASS = "block h-auto w-full select-none"
export const ACCOUNT_PANEL_CONFIRM_BTN_TEXT_CLASS = "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.8rem,1.1vw,0.95rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

// 성공/실패 메시지에 들어가는 글자 스타일입니다.
export const ACCOUNT_PANEL_FEEDBACK_BASE_CLASS = "font-subheading text-[0.82rem] font-bold [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]"
export const ACCOUNT_PANEL_FEEDBACK_SUCCESS_CLASS = "text-[#a8d48a]"
export const ACCOUNT_PANEL_FEEDBACK_ERROR_CLASS = "text-[#e87a7a]"
