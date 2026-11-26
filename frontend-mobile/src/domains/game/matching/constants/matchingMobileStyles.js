// 대기방 모바일 화면 모양: 위 줄 아이콘 버튼·방장/초대코드 버튼·바닥 버튼·매칭 틀 안 글자·자리 그림
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

// 파티 인원·방 이름·정원 머리말 모양
export const PARTY_TEXT_CLASS =
  "shrink-0 font-subheading app-text-scaled [--app-text-size:1.05rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]"
export const PARTY_COUNT_CLASS =
  "font-display app-text-scaled [--app-text-size:1.25rem] font-medium leading-none text-text-main tabular-nums antialiased"
export const PARTY_ICON_CLASS = "block h-6 w-auto shrink-0 select-none object-contain opacity-95"
export const ROOM_TITLE_BADGE_CLASS =
  "min-w-0 max-w-[44%] truncate rounded-sm border border-[#3a2818]/75 bg-[#120a06]/85 px-2 py-0.5 font-subheading app-text-scaled [--app-text-size:0.92rem] font-bold leading-tight text-[#f5f0e6]"
export const PARTY_CAPACITY_BADGE_CLASS =
  "shrink-0 rounded-sm border border-[#c8a878]/55 bg-[#120a06]/85 px-2 py-0.5 font-display app-text-scaled [--app-text-size:0.92rem] font-medium leading-tight text-[#f5f0e6] tabular-nums"

// 매칭 틀 안 제목·안내·기다림 글 (틀 폭 cqw 기준)
export const BOARD_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[5.85%] z-[2] w-[72%] -translate-x-1/2 text-center font-display text-[5.15cqw] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]"
export const BOARD_PROMPT_CLASS =
  "shrink-0 text-balance text-center font-subheading text-[max(0.8rem,3.2cqw)] font-bold leading-snug text-[#1a1008]"
export const BOARD_WAITING_CLASS =
  "mt-[1.5cqw] shrink-0 text-center font-subheading text-[max(0.78rem,2.3cqw)] font-bold text-[#1a1008]"

// 자리 그림 크기·배지·예약석 모양 (양피지 위 대비 4.5 이상 보장)
export const SLOT_LARGE_CLASS = "block h-auto w-[13.8cqw] shrink-0 select-none object-contain"
export const SLOT_COMPACT_CLASS = "block h-auto w-[11.4cqw] shrink-0 select-none object-contain"
export const SLOT_NOT_READY_OFFSET_CLASS = "-translate-y-[1.4cqw]"
export const RESERVED_HOST_IMG_CLASS = "opacity-40 grayscale"
export const RESERVED_HOST_LABEL_CLASS =
  "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-[#6b4321]/75 bg-[#fff8ec]/95 px-1 py-0.5 font-subheading text-[clamp(0.56rem,2.2cqw,0.78rem)] font-bold leading-none tracking-tight text-[#1a1008]"
export const SEAT_BADGE_BASE_CLASS =
  "pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border px-1 py-0.5 font-subheading text-[clamp(0.54rem,2.1cqw,0.74rem)] font-bold leading-none tracking-tight"
export const SEAT_BADGE_READY_CLASS = "border-[#6b4321]/75 bg-[#fff8ec]/95 text-[#1a1008]"
export const SEAT_BADGE_WAITING_CLASS = "border-[#3a2818]/85 bg-[#120a06]/92 text-[#f5f0e6]"

// 방장 단추·시작 단추 잠긴 까닭 글 모양 (어두운 받침 + 밝은 글자로 대비 확보)
export const KICK_LOCKED_REASON_CLASS =
  "max-w-[14rem] rounded-sm border border-[#3a2818]/75 bg-[#120a06]/90 px-2 py-1 font-subheading app-text-scaled [--app-text-size:0.75rem] font-bold leading-snug text-[#f5f0e6]"
export const START_LOCKED_REASON_CLASS =
  "mx-auto w-full max-w-[34rem] rounded-sm border border-[#3a2818]/75 bg-[#120a06]/90 px-2.5 py-1 text-center font-subheading app-text-scaled [--app-text-size:0.82rem] font-bold leading-snug text-[#f5f0e6] land:max-w-[28rem]"
