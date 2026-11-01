// 설정 시트 줄 모양 (줄 판·이름·설명·값·링크·안내 글)
// settings/ 아래 탭·줄 컴포넌트가 씀, 색은 데스크톱 ingameSettingLayout 그대로

// 탭 본문 세로 쌓기
export const TAB_BODY_CLASS = "flex w-full flex-col gap-2 pb-1"

// 줄 판 (데스크톱 어두운 판·얇은 테두리, 높이 52px 이상)
export const ROW_PLATE_CLASS =
  "flex min-h-[3.25rem] w-full min-w-0 items-center gap-2.5 rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const ROW_LABEL_CLASS =
  "min-w-0 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const ROW_DESC_CLASS =
  "font-subheading app-text-scaled [--app-text-size:0.78rem] font-medium leading-snug text-[#ebe2cc]/78 [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]"

export const ROW_VALUE_CLASS =
  "w-9 shrink-0 text-right font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-none tabular-nums text-white/90"

// 링크 버튼 (누르는 자리 44px, 위험 링크는 붉은 글자)
const LINK_BASE =
  "flex min-h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent px-1 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-none underline decoration-1 underline-offset-[0.18em] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)] active:scale-95"

export const LINK_CLASS = `${LINK_BASE} text-[#e8f0dc] decoration-[#c4a574]/85`

export const LINK_DANGER_CLASS = `${LINK_BASE} text-[#ffb4b4] decoration-[#c95555]/90`

// 줄 아래 안내·오류 글과 다시 시도 버튼
export const ERROR_CLASS =
  "px-1 text-left font-subheading app-text-scaled [--app-text-size:0.82rem] leading-snug text-[#ffb3a7]"

export const RETRY_CLASS =
  "ml-1.5 inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 align-middle underline decoration-dotted"
