// 사망 공개 상수 (기본 이름·건너뛰기·다시 재생 표시·연출 모양)
// 밤 성공 사망 영상(useNightSuccessKillVideo)이 씀 (사망 공개 줄 세우기 훅은 안 써서 지움)

// 기본 이름·건너뛰기 글·다시 재생 표시 속성
export const UNKNOWN_NICKNAME = "한 플레이어"

export const INGAME_KILL_REVEAL_SKIP_LABEL = "건너뛰기"

export const INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR = "data-ingame-kill-reveal-retry"

// 영상이 안 끝날 때 넘어가는 시간
export const INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS = 12000

// 사망 연출 덮개·영상·캔버스·글·건너뛰기 버튼 모양
export const REVEAL_BACKDROP_CLASS =
  "fixed inset-0 z-[70] bg-black/92"

export const REVEAL_PANEL_WRAP_CLASS =
  "fixed inset-0 z-[71] flex flex-col items-center justify-center gap-4 px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

export const VIDEO_CLASS =
  "max-h-[62svh] w-[min(48rem,92vw)] rounded border border-[#6b4321]/60 bg-black object-contain shadow-[0_20px_60px_rgba(0,0,0,0.6)]"

export const MSG_CLASS =
  "max-w-[min(48rem,92vw)] text-center font-subheading text-[clamp(1rem,3vw,1.6rem)] font-bold tracking-wide text-[#f8ead2]"

export const REVEAL_SKIP_BTN_CLASS =
  "min-h-9 rounded border border-[#d8b982] bg-[#2b1c15] px-5 py-1.5 text-sm font-semibold tracking-wide text-[#f8ead2] transition hover:border-[#f3d28d] hover:bg-[#53321f]"
