// 모바일 서고 모양 class와 그림 경로 (양피지 쪽·잉크 글자·누르는 자리)
// library/components 전부가 씀, 색·글꼴은 데스크톱 서고 constants와 같은 값

// 쪽 바탕: 데스크톱 책 그림은 가로 펼침면이라 한 쪽만 못 잘라 씀 → 같은 결의 양피지 그림
export const PARCHMENT_SRC = "/frame/양피지 모달.png".normalize("NFD")

// 잉크 글자 공통 (데스크톱 forbiddenRecords·invitedGuests 글자색)
const INK = "font-subheading antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.08)]"
export const INK_TITLE_CLASS = `${INK} text-[#120a06]`
export const INK_BODY_CLASS = `${INK} text-[#1a1008]`
export const INK_SOFT_CLASS = `${INK} text-[#3d2a1c]/85`

// 쪽 제목 (h2)·칸 제목 (h3)·본문
export const PAGE_TITLE_CLASS =
  `${INK_TITLE_CLASS} app-text-scaled [--app-text-size:1.15rem] font-extrabold leading-snug`
export const SECTION_TITLE_CLASS =
  `${INK_TITLE_CLASS} app-text-scaled [--app-text-size:1.02rem] font-black leading-snug`
export const BODY_TEXT_CLASS =
  `${INK_BODY_CLASS} whitespace-pre-line app-text-scaled [--app-text-size:0.94rem] font-medium leading-[1.75]`
export const SMALL_TEXT_CLASS =
  `${INK_BODY_CLASS} app-text-scaled [--app-text-size:0.86rem]`
export const STATE_MSG_CLASS =
  `${INK_BODY_CLASS} app-text-scaled [--app-text-size:0.86rem] leading-snug opacity-80`

// 표 머리·줄 (데스크톱 tableStyle과 같은 선 색)
export const TABLE_HEAD_ROW_CLASS =
  `${INK_TITLE_CLASS} border-b border-[#2a1810]/22 app-text-scaled [--app-text-size:0.84rem] font-black`
export const TABLE_ROW_CLASS = "border-b border-[#2a1810]/10 last:border-b-0"

// 누르는 자리 최소 44px, 누르면 살짝 줄어듦
export const TAP_CLASS =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none transition-transform duration-150 active:scale-95 disabled:cursor-default"

// 양피지 위 작은 글자 버튼 (다시 시도·랭킹 넘김)
export const INK_BUTTON_CLASS =
  `${TAP_CLASS} rounded-md px-3 ${INK_BODY_CLASS} app-text-scaled [--app-text-size:0.88rem] font-semibold disabled:opacity-30`
