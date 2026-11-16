// 스냅샷의 낮 마감 시각·밤 차례 타이머·재판 마감·5초 당김 표시 검사 (순수 계산, 새로고침 뒤 타이머 이어 가기용)
// 틀리면 BAD (utils/snapshot/applySnapshot.js가 사용)
import { KNOWN_NIGHT_TURN_ROLES } from "../nightTurn.js"
import { BAD, isPlainObject } from "./checks.js"

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

// 재판 마감 시각: 재판 중에만 씀, 틀린 값이면 버림 (스냅샷 전체를 버리진 않음)
function readTribunalDeadline(response, currentState) {
  if (response.phase !== "TRIBUNAL") return null
  const deadline = response.tribunalDeadline
  if (Number.isFinite(deadline) && deadline > 0) return deadline
  // 칸이 없으면 같은 날 재판 중 받아 둔 값 유지
  if (currentState?.phase === "TRIBUNAL" && currentState.dayIndex === response.dayIndex) {
    return currentState.tribunalDeadline ?? null
  }
  return null
}

// 5초 당김이 있는 단계와 그 단계 마감 칸 (서버가 표시의 deadline을 이 칸과 같은 값으로 실음)
const SETTLE_DEADLINE_KEYS = Object.freeze({ DAY: "dayPhaseDeadline", TRIBUNAL: "tribunalDeadline", NIGHT: "nightTurnDeadline" })

// 5초 당김 표시: 지금 단계·날짜·밤 차례 직업·마감과 다 같을 때만 받음 (새로고침해도 "[5초 뒤 마감]" 글·시간 바 펼침이 살아남게)
// 없거나 안 맞으면 null, 그 칸만 버림 (스냅샷 전체를 버리진 않음)
// 예: { phase: "NIGHT", dayIndex: 2, role: "JOKER", deadline: 1763280005000 } (낮·재판은 role null)
function readPhaseSettle(response, timer) {
  const raw = response.phaseSettle
  if (!isPlainObject(raw)) return null
  if (!Object.hasOwn(SETTLE_DEADLINE_KEYS, raw.phase) || raw.phase !== response.phase) return null
  if (raw.dayIndex !== response.dayIndex) return null
  if (raw.phase === "DAY" && response.dayPhase !== "DAY_VOTE") return null
  const role = raw.phase === "NIGHT" ? raw.role : null
  if (raw.phase === "NIGHT" && (typeof role !== "string" || role !== timer.nightTurnRole)) return null
  if (!Number.isFinite(raw.deadline) || raw.deadline !== timer[SETTLE_DEADLINE_KEYS[raw.phase]]) return null
  return { phase: raw.phase, dayIndex: raw.dayIndex, role, deadline: raw.deadline }
}

// 낮 마감 시각 + 밤 차례 역할·마감 + 재판 마감 (하나라도 틀리면 BAD) + 5초 당김 표시(없으면 null)
export function readTimerFields(response, currentState) {
  const dayPhaseDeadline = readDayPhaseDeadline(response)
  if (dayPhaseDeadline === BAD) return BAD
  const nightTurn = readNightTurnTimer(response, currentState)
  if (nightTurn === BAD) return BAD
  const timer = { dayPhaseDeadline, ...nightTurn, tribunalDeadline: readTribunalDeadline(response, currentState) }
  return { ...timer, phaseSettle: readPhaseSettle(response, timer) }
}
