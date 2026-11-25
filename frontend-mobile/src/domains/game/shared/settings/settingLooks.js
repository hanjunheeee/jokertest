// 방 설정 줄 모양 (방 설정 화면·대기방 설정 변경 시트가 같이 씀)
// shared/settings 아래 줄·숫자 칸·역할 구성이 씀
const TITLE = "font-subheading app-text-scaled font-bold leading-tight text-[#1a1008]"
const DESC = "font-subheading app-text-scaled leading-snug text-[#2a1810]/85"

export const SETTING_LOOKS = {
  // 방 설정 화면: 데스크톱 GameSetupPanel 줄처럼 체크 상자·화살표만 버튼, 입력 칸은 그림 비율 그대로
  setup: {
    row: "flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-[#8b7355]/35 py-3 last:border-b-0",
    title: `${TITLE} [--app-text-size:1.1rem]`,
    desc: `mt-0.5 ${DESC} [--app-text-size:0.9rem]`,
    controlWrap: "ml-auto shrink-0",
    stepper: {
      root: "flex shrink-0 items-center",
      named: true,
      arrow: "group flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-40",
      arrowImg: "block w-8 select-none transition-transform group-active:scale-90",
      box: "relative",
      boxImg: "block h-auto w-full select-none",
      width: { plain: "w-24", unit: "w-28", choice: "w-28" },
    },
    role: {
      wrap: "flex flex-col",
      summary: "flex flex-col gap-1 py-3 text-center",
      line: "font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold leading-snug text-[#2a1810]",
      note: "",
      error: "text-[#8c1c13]",
      scrollOnCustom: true,
      scrollToSummary: true,
    },
  },
}
