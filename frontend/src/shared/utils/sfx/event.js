// 효과음 플레이어가 쓰는 순수 계산 (요청 검사·막힘 응답·중복 키·음량 계산)
// shared/audio/player/ 아래 파일이 씀
import { SFX_COMPLETION } from "../../constants/sfx.js"

// 막힌 요청은 모두 같은 '멈춤' 완료 약속을 돌려줌
const SETTLED_STOPPED = Promise.resolve(SFX_COMPLETION.STOPPED)

export function suppressed(reason) {
  return { status: "suppressed", reason, completion: SETTLED_STOPPED }
}

// 바깥 함수가 던져도 플레이어는 멈추지 않게 대체값을 돌려줌
export function guard(fn, fallback) {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// 숫자가 아니면 0, 0~100 밖이면 끝값으로 자름
function clampPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

// 빈 문자열·문자열 아닌 값은 null로 바꿈
export function pickId(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

// 요청 모양 검사, 틀리면 null (origin·audioMode는 정해진 값만 받음)
export function validateEvent(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) return null
  const { kind, eventId } = event
  if (typeof kind !== "string" || kind.trim().length === 0) return null
  if (typeof eventId !== "string" || eventId.trim().length === 0) return null

  const origin = event.origin === "restore" ? "restore" : event.origin === "live" ? "live" : null
  if (origin === null) return null

  const audioMode =
    event.audioMode === "embedded" ? "embedded" : event.audioMode === undefined || event.audioMode === "separate" ? "separate" : null
  if (audioMode === null) return null

  return {
    kind,
    eventId,
    origin,
    audioMode,
    accountId: pickId(event.accountId),
    gameId: pickId(event.gameId),
    roomId: pickId(event.roomId),
  }
}

// 이미 낸 소리인지 가리는 키, 끝에 '|'를 붙여 판·방 조각으로 지울 수 있게 함
export function buildKey(prefix, event) {
  return `${prefix}|${event.kind}|${event.eventId}|`
}

// 설정값으로 마스터×효과음 음량과 음소거 계산
export function mixFrom(settings) {
  const master = clampPercent(settings.masterVolume) / 100
  const sfx = clampPercent(settings.sfxVolume) / 100
  const muted = settings.sfxMuted === true
  const gain = master * sfx
  return { gain: muted ? 0 : gain, muted }
}
