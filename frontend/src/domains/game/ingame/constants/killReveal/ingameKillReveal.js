/**
 * 밤 사망 공개 연출(kill reveal) 상수.
 *
 * 문구는 전부 공개 정보만 쓴다 — 누가 죽였는지(살해자 identity)는 어떤 출처에서도 노출하지
 * 않고, JOKER는 "광대들"이라는 진영 단위 표현만 사용한다.
 */

/** 사망 연출 영상 public URL (frontend/public 기준) */
export const INGAME_KILL_ANIMATION_VIDEO_URL = "/assets/ingame/kill-animation.mp4"

/** 닉네임을 찾지 못했을 때 쓰는 대체 표기 — uuid는 절대 화면에 내보내지 않는다. */
export const INGAME_KILL_REVEAL_UNKNOWN_NICKNAME = "한 플레이어"

/** 넘기기 버튼 문구 — 재생 오류·워치독 타임아웃처럼 영상이 멈췄을 때 계속 진행하는 버튼이다. */
export const INGAME_KILL_REVEAL_SKIP_LABEL = "건너뛰기"

/** 다시 재생 버튼 문구 — play() 호출이 reject됐을 때만 노출된다(재생 자체를 다시 시도). */
export const INGAME_KILL_REVEAL_RETRY_LABEL = "다시 재생"

/** 영상 재생/오류와 무관하게 화면이 영원히 막히지 않도록 하는 상한 시간(ms) */
export const INGAME_KILL_REVEAL_FALLBACK_TIMEOUT_MS = 12000

/**
 * 공개 사망 출처별 문구. 알 수 없는 출처는 null을 돌려준다(호출부가 연출을 그리지 않는다).
 */
export function buildInGameKillRevealMessage(source, victimNickname) {
  const nickname =
    typeof victimNickname === "string" && victimNickname.length > 0
      ? victimNickname
      : INGAME_KILL_REVEAL_UNKNOWN_NICKNAME

  if (source === "JOKER") return `광대들이 ${nickname} 님을 죽였습니다.`
  if (source === "WITCH_HUNTER") return `마녀사냥꾼이 ${nickname} 님을 처단했습니다.`
  if (source === "OTHER" || source === "UNKNOWN_NIGHT") return `${nickname} 님이 밤사이 사망했습니다.`
  return null
}

/**
 * 공개 roster에서 희생자 닉네임을 찾는다. 찾지 못하면 "한 플레이어"를 돌려준다 —
 * uuid를 대신 보여주지 않는다.
 */
export function resolveInGameKillRevealNickname(players, victimUuid) {
  if (!Array.isArray(players)) return INGAME_KILL_REVEAL_UNKNOWN_NICKNAME
  if (typeof victimUuid !== "string" || victimUuid.length === 0) {
    return INGAME_KILL_REVEAL_UNKNOWN_NICKNAME
  }
  const found = players.find(
    (player) => player !== null && typeof player === "object" && player.uuid === victimUuid,
  )
  if (!found || typeof found.nickname !== "string" || found.nickname.length === 0) {
    return INGAME_KILL_REVEAL_UNKNOWN_NICKNAME
  }
  return found.nickname
}

/** 오버레이 레이아웃 — DAY/ENDED UI 위를 완전히 덮는 차단 레이어다. */
export const INGAME_KILL_REVEAL_BACKDROP_CLASS =
  "fixed inset-0 z-[70] bg-black/92"

export const INGAME_KILL_REVEAL_PANEL_WRAP_CLASS =
  "fixed inset-0 z-[71] flex flex-col items-center justify-center gap-4 px-[clamp(0.75rem,4vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

export const INGAME_KILL_REVEAL_VIDEO_CLASS =
  "max-h-[62svh] w-[min(48rem,92vw)] rounded border border-[#6b4321]/60 bg-black object-contain shadow-[0_20px_60px_rgba(0,0,0,0.6)]"

export const INGAME_KILL_REVEAL_MESSAGE_CLASS =
  "max-w-[min(48rem,92vw)] text-center font-subheading text-[clamp(1rem,3vw,1.6rem)] font-bold tracking-wide text-[#f8ead2]"

export const INGAME_KILL_REVEAL_SKIP_BUTTON_CLASS =
  "min-h-9 rounded border border-[#d8b982] bg-[#2b1c15] px-5 py-1.5 text-sm font-semibold tracking-wide text-[#f8ead2] transition hover:border-[#f3d28d] hover:bg-[#53321f]"
