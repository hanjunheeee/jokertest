// 입력 칸 모양 모음 (화면마다 여백·글자·보기 버튼 class 한 벌씩)
// InputSlot이 이름으로 고름
// 입력 글자는 16px 이상(iOS 확대 막기), 작게 보일 건 안내 글자만
const LOGIN_TEXT =
  "font-subheading text-white placeholder:text-white/55 app-input-text placeholder:app-text-scaled placeholder:[--app-text-size:11px]"
const IMG_BLOCK = "absolute inset-0 block h-full w-full select-none"
// 보기 버튼 그림 색: 어두운 입력칸 그림 위라 밝은 색, 누르면 더 밝게, 키보드 초점 테두리는 데스크톱 보기 버튼과 같은 색
const TOGGLE_COLOR =
  "rounded-sm text-white/70 outline-none active:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

export const INPUT_SLOT_LOOKS = {
  // 로그인·가입·소셜 가입
  login: {
    wrap: "relative mx-auto h-11 w-[88%]",
    img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
    row: "absolute inset-0 flex items-center gap-2 pl-[7%] pr-[3%]",
    input: "h-full min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60",
    text: LOGIN_TEXT,
    // 데스크톱 auth-date-input (흰 달력 아이콘, 값 없을 땐 흐린 글자, index.css 전역 class)
    dateFilled: "auth-date-input auth-date-input--filled",
    dateEmpty: "auth-date-input",
    toggle: `flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 ${TOGGLE_COLOR} active:scale-90`,
    namedByPlaceholder: true,
  },
  // 아이디 찾기·비번 재설정 (데스크톱 auth-date-input 대신 날짜 색 class)
  recovery: {
    wrap: "relative mx-auto mt-1 h-11 w-[98%]",
    img: "pointer-events-none absolute inset-0 h-full w-full select-none object-fill",
    row: "absolute inset-0 flex items-center gap-2 pl-[7%] pr-[3%]",
    input: "h-full min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-60",
    text: LOGIN_TEXT,
    dateFilled: "auth-date-input auth-date-input--filled",
    dateEmpty: "auth-date-input",
    toggle: `-mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 ${TOGGLE_COLOR}`,
    namedByPlaceholder: false,
  },
  // 계정 관리 (데스크톱 계정 칸처럼 왼쪽 여백 9%, 보기 버튼 없으면 오른쪽 여백 칸)
  account: {
    wrap: "relative h-10 w-full",
    img: IMG_BLOCK,
    row: "absolute inset-0 flex items-center gap-1.5 pl-[8.5%] pr-0.5",
    input: "h-full min-w-0 flex-1 bg-transparent outline-none",
    text: "font-subheading text-white app-input-text",
    toggle: `-my-0.5 flex size-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 ${TOGGLE_COLOR}`,
    spacer: "w-2.5 shrink-0",
    namedByPlaceholder: true,
  },
}
