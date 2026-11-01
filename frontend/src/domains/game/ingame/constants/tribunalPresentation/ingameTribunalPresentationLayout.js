// 재판 연출 화면 모양: 덮개·카드·투표 버튼·안내 글·채팅 칸
// 재판 연출 화면(Overlay)·재판 채팅 칸(ChatPanel)이 사용

// 겉판·덮개·무대·가로 줄
export const SHELL_CLASS =
  "pointer-events-none absolute inset-0 z-[55]"

export const BACKDROP_CLASS =
  "pointer-events-none absolute inset-0 bg-black/62"

export const STAGE_CLASS =
  "pointer-events-none absolute inset-0 z-[56]"

export const ROW_CLASS =
  "pointer-events-auto absolute inset-0 flex items-center justify-center px-4"

// 왼쪽 피고 카드 줄과 유무죄 버튼
export const CLUSTER_CLASS =
  "flex max-w-full items-center gap-x-9"

export const LEFT_COLUMN_CLASS =
  "flex w-[18rem] shrink-0 flex-col items-center gap-y-4"

export const CARD_WRAP_CLASS =
  "w-full"

export const ACTIONS_CLASS =
  "flex w-full flex-row items-stretch justify-center gap-x-3"

export const ACTION_BTN_CLASS =
  "interactive-scale group relative block w-[7.5rem] max-w-[46%] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:opacity-45"

export const ACTION_BTN_IMG_CLASS =
  "block h-auto w-full select-none"

export const ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[10%] pb-[3%] font-subheading text-[clamp(0.82rem,3.8vw,1.05rem)] font-bold leading-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"

// 안내 글
export const NOTICE_CLASS =
  "pointer-events-none text-center font-subheading text-[clamp(0.78rem,2.8vw,0.95rem)] font-semibold leading-snug text-white/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 재판 판정 버튼 자리(아래 가운데)와 모양
export const DEV_RESOLVE_WRAP_CLASS =
  "pointer-events-auto absolute bottom-[clamp(0.85rem,3vh,1.25rem)] left-1/2 z-[57] -translate-x-1/2"

export const DEV_RESOLVE_BTN_CLASS =
  "min-h-[2.85rem] cursor-pointer rounded-md border border-white/25 bg-black/50 px-6 py-2.5 font-subheading text-[clamp(0.92rem,2.8cqi,1.12rem)] font-semibold leading-tight text-white/75 transition hover:border-white/40 hover:bg-black/65 hover:text-white/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-white/25 disabled:hover:bg-black/50 disabled:hover:text-white/75"

// 채팅이 나뉘어 나오기 전 처음 모습 보여 주는 시간
export const INTRO_HOLD_MS = 1000

// 오른쪽 채팅 칸
export const CHAT_WRAP_CLASS =
  "pointer-events-auto relative w-[34rem] shrink-0"

export const CHAT_PANEL_CLASS =
  "relative w-full [container-type:inline-size]"

// 채팅 칸 폭은 감싸는 칸에 맞춤
export function getChatPanelStyle() {
  return {
    width: "100%",
  }
}
