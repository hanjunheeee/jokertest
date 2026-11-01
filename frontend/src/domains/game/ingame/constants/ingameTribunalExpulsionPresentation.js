// 재판 추방 연출 상수 (영상 경로·보여 주는 시간·화면 모양)
// 추방 연출 창·추방 연출 훅이 씀

// 추방 영상 경로와 이름 모를 때 쓰는 이름
export const VIDEO_URL = "/bg/게임 추방 연출2.mp4"

export const UNKNOWN_NICKNAME = "한 플레이어"

// 영상 멈춤 → 어두워짐 → 글 자동 닫힘까지 시간 (ms)
export const HOLD_MS = 450

export const FADE_MS = 1600

export const MSG_AUTO_MS = 3200

// 덮개·영상·어두워지는 막·글 모양
export const BACKDROP_CLASS =
  "absolute inset-0 z-[70] flex items-center justify-center bg-black/78 px-4"

export const VIDEO_WRAP_CLASS =
  "relative flex max-h-[80%] max-w-[80%] items-center justify-center"

export const VIDEO_CLASS =
  "block max-h-full max-w-full object-contain"

export const FADE_LAYER_CLASS =
  "pointer-events-none absolute inset-0 bg-black transition-opacity ease-out"

export const MSG_CLASS =
  "max-w-[min(42rem,80%)] px-6 text-center font-display text-[clamp(1.35rem,4.2cqi,2.35rem)] font-bold leading-snug tracking-wide text-[#f8ead2] [text-shadow:0_2px_12px_rgba(0,0,0,0.85)]"

// 추방된 사람 이름 찾기 (못 찾으면 한 플레이어)
export function resolveInGameTribunalExpulsionNickname(players, victimUuid) {
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

// 추방 안내 글
export function buildInGameTribunalExpulsionMessage(nickname) {
  const name =
    typeof nickname === "string" && nickname.length > 0
      ? nickname
      : UNKNOWN_NICKNAME
  return `[${name}]님이 가면무도회에서 추방당하셨습니다.`
}
