// 방 설정 줄 모양 두 벌 (방 설정 화면 = 넉넉 / 대기방 설정 변경 시트 = 촘촘)
// shared/settings 아래 줄·숫자 칸·역할 구성이 씀
const TITLE = "font-subheading app-text-scaled font-bold leading-tight text-[#1a1008]"
const DESC = "font-subheading app-text-scaled leading-snug text-[#2a1810]/85"
const VALUE_IMG = "select-none object-fill"

export const SETTING_LOOKS = {
  // 방 설정 화면: 체크 줄 전체가 버튼, 숫자 칸 화살표는 눌릴 때 그림만 줄어듦
  setup: {
    row: "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-[#8b7355]/35 py-3 last:border-b-0",
    title: `${TITLE} [--app-text-size:1.05rem]`,
    desc: `mt-1 ${DESC} [--app-text-size:0.85rem]`,
    controlWrap: null,
    wholeRowCheck: true,
    stepper: {
      root: "ml-auto flex shrink-0 items-center",
      named: true,
      arrow: "group flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 disabled:opacity-35",
      arrowImg: "block w-6 select-none transition-transform group-active:scale-90",
      box: "relative h-9",
      boxImg: `block h-full w-full ${VALUE_IMG}`,
      width: { plain: "w-26", unit: "w-26", choice: "w-30" },
    },
    role: {
      wrap: "flex flex-col",
      summary: "flex flex-col gap-1 py-3 text-center",
      line: "font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold leading-snug text-[#2a1810]",
      note: "font-normal",
      error: "text-[#8c1c13]",
      scrollOnCustom: false,
    },
  },
  // 대기방 설정 변경 시트: 조작 칸만 버튼, 글자 조금 작게
  sheet: {
    row: "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[#8b7355]/35 py-2.5 last:border-b-0",
    title: `${TITLE} [--app-text-size:1.02rem]`,
    desc: `mt-0.5 ${DESC} [--app-text-size:0.82rem]`,
    controlWrap: "ml-auto shrink-0",
    wholeRowCheck: false,
    stepper: {
      root: "flex shrink-0 items-center",
      named: false,
      arrow: "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-90 disabled:cursor-default disabled:opacity-35",
      arrowImg: "block h-auto w-7 select-none",
      box: "relative",
      boxImg: `block h-9 w-full ${VALUE_IMG}`,
      width: { plain: "w-[5rem]", unit: "w-[5.75rem]", choice: "w-[5.75rem]" },
    },
    role: {
      wrap: undefined,
      summary: "flex flex-col gap-1 py-2 text-center",
      line: "font-subheading app-text-scaled [--app-text-size:0.85rem] font-bold leading-snug text-[#2a1810]",
      note: "",
      // 양피지 위 오류 (대기방 ERROR_ON_PARCHMENT_CLASS와 같은 값)
      errorFull: "font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold leading-snug text-[#8c1c13]",
      scrollOnCustom: true,
    },
  },
}
