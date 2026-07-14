// 마이페이지 중앙 UI가 천천히 나타나는 애니메이션 설정입니다.
export const MY_PAGE_UI_FADE = {
  duration: 0.7,
  ease: [0.22, 1, 0.36, 1],
}

// 마이페이지의 큰 영역별 레이아웃 class입니다.
export const MY_PAGE_ROOT_CLASS = "relative z-10 flex h-full min-h-0 flex-col"
export const MY_PAGE_MAIN_CLASS = "relative flex min-h-0 flex-1 items-center justify-center px-[clamp(1rem,3vw,2rem)] pt-[clamp(2.5rem,6vh,4.5rem)] pb-[clamp(0.25rem,1vh,0.75rem)]"
export const MY_PAGE_CONTENT_ROW_CLASS = "flex items-center justify-center gap-[clamp(1.25rem,2.8vw,2.25rem)]"

// 왼쪽 프로필 프레임과 안쪽 사진에 들어가는 class입니다.
export const MY_PAGE_PROFILE_FRAME_WRAP_CLASS = "relative w-[clamp(17rem,27vw,25rem)] shrink-0"
export const MY_PAGE_PROFILE_PHOTO_CLASS = "absolute left-1/2 top-[51%] z-0 h-[80%] w-[76%] -translate-x-1/2 -translate-y-1/2 object-contain object-center"
export const MY_PAGE_PROFILE_FRAME_CLASS = "relative z-10 block h-auto w-full select-none"

// 오른쪽 기록 영역과 계정 관리 버튼에 들어가는 class입니다.
export const MY_PAGE_SUMMARY_PANEL_CLASS = "flex w-[clamp(20rem,32vw,36rem)] shrink-0 flex-col items-start gap-[clamp(0.65rem,1.4vh,1rem)]"
export const MY_PAGE_ACCOUNT_BUTTON_CLASS = "relative block w-[clamp(7rem,13vw,10rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85"
export const MY_PAGE_ACCOUNT_BUTTON_IMG_CLASS = "block h-auto w-full select-none"
export const MY_PAGE_ACCOUNT_BUTTON_TEXT_CLASS = "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.75rem,1vw,0.9rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"
