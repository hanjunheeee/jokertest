// 스냅샷의 낮 마감 시각·밤 차례 타이머 검사 (순수 계산, 새로고침 뒤 타이머 이어 가기용)
// 틀리면 BAD (utils/snapshot/applySnapshot.js가 사용)
import { KNOWN_NIGHT_TURN_ROLES } from "../nightTurn.js"
import { BAD } from "./checks.js"

const EMPTY_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

// 낮 마감 시각: 낮에만 올 수 있고 값이 맞아야 함 (없으면 null)
function readDayPhaseDeadline(response) {
  if (!Object.hasOwn(response, "dayPhaseDeadline")) return null
  if (response.phase !== "DAY") return BAD
  if (!Number.isFinite(response.dayPhaseDeadline) || response.dayPhaseDeadline <= 0) return BAD
  return response.dayPhaseDeadline
}

// 밤 차례 타이머: 밤에만 올 수 있고, 역할·마감은 같이 오거나 같이 없어야 함
function readNightTurnTimer(response, currentState) {
  const hasRole = Object.hasOwn(response, "nightTurnRole")
  const hasDeadline = Object.hasOwn(response, "nightTurnDeadline")
  if (response.phase !== "NIGHT") return hasRole || hasDeadline ? BAD : EMPTY_NIGHT_TURN

  // 실려 왔으면 아는 직업·맞는 마감 시각이어야 함
  if (hasRole || hasDeadline) {
    if (hasRole !== hasDeadline) return BAD
    if (typeof response.nightTurnRole !== "string" || !KNOWN_NIGHT_TURN_ROLES.has(response.nightTurnRole)) return BAD
    if (!Number.isFinite(response.nightTurnDeadline) || response.nightTurnDeadline <= 0) return BAD
    return { nightTurnRole: response.nightTurnRole, nightTurnDeadline: response.nightTurnDeadline }
  }

  // 칸 없는 옛 스냅샷·묻는 사이 차례 방송만 받은 화면: 같은 밤이면 지금 차례 시계를 안 지움
  if (currentState?.phase === "NIGHT" && currentState.dayIndex === response.dayIndex) {
    return {
      nightTurnRole: currentState.nightTurnRole ?? null,
      nightTurnDeadline: currentState.nightTurnDeadline ?? null,
    }
  }
  return EMPTY_NIGHT_TURN
}

// 낮 마감 시각 + 밤 차례 역할·마감 (하나라도 틀리면 BAD)
export function readTimerFields(response, currentState) {
  const dayPhaseDeadline = readDayPhaseDeadline(response)
  if (dayPhaseDeadline === BAD) return BAD
  const nightTurn = readNightTurnTimer(response, currentState)
  if (nightTurn === BAD) return BAD
  return { dayPhaseDeadline, ...nightTurn }
}
