/** TRIBUNAL GUILTY 추방 연출 — public/bg/게임 추방 연출2.mp4
 *
 * shell은 absolute — ViewportShell 게임 열(.viewport-shell__game) 안에만 깔린다.
 * 영상 크기 80%는 좌우 배너를 제외한 **게임 화면** 기준(뷰포트 vw/svh 아님).
 */

export const INGAME_TRIBUNAL_EXPULSION_VIDEO_URL = "/bg/게임 추방 연출2.mp4"

export const INGAME_TRIBUNAL_EXPULSION_UNKNOWN_NICKNAME = "한 플레이어"

/** 영상 종료 후 마지막 프레임 유지(ms) */
export const INGAME_TRIBUNAL_EXPULSION_HOLD_MS = 450

/** 영상 위 어둡게 페이드아웃(ms) */
export const INGAME_TRIBUNAL_EXPULSION_FADE_MS = 1600

/** 안내 문구 표시 후 자동 종료(ms) — 탭/클릭으로도 종료 */
export const INGAME_TRIBUNAL_EXPULSION_MESSAGE_AUTO_MS = 3200

export const INGAME_TRIBUNAL_EXPULSION_BACKDROP_CLASS =
  "absolute inset-0 z-[70] flex items-center justify-center bg-black/78 px-4"

export const INGAME_TRIBUNAL_EXPULSION_VIDEO_WRAP_CLASS =
  "relative flex max-h-[80%] max-w-[80%] items-center justify-center"

export const INGAME_TRIBUNAL_EXPULSION_VIDEO_CLASS =
  "block max-h-full max-w-full object-contain"

export const INGAME_TRIBUNAL_EXPULSION_FADE_LAYER_CLASS =
  "pointer-events-none absolute inset-0 bg-black transition-opacity ease-out"

export const INGAME_TRIBUNAL_EXPULSION_MESSAGE_CLASS =
  "max-w-[min(42rem,80%)] px-6 text-center font-display text-[clamp(1.35rem,4.2cqi,2.35rem)] font-bold leading-snug tracking-wide text-[#f8ead2] [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]"

export function resolveInGameTribunalExpulsionNickname(players, victimUuid) {
  if (!Array.isArray(players)) return INGAME_TRIBUNAL_EXPULSION_UNKNOWN_NICKNAME
  if (typeof victimUuid !== "string" || victimUuid.length === 0) {
    return INGAME_TRIBUNAL_EXPULSION_UNKNOWN_NICKNAME
  }
  const found = players.find(
    (player) => player !== null && typeof player === "object" && player.uuid === victimUuid,
  )
  if (!found || typeof found.nickname !== "string" || found.nickname.length === 0) {
    return INGAME_TRIBUNAL_EXPULSION_UNKNOWN_NICKNAME
  }
  return found.nickname
}

export function buildInGameTribunalExpulsionMessage(nickname) {
  const name =
    typeof nickname === "string" && nickname.length > 0
      ? nickname
      : INGAME_TRIBUNAL_EXPULSION_UNKNOWN_NICKNAME
  return `[${name}]님이 가면무도회에서 추방당하셨습니다.`
}
