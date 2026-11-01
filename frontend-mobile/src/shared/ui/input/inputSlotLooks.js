// 입력 칸 모양 모음 (화면마다 여백·글자·보기 버튼 class 한 벌씩)
// InputSlot이 이름으로 고름
const TEXT = "text-white placeholder:text-white/55"
const IMG_BLOCK = "absolute inset-0 block h-full w-full select-none"

// 계정 관리 칸 아이콘 색 (조금 옅은 회색)
export const MUTED_ICON_CLASS = "h-5 w-5 shrink-0 text-neutral-500"

export const INPUT_SLOT_LOOKS = {
  // 로그인·가입·소셜 가입
  login: {
    wrap: "relative h-12 w-full",
    img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
    row: "absolute inset-0 flex items-center gap-2 pl-[7%] pr-[3%]",
    input: "h-full min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60",
    text: TEXT,
    // 어두운 배경에 맞게 달력 아이콘을 밝히고, 값 없을 땐 흐린 글자
    dateFilled: "[color-scheme:dark] text-white",
    dateEmpty: "[color-scheme:dark] text-white [&::-webkit-datetime-edit]:text-white/55",
    toggle: "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-neutral-600 active:scale-90",
    namedByPlaceholder: true,
  },
  // 아이디 찾기·비번 재설정 (데스크톱 auth-date-input 대신 날짜 색 class)
  recovery: {
    wrap: "relative mt-1 h-12 w-full",
    img: IMG_BLOCK,
    row: "absolute inset-0 flex items-center gap-2 pl-[7%] pr-[5%]",
    input: "h-full min-w-0 flex-1 bg-transparent font-sans font-normal outline-none disabled:cursor-not-allowed disabled:opacity-60",
    text: TEXT,
    dateFilled: "[color-scheme:dark] text-white",
    dateEmpty: "[color-scheme:dark] [&::-webkit-datetime-edit]:text-white/55",
    toggle: "-mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-neutral-500 active:text-neutral-300",
    namedByPlaceholder: false,
  },
  // 계정 관리 (보기 버튼 없으면 오른쪽 여백 칸)
  account: {
    wrap: "relative h-12 w-full",
    img: IMG_BLOCK,
    row: "absolute inset-0 flex items-center gap-2 pl-[7%] pr-1",
    input: "h-full min-w-0 flex-1 bg-transparent outline-none",
    text: TEXT,
    toggle: "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0",
    eyeIcon: MUTED_ICON_CLASS,
    spacer: "w-3 shrink-0",
    namedByPlaceholder: true,
  },
}
