// 신고 창·신고 버튼 모양 (데스크톱): 틀은 추방 창(투표 창 틀) 것을 그대로 빌림, 사유·메모·버튼 줄만 더함
// components/ReportDialog·ReportRowButton이 씀
export {
  getInGameKickPlayerPanelStyle as getReportPanelStyle,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_CLASS as CLOSE_BTN_CLASS,
  INGAME_KICK_PLAYER_MODAL_CLOSE_BTN_IMG_CLASS as CLOSE_BTN_IMG_CLASS,
  INGAME_KICK_PLAYER_MODAL_FRAME_IMAGE_CLASS as FRAME_IMG_CLASS,
  INGAME_KICK_PLAYER_MODAL_INNER_CLASS as PANEL_INNER_CLASS,
  INGAME_KICK_PLAYER_MODAL_INSET as PANEL_INSET,
  INGAME_KICK_PLAYER_MODAL_TITLE_CLASS as TITLE_CLASS,
  MODAL_BACKDROP_CLASS as BACKDROP_CLASS,
  MODAL_NOTICE_CLASS as NOTICE_CLASS,
  MODAL_SUBTITLE_CLASS as SUBTITLE_CLASS,
  MODAL_WRAP_CLASS as WRAP_CLASS,
} from "@/domains/game/ingame/constants/controls/kickPlayer/ingameKickPlayerLayout.js"

// 결과 화면 위에도 뜨게 추방 창보다 한 층 위
export const SHELL_CLASS = "fixed inset-0 z-[60]"

// 대상 이름
export const TARGET_CLASS =
  "mb-2 shrink-0 truncate text-center font-subheading app-text-scaled [--app-text-size:clamp(0.9rem,3cqi,1.1rem)] font-bold leading-tight text-[#f5e8c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 사유 네 칸 (고른 칸은 밝은 테두리)
export const REASON_GRID_CLASS = "mb-2 grid shrink-0 grid-cols-4 gap-[clamp(0.25rem,1cqi,0.4rem)]"
export const REASON_BTN_CLASS =
  "min-h-[2.4rem] cursor-pointer rounded-sm border bg-[#120a06]/55 px-1 font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,2.2cqi,0.85rem)] font-bold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] disabled:cursor-default disabled:opacity-70"
export const REASON_ON_CLASS = "border-[#f3d28d] bg-[#3a1410]/80 text-[#f5e8c8]"
export const REASON_OFF_CLASS = "border-[#3a2818]/75"

// 메모 칸
export const MEMO_CLASS =
  "mb-1 min-h-[4.2rem] w-full shrink-0 resize-none rounded-sm border border-[#3a2818]/75 bg-[#120a06]/70 p-2 font-subheading app-text-scaled [--app-text-size:clamp(0.7rem,2.2cqi,0.85rem)] leading-snug text-white outline-none placeholder:text-white/40 focus-visible:border-[#f3d28d]"
export const MEMO_COUNT_CLASS = "mb-1 shrink-0 text-right font-subheading app-text-scaled [--app-text-size:0.7rem] text-white/55 tabular-nums"

// 안내·오류 글
export const MESSAGE_CLASS = "mb-1 shrink-0 text-center font-subheading app-text-scaled [--app-text-size:clamp(0.66rem,2cqi,0.8rem)] font-bold leading-snug"
export const MESSAGE_OK_CLASS = "text-[#e8f0dc]"
export const MESSAGE_ERROR_CLASS = "text-[#ffb3a7]"

// 아래 버튼 둘 (그림 깔고 글자)
export const ACTIONS_CLASS = "mt-auto grid shrink-0 grid-cols-2 gap-[clamp(0.35rem,1.4cqi,0.6rem)]"
export const ACTION_BTN_CLASS =
  "interactive-scale group relative block w-full cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-default disabled:opacity-80"
export const ACTION_BTN_IMG_CLASS = "block h-[2.6rem] w-full select-none object-fill"
export const ACTION_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center px-[8%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,2.3cqi,0.9rem)] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 줄 안 작은 신고 버튼 (추방 줄 버튼 그림)
export const ROW_BTN_CLASS =
  "interactive-scale group relative block w-[4.2rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none disabled:cursor-default disabled:opacity-75"
export const ROW_BTN_IMG_CLASS = "block h-[1.9rem] w-full select-none object-fill"
export const ROW_BTN_LABEL_CLASS =
  "pointer-events-none absolute inset-0 flex items-center justify-center text-center font-subheading app-text-scaled [--app-text-size:0.72rem] font-bold leading-none text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
