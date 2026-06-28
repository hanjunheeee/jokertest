/**
 * 인게임 좌측 상단 컨트롤 레이아웃 상수.
 *
 * InGameTopControls에서 위치·버튼 크기·hover 스케일에 사용합니다.
 */

/** 좌측 상단 — 설정·마이크 버튼 묶음 위치 */
export const INGAME_TOP_CONTROLS_POSITION_CLASS =
  "absolute top-[clamp(0.45rem,1.8vh,1.1rem)] left-[clamp(0.45rem,1.4cqw,0.9rem)] z-10 flex items-center gap-[clamp(0.3rem,1cqw,0.55rem)]"

export const INGAME_CONTROL_BTN_CLASS =
  "group shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"

/** interactive-scale-sm보다 약한 hover (1.08) */
export const INGAME_CONTROL_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.45rem,5.2cqw,3.2rem)] select-none transition-transform duration-200 ease-out group-hover:scale-[1.08] group-active:scale-[0.95]"
