/**
 * 플레이어별 전적목록 패널 레이아웃.
 *
 * 로비 FriendListPanel과 동일 프레임·inset — 좌측 슬라이드 (햄버거 버튼 근처)
 */
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"

export const INGAME_PLAYER_RECORD_LIST_PANEL_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1],
}

/** FriendListPanel PANEL_CLASS — right → left 미러 */
export const INGAME_PLAYER_RECORD_LIST_PANEL_CLASS =
  "absolute left-0 top-[2.5%] bottom-[clamp(7.5rem,13vh,10.5rem)] z-30 w-[clamp(17.5rem,22.5vw,25.5rem)] max-w-[26rem] sm:bottom-[clamp(8rem,14vh,11rem)]"

/** FriendListPanel PANEL_INSET — 내부 콘텐츠 영역 (추후 전적 목록 배치) */
export const INGAME_PLAYER_RECORD_LIST_PANEL_INSET = {
  paddingTop: "clamp(4rem, 17%, 5.3rem)",
  paddingBottom: "clamp(2.75rem, 11%, 3.5rem)",
  paddingLeft: "10.5%",
  paddingRight: "10.5%",
}

export const INGAME_PLAYER_RECORD_LIST_FRAME_IMAGE_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full select-none object-fill"

export const INGAME_PLAYER_RECORD_LIST_BACKDROP_CLASS =
  "absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"

/** 패널 프레임 우상단 — 팝업 닫기 */
export const INGAME_PLAYER_RECORD_LIST_CLOSE_BTN_CLASS =
  "interactive-scale absolute top-[clamp(1.35rem,7.5%,1.85rem)] right-[clamp(0.35rem,2.4%,0.72rem)] z-40 border-0 bg-transparent p-0 leading-none"

export const INGAME_PLAYER_RECORD_LIST_CLOSE_BTN_IMG_CLASS =
  "block h-auto w-[clamp(2.6rem,3.95vw,3.2rem)] select-none"

/** 헤더 — 탑레벨 프레임 + 타이틀 */
export const INGAME_PLAYER_RECORD_LIST_HEADER_WRAP_CLASS =
  "relative mb-[clamp(0.45rem,1.2vh,0.65rem)] w-full shrink-0"

export const INGAME_PLAYER_RECORD_LIST_HEADER_PLATE_CLASS =
  "block h-auto w-full select-none"

export const INGAME_PLAYER_RECORD_LIST_HEADER_TITLE_CLASS =
  "pointer-events-none absolute inset-0 flex items-start justify-center px-[12%] pt-[3.8%] font-display text-[clamp(1.18rem,1.72vw,1.45rem)] font-medium leading-none tracking-normal text-[#f5f0e6] antialiased [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

export const INGAME_PLAYER_RECORD_LIST_HEADER_SUBTITLE_CLASS =
  "mt-[clamp(0.42rem,1vh,0.58rem)] text-center font-subheading text-[clamp(0.62rem,0.9vw,0.76rem)] leading-snug font-bold text-[#1a1008]"

/** 스크롤 목록 래퍼 — Scrollbar 오버레이 기준 */
export const INGAME_PLAYER_RECORD_LIST_SCROLL_WRAP_CLASS =
  "relative min-h-0 flex-1"

/** 스크롤 목록 — 네이티브 스크롤바 숨김, shared Scrollbar와 함께 사용 */
export const INGAME_PLAYER_RECORD_LIST_SCROLL_CLASS =
  `h-full min-h-0 overflow-y-auto overscroll-contain pr-[clamp(1.15rem,2vw,1.55rem)] ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

/** 행 — prototype 금속 플레이트 느낌 (별도 row 프레임 에셋 없음) */
export const INGAME_PLAYER_RECORD_LIST_ROW_CLASS =
  "relative mt-[clamp(0.28rem,0.75vh,0.42rem)] w-full list-none first:mt-0"

export const INGAME_PLAYER_RECORD_LIST_ROW_INNER_CLASS =
  "flex items-center gap-[clamp(0.35rem,0.75vw,0.55rem)] rounded-sm border border-[#3a2818]/80 bg-[#120a06]/55 px-[clamp(0.4rem,2%,0.55rem)] py-[clamp(0.32rem,0.85vh,0.45rem)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"

export const INGAME_PLAYER_RECORD_LIST_PROFILE_WRAP_CLASS =
  "relative size-[clamp(3.2rem,3.6vw,3.8rem)] shrink-0"

export const INGAME_PLAYER_RECORD_LIST_PROFILE_FRAME_CLASS =
  "pointer-events-none absolute inset-0 z-[2] h-full w-full select-none object-contain"

/** 프로필 우측 — 칭호 → (닉네임 | 전적) 가로 배치 */
export const INGAME_PLAYER_RECORD_LIST_INFO_CLASS =
  "flex min-w-0 flex-1 flex-col justify-center gap-[clamp(0.1rem,0.3vh,0.16rem)] pt-[clamp(0.22rem,0.6vh,0.38rem)]"

export const INGAME_PLAYER_RECORD_LIST_NAME_ROW_CLASS =
  "flex min-w-0 items-center gap-[clamp(0.35rem,0.65vw,0.5rem)]"

export const INGAME_PLAYER_RECORD_LIST_NAME_CLASS =
  "min-w-0 flex-1 truncate font-subheading text-[clamp(0.92rem,1.18vw,1.08rem)] font-bold leading-tight text-white"

export const INGAME_PLAYER_RECORD_LIST_STATS_CLASS =
  "shrink-0 truncate font-subheading text-[clamp(0.78rem,1.02vw,0.92rem)] font-bold leading-none text-white/55 tabular-nums"

export const INGAME_PLAYER_RECORD_LIST_TITLE_WRAP_CLASS =
  "relative mb-[clamp(0.06rem,0.2vh,0.12rem)] w-[clamp(5.5rem,52%,7.2rem)] max-w-full shrink-0 self-start"

export const INGAME_PLAYER_RECORD_LIST_TITLE_FRAME_CLASS =
  "block h-[clamp(1.28rem,1.85vw,1.55rem)] w-full select-none object-fill object-center"

export const INGAME_PLAYER_RECORD_LIST_TITLE_TEXT_CLASS =
  "pointer-events-none absolute inset-[16%_12%_18%_12%] flex items-center justify-center whitespace-nowrap text-center font-subheading text-[clamp(0.5rem,0.68vw,0.6rem)] font-bold leading-tight text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
