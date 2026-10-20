/**
 * 인게임 화면 우측 하단 — 투표 현황·기권·건너뛰기 버튼 배치.
 *
 * prototype: timebar 아래가 아니라 테이블 우측 하단(촛대 근처)에 가로로 나란히 둔다.
 */

/** 우측 하단 고정 래퍼 — timebar와 같은 right 정렬 */
export const INGAME_CORNER_ACTION_PANEL_CLASS =
  "pointer-events-auto absolute bottom-[clamp(1.25rem,3.6vh,2rem)] right-[clamp(0.35rem,1.2vw,0.85rem)] z-10 flex items-end justify-end gap-[clamp(0.35rem,1.1vw,0.65rem)] [container-type:inline-size]"

/** 이미지 버튼 공통 — timebar 아래보다 한 단계 크게 */
export const INGAME_CORNER_ACTION_BTN_CLASS =
  "interactive-scale group relative block w-[clamp(7.2rem,22vw,9.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:opacity-45"

/** flex 줄에서 버튼 폭이 img 로드 전·실패 후에도 유지되도록 감싼다(투표 현황과 동일). */
export const INGAME_CORNER_ACTION_BTN_WRAP_CLASS = "relative shrink-0"

export const INGAME_CORNER_ACTION_BTN_IMG_CLASS =
  "block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.05] group-active:scale-[0.96] group-disabled:hover:scale-100 group-disabled:active:scale-100"

/** 우측 하단 행동 버튼(투표 현황·기권·건너뛰기) 공통 라벨 — 크게·조금 아래 */
export const INGAME_CORNER_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] pb-[4%] text-center font-subheading text-[clamp(0.82rem,4.1cqi,1.05rem)] font-bold leading-tight text-white translate-y-[clamp(0.18rem,1.05cqi,0.3rem)] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

/** 투표 현황 — 같은 줄·같은 크기 */
export const INGAME_CORNER_VOTE_TOGGLE_WRAP_CLASS = INGAME_CORNER_ACTION_BTN_WRAP_CLASS

export const INGAME_CORNER_VOTE_TOGGLE_BTN_CLASS = INGAME_CORNER_ACTION_BTN_CLASS

export const INGAME_CORNER_VOTE_TOGGLE_BTN_IMG_CLASS = INGAME_CORNER_ACTION_BTN_IMG_CLASS

export const INGAME_CORNER_VOTE_TOGGLE_BTN_LABEL_CLASS = INGAME_CORNER_ACTION_BTN_LABEL_CLASS
