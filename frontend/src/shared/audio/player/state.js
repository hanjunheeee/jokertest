// 효과음 플레이어 하나가 함께 쓰는 상태와 무음 기록
// sfxPlayer.js가 만들고 player/ 아래 파일이 같은 상태를 읽고 바꿈
import { guard } from "../../utils/sfx/event.js"

// 무음 기록은 최근 것만 남김
const SILENCE_LOG_LIMIT = 200

// 바깥 연결(io)을 풀고 기본 시계·타이머를 채운 뒤 빈 상태를 만듦
export function createState(io) {
  const {
    manifest,
    getSettings,
    subscribeSettings,
    getScope,
    loadAsset,
    createMedia,
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
    onSilence,
  } = io ?? {}

  const ctx = {
    manifest,
    getSettings,
    subscribeSettings,
    getScope,
    loadAsset,
    createMedia,
    now,
    setTimer,
    clearTimer,

    disposed: false,
    // 계정·판·방이 바뀔 때마다 올려서 늦게 온 로드 결과를 버림
    generation: 0,
    handled: new Map(),
    active: null,
    lastUiPlayAt: Number.NEGATIVE_INFINITY,
    mixListeners: new Set(),
    embeddedClaims: new Set(),
    silenceLog: [],
    lastScope: null,
    currentMix: null,
  }

  // 소리를 안 낸 이유를 남기고 바깥 감시 함수에도 알림
  ctx.record = (reason, event, extra) => {
    const entry = { reason, kind: event?.kind ?? null, eventId: event?.eventId ?? null, at: guard(now, 0), ...extra }
    ctx.silenceLog.push(entry)
    if (ctx.silenceLog.length > SILENCE_LOG_LIMIT) ctx.silenceLog.shift()
    if (typeof onSilence === "function") guard(() => onSilence(entry), undefined)
  }

  return ctx
}
