// 밤 관찰 열쇠 만들기, 스냅샷 응답과 겹치는 밤 관찰 찾기 (순수 계산)
// 스냅샷 동기화 훅이 사용 (묻는 사이 그 밤 알림이 오면 응답이 옛 것일 수 있음)
import { parseNightTurnStartedPayload } from "../parseNightTurnStartedPayload.js"

// 판 id·밤 날짜로 만든 관찰 열쇠
export function nightObservationKey(gameId, nightDayIndex) {
  return `${gameId}|${nightDayIndex}`
}

// 연출 대기 알림의 관찰 열쇠 (모양이 꼭 맞을 때만, 아니면 null)
export function readWaitObservationTarget(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (Object.keys(payload).length !== 3) return null
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return null
  if (!Number.isInteger(payload.nightDayIndex) || payload.nightDayIndex < 0) return null
  if (typeof payload.waiting !== "boolean") return null
  return nightObservationKey(payload.gameId, payload.nightDayIndex)
}

// 밤 차례 시작 알림의 관찰 열쇠 (다듬기 통과할 때만, 아니면 null)
export function readTurnStartObservationTarget(payload) {
  const parsed = parseNightTurnStartedPayload({
    payload, gameId: payload?.gameId, dayIndex: payload?.dayIndex,
  })
  if (!parsed) return null
  return nightObservationKey(parsed.gameId, parsed.dayIndex)
}

// 응답한 판(밤이면 그 밤만)의 관찰 수가 묻던 때와 달라졌는지
export function hasNightObservationChanged(book, atRequest, response, requestGameId) {
  const responseGameId = typeof response?.gameId === "string" && response.gameId.length > 0
    ? response.gameId
    : requestGameId
  if (!responseGameId) return false
  const keys = response?.phase === "NIGHT" && Number.isInteger(response?.dayIndex)
    ? [nightObservationKey(responseGameId, response.dayIndex)]
    : [...book.keys()].filter((key) => key.startsWith(`${responseGameId}|`))
  return keys.some((key) => (book.get(key) ?? 0) !== (atRequest.get(key) ?? 0))
}
