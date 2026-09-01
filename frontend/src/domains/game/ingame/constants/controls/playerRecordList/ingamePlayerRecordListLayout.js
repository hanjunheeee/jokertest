/**
 * 플레이어별 전적목록 패널 레이아웃 — 목록 본문 전용. shell·헤더는 ingameSidePanelLayout.
 */
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

/** 스크롤 목록 래퍼 — Scrollbar 오버레이 기준 */
export const INGAME_PLAYER_RECORD_LIST_SCROLL_WRAP_CLASS =
  "relative min-h-0 flex-1"

/** 스크롤 목록 — 네이티브 스크롤바 숨김, shared Scrollbar와 함께 사용 */
export const INGAME_PLAYER_RECORD_LIST_SCROLL_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain pr-[clamp(1.15rem,2vw,1.55rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

/** 행 — 플레이트 없이 얇은 구분선으로 구분 */
export const INGAME_PLAYER_RECORD_LIST_ROW_CLASS =
  "relative w-full list-none border-b border-[#3a2818]/70 py-[clamp(0.38rem,0.9vh,0.52rem)] last:border-b-0"

export const INGAME_PLAYER_RECORD_LIST_ROW_INNER_CLASS =
  "flex items-center gap-[clamp(0.45rem,0.9vw,0.65rem)]"

/** 원형 프로필 사진 + shopItem 프로필프레임 테두리 */
export const INGAME_PLAYER_RECORD_LIST_PROFILE_PORTRAIT_WRAP_CLASS =
  "relative size-[clamp(3.2rem,3.6vw,3.8rem)] shrink-0 select-none"

/** 프레임 안 프로필 사진 — 크기·세로 위치만 조정 (테두리는 고정) */
export const INGAME_PLAYER_RECORD_LIST_PROFILE_PORTRAIT_PHOTO_WRAP_CLASS =
  "absolute left-1/2 top-[46%] z-[1] aspect-square w-[67%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"

/** 프로필 우측 — 닉네임 위, 전적 아래 */
export const INGAME_PLAYER_RECORD_LIST_INFO_CLASS =
  "flex min-w-0 flex-1 flex-col justify-center"

export const INGAME_PLAYER_RECORD_LIST_NAME_ROW_CLASS =
  "flex min-w-0 flex-col gap-[clamp(0.12rem,0.35vh,0.2rem)]"

export const INGAME_PLAYER_RECORD_LIST_NAME_CLASS =
  "min-w-0 truncate font-display text-[clamp(0.92rem,1.18vw,1.08rem)] font-medium leading-tight tracking-normal text-white antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const INGAME_PLAYER_RECORD_LIST_STATS_CLASS =
  "min-w-0 truncate font-subheading text-[clamp(0.78rem,1.02vw,0.92rem)] font-bold leading-none text-white/55 tabular-nums"