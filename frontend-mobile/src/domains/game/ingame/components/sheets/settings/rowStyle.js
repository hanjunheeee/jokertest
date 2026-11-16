// 설정 시트 줄 모양 (줄 판·이름·값·안내 글)
// settings/ 아래 탭·줄 컴포넌트가 씀, 색은 데스크톱 ingameSettingLayout 그대로

// 탭 본문 세로 쌓기
export const TAB_BODY_CLASS = "flex w-full flex-col gap-2 pb-1"

// 줄 판 (데스크톱 어두운 판·얇은 테두리, 높이 52px 이상)
export const ROW_PLATE_CLASS =
  "flex min-h-[3.25rem] w-full min-w-0 items-center gap-2.5 rounded-sm border border-[#3a2818]/75 bg-[#120a06]/55 px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const ROW_LABEL_CLASS =
  "min-w-0 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const ROW_VALUE_CLASS =
  "w-9 shrink-0 text-right font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-none tabular-nums text-white/90"
