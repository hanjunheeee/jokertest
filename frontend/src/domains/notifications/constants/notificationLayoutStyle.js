import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../shared/constants/customScrollbarStyles.js"
import { MATCHING_BTN_FOCUS_CLASS, MATCHING_BTN_IMG_SCALE_CLASS } from "../../game/matching/constants/matchingPopupStyles.js"

/** 알림 모달 — backdrop */
export const NOTIFICATION_MODAL_BACKDROP_CLASS =
  "fixed inset-0 z-[70] w-full cursor-default border-0 bg-black/70 p-0"

/** 알림 모달 — 중앙 정렬 wrapper */
export const NOTIFICATION_MODAL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[71] flex items-center justify-center overflow-hidden px-[clamp(0.5rem,3vw,2rem)] py-[clamp(0.5rem,3vh,2rem)]"

/** 알림 모달 — 패널(프레임 이미지 컨테이너). 매칭 팝업(58rem)보다 작게 잡는다. */
export const NOTIFICATION_MODAL_PANEL_CLASS =
  "pointer-events-auto relative w-[min(50rem,82vw)] max-w-full"

/** 매칭 팝업 프레임 이미지 */
export const NOTIFICATION_MODAL_FRAME_IMG_CLASS =
  "pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_36px_rgba(0,0,0,0.5)]"

/** 프레임 이미지 실패 시 대체 패널 */
export const NOTIFICATION_MODAL_FALLBACK_FRAME_CLASS =
  "relative w-[min(50rem,82vw)] max-w-full rounded-lg border border-[#4a4038] bg-gradient-to-b from-[#2a2420] via-[#1f1a16] to-[#14110e] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

/** 프레임 상단 제목 ("알림") */
export const NOTIFICATION_MODAL_TITLE_CLASS =
  "pointer-events-none absolute left-1/2 top-[5.85%] z-[2] w-[72%] -translate-x-1/2 text-center font-display app-text-scaled [--app-text-size:clamp(1.45rem,2.35vw,1.95rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]"

/** 프레임 안쪽 본문 영역 — 목록·스크롤만 담는 flex column */
export const NOTIFICATION_MODAL_CONTENT_CLASS =
  "absolute inset-0 flex min-h-0 flex-col items-stretch overflow-hidden"

/** 프레임 안쪽 본문 inset — 매칭 팝업 종이 면적을 최대한 채우도록 여백을 줄인다 */
export const NOTIFICATION_MODAL_CONTENT_INSET = {
  paddingTop: "13%",
  paddingBottom: "6.5%",
  paddingLeft: "7.5%",
  paddingRight: "5.5%",
}

/** 대체 패널 본문 — 높이가 내용으로 정해지므로 최대 높이만 제한 */
export const NOTIFICATION_MODAL_FALLBACK_CONTENT_CLASS =
  "flex max-h-[80svh] min-h-0 flex-col items-stretch overflow-hidden px-[clamp(1.25rem,4vw,2rem)] py-[clamp(1.5rem,4vh,2rem)]"

/** 프레임 우상단 팝업 닫기 버튼 — 매칭 팝업 프레임과 동일 배치 */
export const NOTIFICATION_MODAL_CLOSE_BTN_CLASS =
  `interactive-scale group absolute right-[clamp(-0.4rem,-1%,-0.15rem)] top-[clamp(0.95rem,4.2%,1.65rem)] z-20 block w-[clamp(3.75rem,7.4vw,5.1rem)] cursor-pointer border-0 bg-transparent p-0 leading-none ${MATCHING_BTN_FOCUS_CLASS}`

export const NOTIFICATION_MODAL_CLOSE_BTN_IMG_CLASS =
  MATCHING_BTN_IMG_SCALE_CLASS

/** 스크롤바가 겹치지 않도록 입력창 오른쪽을 비워 둔다 */
export const NOTIFICATION_ITEM_SLOT_RIGHT_TRIM_CLASS =
  "w-[calc(100%-clamp(1.55rem,2.75vw,2.2rem))]"

/** 알림 목록 */
export const NOTIFICATION_LIST_CLASS =
  "flex w-full list-none flex-col gap-[clamp(0.35rem,0.95vw,0.55rem)] p-0 text-left"

/** 알림 항목 — 입력창1.png 슬롯(세로 min-height로 정보 영역 확대) */
export const NOTIFICATION_ITEM_SLOT_MIN_HEIGHT_CLASS =
  "min-h-[clamp(5.75rem,16vh,8.25rem)]"

export const NOTIFICATION_ITEM_SLOT_CLASS =
  `relative ${NOTIFICATION_ITEM_SLOT_RIGHT_TRIM_CLASS} ${NOTIFICATION_ITEM_SLOT_MIN_HEIGHT_CLASS}`

export const NOTIFICATION_ITEM_SLOT_IMG_CLASS =
  "absolute inset-0 h-full w-full select-none object-fill"

/** 슬롯 위 텍스트·버튼 오버레이 — 좌측·하단으로 살짝 당긴다 */
export const NOTIFICATION_ITEM_INNER_CLASS =
  "absolute inset-0 flex min-h-0 flex-col justify-start pl-[4%] pr-[8%] pt-[clamp(1.05rem,2.45vh,1.35rem)] pb-[clamp(0.35rem,1.05vh,0.6rem)] text-left"

export const NOTIFICATION_ITEM_TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,1.55vw,0.86rem)] font-bold text-[#f5f0e6]"

export const NOTIFICATION_ITEM_BODY_CLASS =
  "font-body app-text-scaled [--app-text-size:clamp(0.62rem,1.35vw,0.74rem)] text-[#f5f0e6]/90"

export const NOTIFICATION_ACTION_ROW_CLASS =
  "mt-[clamp(0.2rem,0.6vw,0.35rem)] flex flex-wrap gap-[clamp(0.3rem,0.8vw,0.5rem)]"

/** 본문 + 하단 액션(읽은 메시지 삭제) */
export const NOTIFICATION_MODAL_BODY_COLUMN_CLASS =
  "flex min-h-0 flex-1 flex-col"

/** 좌측 하단 — 읽은 메시지 삭제 */
export const NOTIFICATION_MODAL_FOOTER_CLASS =
  "relative z-[2] mt-[clamp(0.25rem,0.6vh,0.45rem)] flex shrink-0 flex-col items-start gap-[clamp(0.15rem,0.4vh,0.25rem)]"

/** 버튼(미선택)·버튼(수락 및 긍정) — 삭제·이동·재시도 */
export const NOTIFICATION_ACTION_BUTTON_CLASS =
  "group relative w-[clamp(5.85rem,25vw,8.35rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-60"

export const NOTIFICATION_ACTION_BUTTON_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.95]"

/** 버튼(미선택) 라벨 */
export const NOTIFICATION_ACTION_BUTTON_SECONDARY_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.56rem,1.05vw,0.68rem)] font-bold leading-tight text-[#ebe2cc]/90"

/** 버튼(수락 및 긍정) 라벨 */
export const NOTIFICATION_ACTION_BUTTON_PRIMARY_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.56rem,1.05vw,0.68rem)] font-bold leading-tight text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** 로딩·안내 문구 */
export const NOTIFICATION_MESSAGE_CLASS =
  "font-body app-text-scaled [--app-text-size:clamp(0.66rem,1.45vw,0.8rem)] text-[#f5f0e6]/90"

/** 빈 목록 안내 — 본문보다 한 단계 크게 */
export const NOTIFICATION_EMPTY_MESSAGE_CLASS =
  "font-body app-text-scaled [--app-text-size:clamp(0.92rem,1.9vw,1.12rem)] font-medium text-[#f5f0e6]/95"

export const NOTIFICATION_ERROR_CLASS =
  "font-body app-text-scaled [--app-text-size:clamp(0.62rem,1.35vw,0.74rem)] text-[#f5a89a]"

/** 스크롤 래퍼 — SignupScrollArea와 동일(absolute scroll + Scrollbar 오버레이) */
export const NOTIFICATION_SCROLL_WRAP_CLASS =
  "relative mt-[clamp(0.3rem,0.75vh,0.5rem)] min-h-0 w-full flex-1 overflow-hidden"

/** 스크롤 목록 — absolute inset-0으로 래퍼 높이에 고정, 네이티브 숨김 + shared Scrollbar */
export const NOTIFICATION_SCROLL_AREA_CLASS =
  `absolute inset-0 min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain pr-[clamp(0.15rem,0.35vw,0.25rem)] text-left ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

/** 로딩·실패·빈 상태 — 가운데 정렬 */
export const NOTIFICATION_CENTERED_SCROLL_AREA_CLASS =
  `${NOTIFICATION_SCROLL_AREA_CLASS} flex flex-col items-center justify-center text-center`

/** shared Scrollbar — 기본 translate-x는 바깥으로 밀려 content overflow-hidden에 잘린다 */
export const NOTIFICATION_SCROLLBAR_CLASS =
  "z-[15] !right-[clamp(0.35rem,0.65vw,0.5rem)] !top-[clamp(0.05rem,0.25vh,0.15rem)] !bottom-0 !w-[clamp(0.72rem,1.28vw,1.05rem)] !translate-x-0 origin-top scale-100"
