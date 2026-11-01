// 모바일 알림 시트 Tailwind 클래스 모음 (틀·머리 줄·목록 줄·상세·버튼·바닥 줄)
// notifications/components 아래 시트 조각들이 씀

// 시트 틀: 화면 전체 덮개, 색은 데스크톱 대체 틀과 같은 어두운 나무색
export const SHEET_ROOT_CLASS =
  "fixed inset-0 z-[70] flex flex-col overflow-hidden bg-gradient-to-b from-[#2a2420] via-[#1f1a16] to-[#14110e] safe-px"

export const SHEET_COLUMN_CLASS =
  "mx-auto flex min-h-0 w-full max-w-[40rem] flex-1 flex-col"

// 머리 줄: 뒤로·제목·닫기, 안전영역 아래에 둠
export const HEADER_CLASS =
  "safe-pt flex shrink-0 items-center gap-2 border-b border-[#4a4038] px-2 pb-1"

export const HEADER_ROW_CLASS =
  "flex h-14 w-full items-center gap-2 land:h-12"

export const TITLE_CLASS =
  "min-w-0 flex-1 truncate text-center font-display app-text-scaled [--app-text-size:1.6rem] font-medium leading-none text-[#f5f0e6] [text-shadow:0_1px_1px_rgba(0,0,0,0.45)] land:[--app-text-size:1.35rem]"

export const ICON_BTN_CLASS =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 leading-none outline-none focus-visible:ring-2 focus-visible:ring-[#f5f0e6]/50 active:scale-95 disabled:invisible"

export const ICON_BTN_IMG_CLASS =
  "pointer-events-none block h-full w-full select-none object-contain"

// 본문: 양피지 판 안에서 세로 스크롤
export const BODY_WRAP_CLASS =
  "flex min-h-0 flex-1 flex-col px-3 py-3 land:py-2"

export const PARCHMENT_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border-2 border-[#5a4d3e] bg-[#cdb68e] shadow-[inset_0_0_24px_rgba(60,40,20,0.45)]"

export const SCROLL_CLASS =
  "min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-2.5"

export const CENTER_CLASS =
  "flex min-h-full flex-col items-center justify-center gap-3 px-4 text-center"

// 목록·줄 (가로 폰·태블릿은 두 줄씩)
export const LIST_CLASS =
  "m-0 grid w-full list-none grid-cols-1 gap-2 p-0 text-left land:grid-cols-2 md:gap-3"

export const ROW_CLASS =
  "relative min-h-[6.5rem] overflow-hidden"

export const ROW_SLOT_IMG_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const ROW_INNER_CLASS =
  "relative flex h-full flex-col gap-1.5 px-4 pb-3 pt-3"

export const ROW_TAP_CLASS =
  "flex min-h-11 w-full cursor-pointer items-start gap-2 border-0 bg-transparent p-0 text-left"

export const ROW_TEXT_CLASS =
  "flex min-w-0 flex-1 flex-col gap-0.5"

export const ROW_CHEVRON_CLASS =
  "shrink-0 self-center font-body text-[1.25rem] leading-none text-[#f5f0e6]/70"

export const ITEM_TITLE_CLASS =
  "m-0 truncate font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold text-[#f5f0e6]"

export const ROW_BODY_CLASS =
  "m-0 line-clamp-2 break-words font-body app-text-scaled [--app-text-size:0.82rem] text-[#f5f0e6]/90"

export const ACTION_ROW_CLASS =
  "flex flex-wrap items-center gap-2"

// 상세 보기
export const DETAIL_CLASS =
  "relative flex flex-col overflow-hidden rounded-md border-2 border-[#4a4038] bg-[#2a2622] shadow-[inset_0_0_18px_rgba(0,0,0,0.6),0_2px_6px_rgba(0,0,0,0.35)]"

export const DETAIL_INNER_CLASS =
  "relative flex flex-col gap-3 px-5 py-5"

export const DETAIL_TITLE_CLASS =
  "m-0 break-words font-subheading app-text-scaled [--app-text-size:1.15rem] font-bold text-[#f5f0e6]"

export const DETAIL_DATE_CLASS =
  "m-0 font-body app-text-scaled [--app-text-size:0.75rem] text-[#f5f0e6]/60"

export const DETAIL_BODY_CLASS =
  "m-0 whitespace-pre-wrap break-words font-body app-text-scaled [--app-text-size:0.95rem] leading-relaxed text-[#f5f0e6]/95"

// 이미지 버튼 (보러 가기·다시 시도·읽은 메시지 삭제), 누르는 곳 44px 이상
export const ACTION_BTN_CLASS =
  "relative flex h-11 min-w-[9.5rem] max-w-full shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent px-4 py-0 leading-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"

export const ACTION_BTN_IMG_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const ACTION_LABEL_PRIMARY_CLASS =
  "relative truncate font-subheading app-text-scaled [--app-text-size:0.82rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const ACTION_LABEL_SECONDARY_CLASS =
  "relative truncate font-subheading app-text-scaled [--app-text-size:0.82rem] font-bold text-[#ebe2cc]/90"

// 바닥 줄: 읽은 메시지 삭제, 홈 막대 위에 둠
export const FOOTER_CLASS =
  "flex shrink-0 flex-col items-start gap-1 border-t border-[#4a4038] px-3 pt-2 [padding-bottom:max(0.5rem,env(safe-area-inset-bottom,0px))]"

// 안내·빈 목록·오류 글자
export const MSG_CLASS =
  "m-0 font-body app-text-scaled [--app-text-size:0.95rem] text-[#3a2e22]"

export const EMPTY_MSG_CLASS =
  "m-0 font-body app-text-scaled [--app-text-size:1.05rem] font-medium text-[#3a2e22]"

export const ERROR_CLASS =
  "m-0 break-words font-body app-text-scaled [--app-text-size:0.8rem] text-[#f5a89a]"

// 양피지 위 오류는 밝은 빨강이 안 보여 진한 빨강으로
export const ERROR_ON_PARCHMENT_CLASS =
  "m-0 break-words font-body app-text-scaled [--app-text-size:0.9rem] font-bold text-[#8a1c10]"
