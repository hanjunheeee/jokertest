// 그림 버튼 모양 모음 (버튼·그림·글자 class, 글자 크기 기본값)
// ImageButton이 이름으로 고름, 한 화면만 쓰는 모양은 그 화면이 객체로 넘김

export const IMAGE_BUTTON_LOOKS = {
  // 그림을 버튼 칸에 맞춰 늘림, 흰 글자 (인증 화면)
  stretch: {
    button:
      "relative block min-h-11 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
    img: "pointer-events-none block h-full min-h-11 w-full select-none object-fill",
    label:
      "pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-center font-subheading font-bold text-white",
    labelSize: "app-text-scaled [--app-text-size:16px]",
  },
  // 그림 비율대로 높이, 잠기면 흐리게·회색 (모드 영역)
  plate: {
    button:
      "relative block min-h-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-[transform,opacity] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:active:scale-100",
    img: "block h-auto w-full select-none",
    label:
      "pointer-events-none absolute inset-0 flex items-center justify-center px-2 font-subheading app-text-scaled font-bold tracking-wide leading-none text-[#f5e8c8] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]",
    labelSize: "[--app-text-size:1.05rem]",
    labelAsName: true,
  },
  // 그림을 칸 뒤에 깔고 글자는 가운데 한 줄 (대기방)
  fill: {
    button:
      "relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
    img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
    label: "truncate",
    labelSize:
      "relative z-[1] px-2 font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]",
    labelAsName: true,
  },
  // 그림 비율대로 높이, 글자 고정 크기 (이모티콘)
  plain: {
    button: "relative block min-h-11 border-0 bg-transparent p-0 leading-none active:scale-95 disabled:opacity-40",
    img: "block h-auto w-full select-none",
    label:
      "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-base font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]",
  },
}
