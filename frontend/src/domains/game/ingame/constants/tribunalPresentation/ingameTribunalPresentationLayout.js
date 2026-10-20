/** 최후의 반론(TRIBUNAL) — 피고 카드·유/무죄 버튼 전용 전면 연출
 *
 * shell은 absolute — ViewportShell 게임 열(.viewport-shell__game) 안에만 깔린다.
 * 폭은 rem 고정( cqw/min() 조합은 컨테이너 없을 때 0으로 붕괴할 수 있음 ).
 */

export const INGAME_TRIBUNAL_PRESENTATION_SHELL_CLASS =
  "pointer-events-none absolute inset-0 z-[55]"

export const INGAME_TRIBUNAL_PRESENTATION_BACKDROP_CLASS =
  "pointer-events-none absolute inset-0 bg-black/62"

export const INGAME_TRIBUNAL_PRESENTATION_STAGE_CLASS =
  "pointer-events-none absolute inset-0 z-[56]"

/** intro·split 공통 — 화면 중앙 정렬 */
export const INGAME_TRIBUNAL_PRESENTATION_ROW_CLASS =
  "pointer-events-auto absolute inset-0 flex items-center justify-center px-4"

/** split — 카드·채팅을 붙여서 한 덩어리로 배치 */
export const INGAME_TRIBUNAL_PRESENTATION_CLUSTER_CLASS =
  "flex max-w-full items-center gap-x-9"

/** intro·split 공통 — 카드 영역 크기 동일 */
export const INGAME_TRIBUNAL_PRESENTATION_LEFT_COLUMN_CLASS =
  "flex w-[18rem] shrink-0 flex-col items-center gap-y-4"

export const INGAME_TRIBUNAL_PRESENTATION_CARD_WRAP_CLASS =
  "w-full"

export const INGAME_TRIBUNAL_PRESENTATION_ACTIONS_CLASS =
  "flex w-full flex-row items-stretch justify-center gap-x-3"

export const INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_CLASS =
  "interactive-scale group relative block w-[7.5rem] max-w-[46%] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:opacity-45"

export const INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_IMG_CLASS =
  "block h-auto w-full select-none"

export const INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] pb-[3%] font-subheading text-[clamp(0.82rem,3.8vw,1.05rem)] font-bold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

export const INGAME_TRIBUNAL_PRESENTATION_NOTICE_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.78rem,2.8vw,0.95rem)] font-semibold leading-snug text-white/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

/** DEV 임시 — 연출 화면 하단 재판 판정(카드·투표와 무관, 개발 끝나면 삭제) */
export const INGAME_TRIBUNAL_PRESENTATION_DEV_RESOLVE_WRAP_CLASS =
  "pointer-events-auto absolute bottom-[clamp(0.85rem,3vh,1.25rem)] left-1/2 z-[57] -translate-x-1/2"

export const INGAME_TRIBUNAL_PRESENTATION_DEV_RESOLVE_BTN_CLASS =
  "min-h-[2.85rem] cursor-pointer rounded-md border border-white/25 bg-black/50 px-6 py-2.5 font-subheading text-[clamp(0.92rem,2.8cqi,1.12rem)] font-semibold leading-tight text-white/75 transition hover:border-white/40 hover:bg-black/65 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/25 disabled:hover:bg-black/50 disabled:hover:text-white/75"

/** intro(중앙 슬램) → split(좌 카드·우 채팅) 전환까지 대기(ms) */
export const INGAME_TRIBUNAL_PRESENTATION_INTRO_HOLD_MS = 1000

export const INGAME_TRIBUNAL_PRESENTATION_CHAT_WRAP_CLASS =
  "pointer-events-auto relative w-[34rem] shrink-0"

export const INGAME_TRIBUNAL_PRESENTATION_CHAT_PANEL_CLASS =
  "relative w-full [container-type:inline-size]"

/** split 레이아웃 채팅 — 보드·전체 클로즈업 중간 크기 */
export function getInGameTribunalPresentationChatPanelStyle() {
  return {
    width: "100%",
  }
}
