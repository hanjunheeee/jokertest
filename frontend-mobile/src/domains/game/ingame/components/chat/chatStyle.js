// 모바일 채팅 공통 모양: 양피지 칸·나무 테두리·글자·입력 줄 class
// components/chat 아래 부품들이 씀, 색은 데스크톱 채팅 틀 그림·글자색(#3a1a0c)에 맞춤

// 채팅 칸: 나무 테두리 + 양피지 바탕 (틀 그림은 비율이 고정이라 세로 폰에선 CSS로 그림)
export const PANEL_CLASS =
    "relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[0.7rem] border-[3px] border-[#3b2414] bg-[#e9d8b2] [background-image:radial-gradient(ellipse_at_center,rgba(255,248,230,0.55),rgba(160,110,60,0.18)_78%,rgba(90,50,20,0.32))] [box-shadow:inset_0_0_0_1px_rgba(255,236,200,0.35),inset_0_0_18px_rgba(70,35,10,0.35),0_4px_14px_rgba(0,0,0,0.55)]"

// 머리 줄 (채널 표시·크게 보기)
export const HEADER_CLASS =
    "flex shrink-0 items-center gap-2 border-b border-[#3a1a0c]/18 py-0.5 pl-2 pr-0.5"

// 메시지 글 기본 모양 (데스크톱 채팅 글과 같은 글꼴·굵기·색)
export const TEXT_CLASS =
    "font-subheading font-bold leading-[1.4] tracking-[0.02em] text-[#3a1a0c]"

// 메시지 목록 스크롤 칸 (가로 스크롤 없음, 끝에서 바깥 화면 안 끌려감)
export const LIST_SCROLL_CLASS =
    "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2.5 py-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(58,26,12,0.35)_transparent]"

// 입력 줄 바깥 (나무 바탕, 키보드가 덮으면 transform으로 올림)
export const COMPOSER_BAR_CLASS =
    "flex w-full items-end gap-2 bg-[#2a1810] px-2.5 py-2 [box-shadow:0_-2px_10px_rgba(0,0,0,0.45)] transition-transform duration-150 ease-out"

// 입력칸 (양피지 바탕, 글자 16px 이상은 index.css가 맞춤 → iOS 확대 없음)
export const TEXTAREA_CLASS =
    "block max-h-[6.2rem] min-h-11 w-full resize-none rounded-[0.5rem] border border-[#c9a46a]/60 bg-[#efe2c4] px-3 py-[0.6rem] font-subheading font-bold leading-[1.35] text-[#3a1a0c] outline-none placeholder:text-[#6a4526]/70 focus:border-[#e0b46a] focus:ring-2 focus:ring-[#e0b46a]/40 disabled:cursor-not-allowed disabled:bg-[#cdbd9c] disabled:text-[#6a4526]"

// 아이콘 버튼 (누르는 자리 44px)
export const ICON_BTN_CLASS =
    "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[#3a1a0c] active:scale-95 active:bg-[#3a1a0c]/10"

// 크게 보기 시트 움직임 (데스크톱 겹창과 같은 값)
export const SHEET_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] }

// 글자 크기: 데스크톱 배율(0.6~1)을 쓰되 폰에서 너무 작지 않게 바닥 둠
export function chatFontSize(textScale, base = 0.95) {
    const rem = Math.max(0.74, base * textScale)
    return `calc(${rem.toFixed(3)}rem * var(--app-text-scale, 1))`
}
