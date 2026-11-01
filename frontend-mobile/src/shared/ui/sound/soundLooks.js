// 배경음 조절 크기 모음 (화면마다 위 줄·바닥 줄 자리에 맞춘 class 한 벌씩)
// SoundControl·SoundMenu가 이름으로 고름

// 손잡이 그림 자리 (left는 값 위치로 옮김)
const KNOT = "pointer-events-none absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
const BAR = "block h-auto w-full select-none"
// 막대 그림을 칸 세로 가운데에 띄움
const BAR_CENTER = "absolute inset-x-0 top-1/2 block h-auto w-full -translate-y-1/2 select-none"
const INPUT_FILL = "absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"

export const SOUND_LOOKS = {
  // 로그인 위 줄: 막대 짧게, range 누르는 칸을 위아래로 넓힘
  login: {
    group: "flex items-center",
    button: "relative z-10 -mr-2 h-11 w-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 active:scale-95 disabled:opacity-60",
    icon: "block h-full w-full select-none",
    title: true,
    track: "relative w-24 shrink-0 land:w-28! md:w-36",
    bar: BAR,
    input: "absolute inset-x-0 -inset-y-3 z-20 h-[calc(100%+1.5rem)] w-full cursor-pointer opacity-0",
    knot: `${KNOT} w-[0.95rem]`,
  },
  // 계정 찾기 위 줄 (손잡이 자리 class는 데스크톱 SOUND_CONTROL_CLASSES.sliderKnotWrap 값)
  recovery: {
    group: "flex items-center",
    button: "relative z-10 -mr-2 size-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none active:scale-95 disabled:cursor-not-allowed",
    icon: "block h-auto w-full select-none",
    title: true,
    track: "relative w-[7.5rem] shrink-0 md:w-[10rem]",
    bar: BAR,
    input: "absolute inset-x-0 top-1/2 z-20 h-11 w-full -translate-y-1/2 cursor-pointer opacity-0",
    knot: `${KNOT} w-[24%] min-w-[0.9rem] max-w-[1.15rem]`,
  },
  // 로비 바닥 줄: 아이콘 크게, 막대는 화면 폭 비율
  lobby: {
    group: "flex min-w-0 items-center",
    button: "relative z-10 -mr-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95 disabled:cursor-not-allowed md:h-14 md:w-14",
    icon: "block h-auto w-full select-none",
    title: true,
    track: "relative flex h-11 w-[clamp(7.5rem,36vw,11rem)] min-w-0 items-center md:w-52",
    bar: BAR,
    input: INPUT_FILL,
    knot: `${KNOT} w-[12%] min-w-[0.9rem] max-w-[1.15rem]`,
  },
  // 방 설정 좁은 위 줄
  setup: {
    group: "flex shrink-0 items-center",
    button: "relative z-10 flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0",
    icon: "block w-10 select-none",
    title: false,
    track: "relative -ml-2 h-11 w-24",
    bar: BAR_CENTER,
    input: INPUT_FILL,
    knot: `${KNOT} w-3.5`,
  },
  // 서고 위 줄: 막대는 쓸어 넘기기와 안 섞이게 책 밖, 폭은 화면 폭 비율
  library: {
    group: "flex shrink-0 items-center",
    button: "relative z-10 flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 active:scale-95 disabled:cursor-not-allowed",
    icon: "block w-10 select-none",
    title: false,
    track: "relative -ml-2 h-11 w-[clamp(4.5rem,20vw,6.5rem)]",
    bar: BAR_CENTER,
    input: INPUT_FILL,
    knot: `${KNOT} w-3.5`,
  },
}

// 펼침 창 (root·여는 버튼·바깥 덮개·창 틀 + 창 안 조절 한 벌)
export const SOUND_MENU_LOOKS = {
  // 모드 영역: 창 자체가 조절 줄
  mode: {
    root: "relative",
    openLabel: "사운드 조절",
    opener: "flex size-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90",
    backdrop: "fixed inset-0 z-40 cursor-default bg-transparent",
    panel: null,
    control: {
      group: "absolute right-0 top-12 z-50 flex w-[min(16rem,80vw)] items-center gap-2 rounded-md border border-[#c4a87a]/60 bg-[#120c08]/95 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.6)]",
      button: "flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50",
      icon: "block h-auto w-[2.4rem] select-none",
      title: false,
      track: "relative h-11 min-w-0 flex-1",
      bar: BAR_CENTER,
      input: INPUT_FILL,
      knot: `${KNOT} w-4`,
      valueAria: false,
    },
  },
  // 마이페이지: 어두운 창 안에 조절 줄
  user: {
    root: "relative shrink-0",
    openLabel: "사운드 조절 열기",
    opener: "flex h-11 w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90",
    backdrop: "fixed inset-0 z-40 cursor-default border-0 bg-transparent",
    panel: "absolute right-0 top-12 z-50 rounded-lg border border-[#c9b892]/50 bg-black/85 p-2 shadow-lg",
    control: {
      group: "flex items-center gap-1",
      button: "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50",
      icon: "block h-full w-full select-none object-contain",
      title: false,
      track: "relative flex h-11 w-44 shrink-0 items-center",
      bar: BAR,
      input: INPUT_FILL,
      knot: `${KNOT} w-4`,
    },
  },
}
