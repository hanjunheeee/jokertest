// 모바일 설정 줄·글자 모양 class (데스크톱 설정 색 그대로, 크기만 폰에 맞춤)
// rows/·tabs/ 아래 설정 줄 컴포넌트가 씀

// 줄: 높이 최소 56px, 양피지 위 옅은 금색 구분선
export const ROW_CLASS =
    "flex min-h-14 items-center justify-between gap-4 border-b border-[#c4a574]/40 py-2"

// 슬라이더 줄은 이름·값 한 줄 + 막대 폭 100% 한 줄
export const STACK_ROW_CLASS = "flex flex-col gap-1 border-b border-[#c4a574]/40 pt-3 pb-1"

export const SECTION_TITLE_CLASS =
    "pt-5 pb-1 font-subheading app-text-scaled [--app-text-size:0.82rem] font-black tracking-wide text-[#3d2a1c]/75 first:pt-1"

export const LABEL_CLASS =
    "min-w-0 flex-1 font-subheading app-text-scaled [--app-text-size:1.02rem] font-bold leading-snug text-[#140c08] break-keep"

export const VALUE_CLASS =
    "shrink-0 font-subheading app-text-scaled [--app-text-size:1.05rem] font-bold tabular-nums text-[#140c08]"

// 그림 위 글자 (탭·동작 버튼)
export const IMAGE_LABEL_CLASS =
    "pointer-events-none absolute inset-0 flex items-center justify-center px-1 text-center font-subheading font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
