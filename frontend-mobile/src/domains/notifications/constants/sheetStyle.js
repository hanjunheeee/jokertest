// 모바일 알림 창 class·틀 그림 style 모음 (바탕·틀·제목·닫기·목록 줄·버튼·바닥 줄·안내 글)
// notifications/components 아래 창 조각들이 씀, 색·글꼴은 데스크톱 notificationLayoutStyle과 같음
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { NOTIFICATION_ASSETS } from "@m/domains/notifications/constants/notificationAssets.js"

// 틀 그림(823×608) 기준 px를 창 폭 비율(cqw)로 바꿈 → 폭이 바뀌어도 장식 비율 그대로
const at = (px) => `calc(100cqw * ${px} / 823)`

// 틀 그림 9칸 자르기: 위(제목 판·모서리 장식)·아래(모서리 장식)는 그대로, 좌우 테두리·가운데만 세로로 늘림
const SLICE = { top: 135, side: 50, bottom: 130 }
export const FRAME_STYLE = {
  borderStyle: "solid",
  borderWidth: 0,
  borderImageSource: `url("${publicAsset(NOTIFICATION_ASSETS.popupFrame)}")`,
  borderImageSlice: `${SLICE.top} ${SLICE.side} ${SLICE.bottom} fill`,
  borderImageWidth: `${at(SLICE.top)} ${at(SLICE.side)} ${at(SLICE.bottom)}`,
  borderImageRepeat: "stretch",
}

// 내용 칸 여백: 데스크톱 MODAL_CONTENT_INSET(폭 비율 %)와 같은 값
export const CONTENT_STYLE = {
  paddingTop: "13cqw",
  paddingBottom: "9.5cqw",
  paddingLeft: "7.5cqw",
  paddingRight: "5.5cqw",
}

// 대제목 판: 틀 위쪽 가운데
export const TITLE_WRAP_STYLE = { top: `calc(${at(56)} - 0.7rem)` }

export const TITLE_WRAP_CLASS =
  "pointer-events-none absolute left-1/2 z-[2] w-[66cqw] -translate-x-1/2 -translate-y-[54%]"

export const TITLE_PLATE_CLASS = "block h-auto w-full select-none"

export const TITLE_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] text-center font-display app-text-scaled [--app-text-size:clamp(1rem,4.8cqw,1.65rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_1px_rgba(0,0,0,0.45)] -translate-y-[0.05rem]"

// 닫기: 데스크톱처럼 오른쪽 위 모서리 장식 위 (가운데 790,65px), 누르는 칸 44px
export const CLOSE_STYLE = { top: `calc(${at(65)} - 1.375rem)`, right: `calc(${at(33)} - 1.375rem)` }

// 바탕·창 자리 (데스크톱 MODAL_BACKDROP_CLASS·MODAL_WRAP_CLASS 자리)
export const BACKDROP_CLASS =
  "fixed inset-0 z-[70] w-full cursor-default border-0 bg-black/70 p-0"

export const WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[71] flex items-center justify-center overflow-hidden safe-pt safe-pb safe-px"

// 창: 폰 세로는 화면 중앙에 작은 틀 (높이·폭 상한), 가로는 조금 넓게 (틀 굵기는 cqw 비율)
export const PANEL_CLASS =
  "pointer-events-auto relative m-2 flex h-[min(calc(100%-1rem),82svh)] max-h-[42rem] w-full max-w-[min(92vw,20.5rem)] flex-col [container-type:inline-size] land:max-h-[38rem] land:max-w-[22rem] md:max-h-[46rem] md:max-w-[26rem]"

export const FRAME_CLASS = "pointer-events-none absolute inset-0 drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"

export const CLOSE_BTN_CLASS =
  "absolute z-20 flex size-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 leading-none outline-none active:scale-95"

export const CLOSE_ICON_CLASS = "pointer-events-none block size-11 select-none object-contain"

export const CONTENT_CLASS = "relative flex min-h-0 flex-1 flex-col"

// 스크롤 칸 (기본 터치 스크롤), 목록 아닐 땐 가운데 정렬
export const SCROLL_CLASS =
  "mt-1 min-h-0 max-h-[calc(100%-2rem)] flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-[2.5cqw] pr-1 text-left"

export const CENTER_CLASS = "flex min-h-full flex-col items-center justify-center gap-2 px-2 text-center"

// 목록·항목 칸 (데스크톱 ITEM_* 모양, 글자 크기만 폰에 맞춤)
export const LIST_CLASS = "m-0 flex w-full list-none flex-col gap-2 p-0 text-left"

export const ITEM_SLOT_CLASS = "relative w-full"

export const ITEM_SLOT_IMG_CLASS = "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const ITEM_INNER_CLASS =
  "relative flex flex-col items-stretch justify-start pb-3 pl-[5%] pr-[6%] pt-4 text-left"

export const ITEM_TITLE_CLASS =
  "m-0 shrink-0 grow-0 break-words font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold leading-tight text-[#f5f0e6]"

export const ITEM_BODY_CLASS =
  "m-0 shrink-0 grow-0 break-words font-body app-text-scaled [--app-text-size:0.78rem] leading-snug text-[#f5f0e6]/90"

export const ACTION_ROW_CLASS =
  "mt-1 flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5"

// 이미지 버튼 (보러 가기·다시 시도·삭제): 그림 비율대로 높이, 폭 줄임
export const ACTION_BTN_CLASS =
  "group relative block w-[6.65rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60"

export const ACTION_BTN_IMG_CLASS =
  "pointer-events-none block h-auto w-full select-none transition-transform duration-200 ease-out group-active:scale-[0.95]"

export const ACTION_LABEL_SECONDARY_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[6%] text-center font-subheading app-text-scaled [--app-text-size:0.62rem] font-bold leading-tight text-[#ebe2cc]/90"

export const ACTION_LABEL_PRIMARY_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[6%] text-center font-subheading app-text-scaled [--app-text-size:0.62rem] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 바닥 줄: 읽은 메시지 삭제 (오른쪽 정렬)
export const FOOTER_CLASS = "relative z-[2] mt-1.5 flex w-full shrink-0 flex-col items-end gap-1"

// 안내·빈 목록·오류 글자 (데스크톱 MSG·EMPTY_MSG·ERROR 색)
export const MSG_CLASS = "m-0 font-body app-text-scaled [--app-text-size:0.85rem] text-[#f5f0e6]/90"

export const EMPTY_MSG_CLASS =
  "m-0 font-body app-text-scaled [--app-text-size:1.05rem] font-medium text-[#f5f0e6]/95"

export const ERROR_CLASS = "m-0 break-words font-body app-text-scaled [--app-text-size:0.78rem] text-[#f5a89a]"
