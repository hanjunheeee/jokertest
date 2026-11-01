// 밤 사망 연출 상수와 안내 문구 만들기 (영상 경로·건너뛰기·대체 시간·피해자 이름)
// 사망 연출 훅·밤 성공 사망 영상이 씀
export const ANIM_VIDEO_URL = "/video-direction/night-success-kill-target-stacked.mp4"

export const UNKNOWN_NICKNAME = "한 플레이어"

export const INGAME_KILL_REVEAL_SKIP_LABEL = "건너뛰기"

export const INGAME_KILL_REVEAL_RETRY_SURFACE_ATTR = "data-ingame-kill-reveal-retry"

export const INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS = 12000

export const TRIBUNAL_SOURCE = "TRIBUNAL"

export function buildRevealMsg(source, victimNickname) {
  const nickname =
    typeof victimNickname === "string" && victimNickname.length > 0
      ? victimNickname
      : UNKNOWN_NICKNAME

  if (source === "JOKER") return `광대들이 ${nickname} 님을 죽였습니다.`
  if (source === "WITCH_HUNTER") return `마녀사냥꾼이 ${nickname} 님을 처단했습니다.`
  if (source === "OTHER" || source === "UNKNOWN_NIGHT") return `${nickname} 님이 밤사이 사망했습니다.`
  if (source === TRIBUNAL_SOURCE) return `${nickname} 님이 처형되었습니다.`
  return null
}

export function resolveRevealNickname(players, victimUuid) {
  if (!Array.isArray(players)) return UNKNOWN_NICKNAME
  if (typeof victimUuid !== "string" || victimUuid.length === 0) {
    return UNKNOWN_NICKNAME
  }
  const found = players.find(
    (player) => player !== null && typeof player === "object" && player.uuid === victimUuid,
  )
  if (!found || typeof found.nickname !== "string" || found.nickname.length === 0) {
    return UNKNOWN_NICKNAME
  }
  return found.nickname
}

export const REVEAL_BACKDROP_CLASS =
  "fixed inset-0 z-[70] bg-black/92"

export const REVEAL_PANEL_WRAP_CLASS =
  "fixed inset-0 z-[71] flex flex-col items-center justify-center gap-4 px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

export const VIDEO_CLASS =
  "max-h-[62svh] w-[min(48rem,92vw)] rounded border border-[#6b4321]/60 bg-black object-contain shadow-[0_20px_60px_rgba(0,0,0,0.6)]"

export const CANVAS_CLASS =
  "max-h-[62svh] w-[min(48rem,92vw)] rounded border border-[#6b4321]/60 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"

export const MSG_CLASS =
  "max-w-[min(48rem,92vw)] text-center font-subheading text-[clamp(1rem,3vw,1.6rem)] font-bold tracking-wide text-[#f8ead2]"

export const REVEAL_SKIP_BTN_CLASS =
  "min-h-9 rounded border border-[#d8b982] bg-[#2b1c15] px-5 py-1.5 text-sm font-semibold tracking-wide text-[#f8ead2] transition hover:border-[#f3d28d] hover:bg-[#53321f]"
