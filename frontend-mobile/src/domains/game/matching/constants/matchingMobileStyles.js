// 대기방 모바일 화면 모양: 위 줄 아이콘 버튼·방 이름 줄·방장/초대코드 버튼·바닥 버튼·매칭 틀 안 글자·자리 그림·준비 글
// 대기방 위 줄·방장 버튼·가운데 틀·자리·바닥 줄이 씀, 글자 모양은 데스크톱 matchingPopupStyles 최소 크기 기준

// 뒤로 가기 그림 (데스크톱 MotionBackButton 그림)
export const BACK_BUTTON_SRC = "/button/뒤로가기 버튼2.webp".normalize("NFD")

// 위 줄 동그란 아이콘 버튼 (누를 자리 44px)
export const ICON_BTN_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none active:scale-95 disabled:cursor-default disabled:opacity-40"

// 그림 버튼 공통 (그림을 칸에 깔고 글자 한 줄, 잠기면 반투명 = 데스크톱 disabled:opacity-50)
const BUTTON_BASE =
  "relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center overflow-hidden border-0 bg-transparent p-0 leading-none transition-transform active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
const BUTTON_IMG = "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
const LABEL_BASE =
  "relative z-[1] whitespace-nowrap font-subheading app-text-scaled font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 방장 버튼 (데스크톱 HOST_ACTION_BTN_LABEL_CLASS 글자)
export const HOST_BUTTON_LOOK = {
  button: `${BUTTON_BASE} h-11 w-[6.5rem]`,
  img: BUTTON_IMG,
  label: `${LABEL_BASE} px-[4%] [--app-text-size:0.8rem] leading-none tracking-tight`,
  labelAsName: true,
}

// 초대코드 공유 버튼 (데스크톱 ROOM_CODE_BTN_LABEL_CLASS 글자)
export const ROOM_CODE_BUTTON_LOOK = {
  button: `${BUTTON_BASE} h-11 w-[7.25rem]`,
  img: BUTTON_IMG,
  label: `${LABEL_BASE} [--app-text-size:0.82rem] tracking-tight`,
  labelAsName: true,
}

// 바닥 준비·시작·삭제·나가기 버튼 (데스크톱 ACTION_BTN_LABEL_CLASS 글자)
export const ACTION_BUTTON_LOOK = {
  button: `${BUTTON_BASE} h-12 w-full land:h-11`,
  img: BUTTON_IMG,
  label: `${LABEL_BASE} [--app-text-size:0.92rem] tracking-wide`,
  labelAsName: true,
}

// 파티 인원 머리말 (데스크톱 PARTY_* 글자·그림)
export const PARTY_TEXT_CLASS =
  "truncate font-subheading app-text-scaled [--app-text-size:1.1rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"
// 인원 숫자: 어두운 배경 위라 진한 빨강(text-text-main)은 안 보여 밝은 빨강 (데스크톱과 같음)
export const PARTY_COUNT_CLASS =
  "font-display app-text-scaled [--app-text-size:1.3rem] font-medium leading-none text-[#ff8f87] tabular-nums antialiased"
export const PARTY_ICON_CLASS = "block h-7 w-auto shrink-0 select-none object-contain opacity-95"

// 위 줄 방 정보 줄: 방 이름(길면 말줄임) + 앉은 수/정원 (인원 머리말 위 작은 한 줄)
export const ROOM_INFO_ROW_CLASS =
  "flex min-w-0 items-baseline gap-1.5 font-subheading app-text-scaled [--app-text-size:0.78rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"
// 방 이름 h1은 전역 h1 빨강이 먼저 먹어 줄 글자색을 안 물려받음 → 직접 줌
export const ROOM_TITLE_CLASS = "min-w-0 truncate text-[#f5f0e6]"
export const ROOM_CAPACITY_CLASS = "shrink-0 font-display font-medium tabular-nums"

// 매칭 틀 안 제목·안내·기다림 글 (틀 폭 cqw 기준, 데스크톱 틀 폭 대비 글자 비율)
export const BOARD_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[5.85%] z-[2] w-[72%] -translate-x-1/2 text-center font-display text-[5.15cqw] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]"
export const BOARD_PROMPT_CLASS =
  "shrink-0 text-balance text-center font-subheading text-[max(0.8rem,3.2cqw)] font-bold leading-snug text-[#1a1008]"
export const BOARD_WAITING_CLASS =
  "mt-[1.5cqw] shrink-0 text-center font-subheading text-[max(0.78rem,2.3cqw)] font-bold text-[#1a1008]"

// 자리 그림 크기 (데스크톱 SLOT_CLASS_LARGE/COMPACT를 틀 폭 비율로), 미준비는 살짝 위로
export const SLOT_LARGE_CLASS = "block h-auto w-[13.8cqw] shrink-0 select-none object-contain"
export const SLOT_COMPACT_CLASS = "block h-auto w-[10.8cqw] shrink-0 select-none object-contain"
export const SLOT_NOT_READY_OFFSET_CLASS = "-translate-y-[1.4cqw]"

// 자리 준비 글: 실루엣 아래쪽에 겹쳐 둠 (칸 높이를 안 바꿔 틀 안에서 안 넘침), 준비완료 = 밝은 바탕 · 대기중 = 어두운 바탕
// 글자 크기는 옆 칸 글과 안 겹치게 칸 폭에 맞춤 (두 줄 이상일 때 칸이 좁아 더 작게)
const SEAT_BADGE_BASE =
  "pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border px-[0.25em] py-[0.15em] font-subheading font-bold leading-none tracking-tighter"
export const SEAT_BADGE_LARGE_CLASS = `${SEAT_BADGE_BASE} text-[max(0.68rem,2.6cqw)]`
export const SEAT_BADGE_COMPACT_CLASS = `${SEAT_BADGE_BASE} text-[max(0.58rem,2.2cqw)]`
export const SEAT_BADGE_READY_CLASS = "border-[#6b4321]/60 bg-[#f5e6c8]/90 text-[#1a1008]"
export const SEAT_BADGE_WAITING_CLASS = "border-[#3a2818]/70 bg-[#120a06]/85 text-[#f5f0e6]"
