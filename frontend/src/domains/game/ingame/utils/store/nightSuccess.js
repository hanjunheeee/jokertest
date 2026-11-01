// 밤 성공 연출 알림 검사·대기열 항목 만들기·받을 수 있는 시점 판단 (순수 계산)
// store/ingame/nightSuccessReception.js와 액션 묶음이 사용
import {
  NIGHT_SUCCESS_PERSPECTIVES,
  NIGHT_SUCCESS_TYPES,
} from "../../constants/store/ingameStore.js"

// 알림 모양 검사: 판·사건 id·밤 날짜·종류, 시점은 겹치지 않게 하나 이상
export function isValidSuccess(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return false
  if (typeof payload.eventId !== "string" || payload.eventId.length === 0) return false
  if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return false
  if (!NIGHT_SUCCESS_TYPES.has(payload.type)) return false
  if (!Array.isArray(payload.perspectives) || payload.perspectives.length === 0) return false
  const seen = new Set()
  for (const perspective of payload.perspectives) {
    if (!NIGHT_SUCCESS_PERSPECTIVES.has(perspective)) return false
    if (seen.has(perspective)) return false
    seen.add(perspective)
  }
  // 쓴 사람 시점이면 대상 id가 꼭 있어야 함
  if (payload.perspectives.includes("USER")) {
    if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return false
  }
  return true
}

// 대기열 항목 만들기 (쓴 사람 시점일 때만 대상 id 넣음, 얼려서 돌려줌)
export function buildQueueEntry(payload) {
  const entry = {
    eventId: payload.eventId,
    gameId: payload.gameId,
    nightDayIndex: payload.nightDayIndex,
    type: payload.type,
    perspectives: [...payload.perspectives],
  }
  if (payload.perspectives.includes("USER")) entry.targetId = payload.targetId
  return Object.freeze(entry)
}

// 새 밤에 들어서는 순간인지 (같은 밤 안에서 다시 오면 아님)
export function entersNewNight(before, after) {
  if (after?.phase !== "NIGHT") return false
  if (before?.phase === "NIGHT" && before?.dayIndex === after?.dayIndex) return false
  return true
}

// 그 밤 연출을 지금 받을 수 있는지
// 실시간은 그 밤 안에서만, 복구는 다음 낮·재판까지 허용
export function isSuccessWindowOpen(state, nightDayIndex, restore) {
  const phase = state?.phase ?? null
  const dayIndex = state?.dayIndex ?? null
  if (phase === "NIGHT") return dayIndex === nightDayIndex
  if (restore === null) return false
  if (phase === "DAY" || phase === "TRIBUNAL") return dayIndex === nightDayIndex + 1
  return false
}
