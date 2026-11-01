// 스킨·카드 장착 창 className·움직임·미리보기 방식 값
// 스킨·카드 장착 창 컴포넌트들·장착 훅·시험이 씀
import { buildThemeStyles } from "../../../../shared/constants/ingamePlayerTheme.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "../../../../shared/constants/customScrollbarStyles.js"

// 미리보기 이름표 색·창 움직임·미리보기 바뀜 움직임
export const PREVIEW_NAMEPLATE_THEME = {
  styles: buildThemeStyles("#ffffff"),
}

export const WEAR_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

export const PREVIEW_MOTION = {
  initial: { opacity: 0, scale: 0.98, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.99, y: -4 },
}

export const PREVIEW_MOTION_TRANSITION = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
}

// 배경·창 틀·안쪽 여백
export const BACKDROP_CLASS =
  "fixed inset-0 z-[55] cursor-default border-0 bg-[#1a0f0a]/62 p-0 backdrop-blur-[4px]"

export const PANEL_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[56] flex items-center justify-center p-[clamp(0.5rem,2vw,1.25rem)]"

export const PANEL_STACK_CLASS =
  "pointer-events-auto flex w-[min(62rem,96vw)] max-w-[68rem] flex-col items-center gap-[clamp(0.55rem,1.1vh,0.8rem)]"

export const PANEL_CLASS = "relative w-full"

export const PANEL_INNER_PAD = {
  paddingTop: "9.6%",
  paddingBottom: "5.5%",
  paddingLeft: "5.4%",
  paddingRight: "5.2%",
}

export const PANEL_FRAME_CLASS =
  "pointer-events-none block h-auto w-full select-none drop-shadow-[0_12px_36px_rgba(0,0,0,0.45)]"

export const PANEL_CONTENT_CLASS =
  "absolute inset-0 flex min-h-0 flex-col overflow-visible"

export const PANEL_GRID_CLASS =
  "grid min-h-0 flex-1 w-full overflow-visible grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)]"

// 왼쪽 목록 (제목·스크롤·항목 버튼)
export const LIST_COLUMN_CLASS =
  "flex min-h-0 flex-col overflow-visible bg-transparent pt-[clamp(0.82rem,1.75vh,1.05rem)] -translate-y-[clamp(0.18rem,0.45vh,0.32rem)]"

export const LIST_TITLE_ANCHOR_CLASS =
  "pointer-events-none absolute left-[clamp(1.92rem,5.35%,2.62rem)] top-[clamp(1.98rem,5.35%,2.38rem)] z-30"

export const LIST_TITLE_CLASS =
  "font-display app-text-scaled [--app-text-size:clamp(1.12rem,1.62vw,1.38rem)] font-medium tracking-wide text-[#d4af37] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]"

export const LIST_SCROLL_WRAP_CLASS =
  "relative min-h-0 flex-1 pr-0"

export const LIST_BODY_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain pl-[clamp(0.35rem,0.75vw,0.55rem)] pr-[clamp(0.08rem,0.18vw,0.12rem)] py-[clamp(0.28rem,0.55vh,0.42rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

export const LIST_SCROLLBAR_CLASS =
  "right-[clamp(-1.68rem,-1.15vw,-1.32rem)] !translate-x-0"

export const LIST_CLASS =
  "flex w-full min-w-0 max-w-full flex-col gap-[clamp(0.3rem,0.6vh,0.42rem)]"

export const LIST_ITEM_BTN_CLASS =
  "group flex w-full max-w-full min-w-0 cursor-pointer items-center gap-[clamp(0.4rem,0.75vw,0.55rem)] rounded-md border border-transparent bg-transparent p-[clamp(0.3rem,0.55vw,0.42rem)] text-left transition-[background-color,border-color,box-shadow] duration-150 hover:border-[#c9a227]/28 hover:bg-[#1a1008]/24 hover:shadow-[0_0_12px_rgba(212,175,55,0.08)]"

export const LIST_ITEM_BTN_SELECTED_CLASS =
  "border-[#c9a227]/45 bg-[#1a1008]/28 ring-1 ring-[#d4af37]/28"

export const LIST_ITEM_THUMB_WRAP_CLASS =
  "flex h-[clamp(2.75rem,4.35vw,3.15rem)] w-[clamp(2.75rem,4.35vw,3.15rem)] shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#1a1008]/22 bg-[#1a1008]/12 transition-[border-color,transform] duration-150 group-hover:scale-[1.04] group-hover:border-[#c9a227]/32"

export const LIST_ITEM_THUMB_CLASS =
  "block h-[90%] w-[90%] select-none object-contain object-center"

export const LIST_ITEM_TEXT_WRAP_CLASS =
  "flex min-w-0 flex-1 flex-col gap-[clamp(0.08rem,0.18vh,0.12rem)]"

export const LIST_ITEM_NAME_CLASS =
  "block truncate font-subheading app-text-scaled [--app-text-size:clamp(0.74rem,0.96vw,0.86rem)] font-bold text-[#ebe2cc] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const LIST_ITEM_KIND_CLASS =
  "block font-subheading app-text-scaled [--app-text-size:clamp(0.6rem,0.75vw,0.68rem)] font-semibold tracking-wide text-[#c9a227]/82"

export const LIST_ITEM_EQUIPPED_CHECK_CLASS =
  "pointer-events-none ml-auto shrink-0 block h-[clamp(0.95rem,1.25vw,1.08rem)] w-[clamp(0.95rem,1.25vw,1.08rem)] select-none object-contain"

// 항목 종류 글자 (기본 스킨·스킨·플레이어 카드)
export const ITEM_KIND_LABEL = {
  basic: "기본 스킨",
  premium: "스킨",
  card: "플레이어 카드",
}

// 오른쪽 미리보기 (직업 탭·서 있는 그림·카드)
export const PREVIEW_COLUMN_CLASS =
  "relative flex min-h-0 flex-col overflow-visible bg-transparent"

export const JOB_TABS_ROW_CLASS =
  "flex max-w-full flex-nowrap items-stretch justify-start gap-[clamp(0.1rem,0.28vw,0.2rem)]"

export const JOB_TABS_ANCHOR_CLASS =
  "pointer-events-auto absolute left-[calc(41%+1.15rem)] top-[clamp(2.35rem,4.1vh,2.65rem)] z-30 max-w-[calc(59%-0.4rem)]"

export const PREVIEW_BODY_CLASS =
  "relative flex min-h-0 flex-1 flex-col items-center justify-end px-[clamp(0.35rem,0.75vw,0.6rem)] pb-[clamp(0.45rem,0.95vh,0.7rem)] pt-[clamp(1.85rem,3.6vh,2.25rem)]"

export const PREVIEW_STAGE_CLASS =
  "relative flex h-[min(100%,28rem)] w-full max-w-[min(100%,24rem)] items-end justify-center"

export const PREVIEW_CARD_STAGE_CLASS =
  "relative flex min-h-0 w-full max-w-[min(100%,24rem)] flex-1 items-center justify-center pb-[clamp(0.35rem,0.75vh,0.55rem)] translate-x-[clamp(0.95rem,3vw,1.9rem)] -translate-y-[clamp(0.35rem,0.85vh,0.55rem)]"

export const PREVIEW_STANDING_WRAP_CLASS =
  "relative flex h-full w-full translate-x-[clamp(1.45rem,3.2vw,2.15rem)] translate-y-[clamp(0.25rem,0.65vh,0.45rem)] items-end justify-center"

export const PREVIEW_AURA_FILTER =
  "[filter:drop-shadow(0_0_8px_rgba(0,0,0,0.78))_drop-shadow(0_0_20px_rgba(0,0,0,0.5))_drop-shadow(0_0_34px_rgba(0,0,0,0.28))_drop-shadow(0_10px_18px_rgba(0,0,0,0.52))]"

export const PREVIEW_STANDING_CLASS =
  "block h-[108%] max-h-none w-auto max-w-none select-none object-contain object-bottom " +
  PREVIEW_AURA_FILTER

export const SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS =
  "[&_p]:!app-text-scaled [--app-text-size:clamp(1.05rem,8.5cqi,1.42rem)]"

export const SKIN_CARD_WEAR_PREVIEW_CARD_WRAP_CLASS =
  "relative w-[clamp(10rem,24vw,14rem)] shrink-0 [container-type:inline-size] " +
  PREVIEW_AURA_FILTER +
  " " +
  SKIN_CARD_WEAR_PREVIEW_NAMEPLATE_TEXT_CLASS

// 미리보기 바꾸기·적용·닫기 버튼
export const VIEW_TOGGLE_WRAP_CLASS =
  "pointer-events-auto absolute right-[clamp(-0.55rem,-0.95vw,-0.32rem)] bottom-0 z-20 translate-y-[clamp(4.05rem,6.8vh,5.25rem)]"

export const VIEW_TOGGLE_BTN_CLASS =
  "group h-[clamp(6.3rem,10.8vw,8.7rem)] w-[clamp(6.3rem,10.8vw,8.7rem)] cursor-pointer border-0 bg-transparent p-0 leading-none"

export const VIEW_TOGGLE_IMG_CLASS =
  "block h-full w-full select-none object-contain transition-transform duration-200 ease-out group-hover:scale-[1.08] group-active:scale-[0.97]"

export const CONFIRM_WRAP_CLASS = "relative shrink-0"

export const CONFIRM_BTN_CLASS =
  "interactive-scale relative block w-[min(100%,14rem)] leading-none"

export const CONFIRM_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.1vw,0.95rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const CONFIRM_BTN_IMG_CLASS = "block h-auto w-full select-none"

export const CLOSE_BTN_CLASS =
  "interactive-scale absolute right-[clamp(0.72rem,2.6vw,1.15rem)] top-[clamp(0.88rem,3.15vh,1.28rem)] z-40 cursor-pointer border-0 bg-transparent p-0 leading-none"

export const CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.75rem,4.8vw,3.35rem)] select-none"

// 미리보기 방식 값
export const SKIN_CARD_WEAR_PREVIEW_MODE_SKIN = "skin"
export const SKIN_CARD_WEAR_PREVIEW_MODE_CARD = "card"
