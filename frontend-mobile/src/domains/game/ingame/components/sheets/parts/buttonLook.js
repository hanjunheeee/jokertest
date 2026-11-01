// 인게임 시트 그림 버튼 모양 (그림을 칸에 맞춰 늘리고 글자 겹침, 높이 44px 이상)
// 탭 줄·방 코드 버튼·추방 줄·추방 확인·복사 버튼이 공용 ImageButton에 넘김

// 데스크톱 그림 버튼과 같은 흰 글자·그림자, 글자색은 부르는 쪽 labelClassName으로 덧붙임
export const SHEET_BUTTON_LOOK = {
  button:
    "relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 leading-none outline-none transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55",
  img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
  label:
    "relative z-[1] truncate px-2 font-subheading app-text-scaled [--app-text-size:0.92rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
  labelSize: "",
  labelAsName: true,
}
