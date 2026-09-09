/**
 * 인게임 설정 패널 레이아웃 — 본문(탭·설정 행) 전용. shell·헤더는 ingameSidePanelLayout.
 */
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

/** 채팅 / 사운드 탭 네비 — 친구목록 탭과 동일 리소스·비율 */
export const INGAME_SETTING_TAB_NAV_CLASS =
  "mb-[clamp(0.45rem,1vh,0.62rem)] flex w-full shrink-0 items-stretch gap-[clamp(0.25rem,0.55vw,0.4rem)]"

export const INGAME_SETTING_TAB_BUTTON_CLASS =
  "interactive-scale relative flex-1 overflow-hidden border-0 bg-transparent p-0 leading-none"

export const INGAME_SETTING_TAB_IMAGE_CLASS =
  "block h-[clamp(1.48rem,2.15vw,1.78rem)] w-full select-none object-fill object-center"

export const INGAME_SETTING_TAB_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.68rem,0.95vw,0.82rem)] font-bold tracking-wide [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const INGAME_SETTING_TAB_LABEL_ACTIVE_CLASS = "text-[#e8f0dc]"

export const INGAME_SETTING_TAB_LABEL_INACTIVE_CLASS = "text-[#ebe2cc]/90"

/** 탭 본문 — 항목 간격, 탭과 동일 가로 폭 */
export const INGAME_SETTING_TAB_BODY_CLASS =
  "flex w-full flex-col gap-[clamp(0.28rem,0.65vh,0.38rem)] pb-[clamp(0.2rem,0.5vh,0.32rem)]"

/** prototype — 슬라이더 행 (고정 min-height로 y축 정렬) */
export const INGAME_SETTING_SLIDER_ROW_PLATE_CLASS =
  "flex w-full min-h-[clamp(2.35rem,5.2vh,2.65rem)] items-center gap-[clamp(0.35rem,1.2vw,0.55rem)] rounded-sm border border-[#3a2818]/75 bg-[#120a06]/50 px-[clamp(0.38rem,1.6%,0.52rem)] py-[clamp(0.22rem,0.55vh,0.3rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

/** prototype — 어두운 반투명 플레이트 행 (체크박스 등) */
export const INGAME_SETTING_ROW_PLATE_CLASS =
  "flex w-full items-center gap-[clamp(0.35rem,1.2vw,0.55rem)] rounded-sm border border-[#3a2818]/75 bg-[#120a06]/50 px-[clamp(0.38rem,1.6%,0.52rem)] py-[clamp(0.28rem,0.72vh,0.38rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const INGAME_SETTING_ROW_LABEL_CLASS =
  "min-w-0 shrink-0 font-subheading text-[clamp(0.72rem,0.95vw,0.86rem)] font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const INGAME_SETTING_SLIDER_ROW_LABEL_CLASS =
  `${INGAME_SETTING_ROW_LABEL_CLASS} flex min-h-[clamp(1.85rem,4vh,2.05rem)] items-center leading-tight`

export const INGAME_SETTING_ROW_VALUE_CLASS =
  "shrink-0 font-subheading text-[clamp(0.78rem,1vw,0.92rem)] font-bold leading-none tabular-nums text-white/90"

export const INGAME_SETTING_SLIDER_WRAP_CLASS =
  "relative flex min-w-0 flex-1 items-center pl-[clamp(0.28rem,0.85vw,0.42rem)]"

export const INGAME_SETTING_SLIDER_CONTROL_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col justify-center"

/** RangeSlider 상단 숫자는 행 우측에 별도 표시 — 접근성용 sr-only */
export const INGAME_SETTING_SLIDER_VALUE_CLASS = "sr-only"

/** 인게임 설정 — 트랙만 얇게, 노브 크기는 공용 유지 */
export const INGAME_SETTING_SLIDER_WRAP_INNER_CLASS =
  "relative flex h-[clamp(1.55rem,2.1vw,1.75rem)] w-full items-center justify-center"

export const INGAME_SETTING_SLIDER_TRACK_LANE_CLASS =
  "relative flex h-full w-[108%] max-w-none translate-x-[1%] items-center"

export const INGAME_SETTING_SLIDER_TRACK_CLASS =
  "pointer-events-none relative z-0 mx-auto block h-[clamp(0.95rem,1.35vw,1.15rem)] w-auto max-h-full max-w-full shrink-0 select-none"

/** 트랙 레인 기준 정중앙 — 공용 knob의 top offset(-0.14rem) 미사용 */
export const INGAME_SETTING_SLIDER_KNOB_CLASS =
  "pointer-events-none absolute top-1/2 z-[1] w-[clamp(1.3rem,1.85vw,1.55rem)] -translate-x-1/2 -translate-y-1/2 select-none"

export const INGAME_SETTING_CHECKBOX_CLASS =
  "relative block w-[clamp(1.35rem,1.85vw,1.55rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0"

/** prototype — 방관리 행 (제목·설명 + 액션 링크 또는 체크박스) */
export const INGAME_SETTING_ROOM_ROW_PLATE_CLASS =
  "flex w-full items-center gap-[clamp(0.35rem,1.2vw,0.55rem)] rounded-sm border border-[#3a2818]/75 bg-[#120a06]/50 px-[clamp(0.38rem,1.6%,0.52rem)] py-[clamp(0.32rem,0.78vh,0.42rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"

export const INGAME_SETTING_ROOM_ROW_TEXT_CLASS =
  "flex min-w-0 flex-1 flex-col gap-[clamp(0.06rem,0.22vh,0.1rem)]"

export const INGAME_SETTING_ROOM_ROW_TITLE_CLASS = INGAME_SETTING_ROW_LABEL_CLASS

export const INGAME_SETTING_ROOM_ROW_DESC_CLASS =
  "font-subheading text-[clamp(0.62rem,0.82vw,0.74rem)] font-medium leading-snug text-[#ebe2cc]/78 [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]"

export const INGAME_SETTING_ROOM_ACTION_LINK_CLASS =
  "interactive-scale shrink-0 cursor-pointer border-0 bg-transparent p-0 font-subheading text-[clamp(0.72rem,0.95vw,0.86rem)] font-bold leading-none text-[#e8f0dc] underline decoration-[#c4a574]/85 decoration-1 underline-offset-[0.18em] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const INGAME_SETTING_ROOM_ACTION_LINK_DANGER_CLASS =
  "interactive-scale shrink-0 cursor-pointer border-0 bg-transparent p-0 font-subheading text-[clamp(0.72rem,0.95vw,0.86rem)] font-bold leading-none text-[#ffb4b4] underline decoration-[#c95555]/90 decoration-1 underline-offset-[0.18em] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const INGAME_SETTING_SCROLL_WRAP_CLASS = "relative min-h-0 flex-1"

export const INGAME_SETTING_SCROLL_CLASS =
  `h-full min-h-0 w-full overflow-y-auto overscroll-contain pr-0.5 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`
