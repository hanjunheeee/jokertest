// 스냅샷의 승패 결과·낮 단계·단계 역행·버전 검사 (순수 계산)
// 필드가 없으면 null, 틀리면 BAD (utils/snapshot/applySnapshot.js가 사용)
import { KNOWN_DAY_PHASES, PHASE_PROGRESS_RANK } from "../../constants/store/sessionSnapshot.js"
import { normalizePublicWinResult } from "../normalizePublicWinResult.js"
import { BAD, isNonNegativeInteger } from "./checks.js"

// 승패 결과: 끝난 판엔 꼭 있어야 하고, 끝나지 않은 판엔 오면 안 됨
export function readWinResult(response) {
  if (response.phase === "ENDED") {
    if (!Object.hasOwn(response, "winResult") || response.winResult === null) return BAD
    const normalized = normalizePublicWinResult(response.winResult)
    if (normalized === null) return BAD
    return normalized
  }
  if (Object.hasOwn(response, "winResult")) return BAD
  return null
}

// 낮 단계: 낮엔 아는 이름으로 꼭 있어야 하고, 낮이 아니면 오면 안 됨
export function readDayPhase(response) {
  if (response.phase === "DAY") {
    if (!Object.hasOwn(response, "dayPhase") || !KNOWN_DAY_PHASES.has(response.dayPhase)) return BAD
    return response.dayPhase
  }
  if (Object.hasOwn(response, "dayPhase")) return BAD
  return null
}

// 판이 뒤로 가는지: 끝난 판이 다시 열리거나, 날짜가 앞서거나, 같은 날 단계 순위가 낮으면
export function goesBackward(currentState, response) {
  if (currentState.phase === "ENDED" && response.phase !== "ENDED") return true
  const currentDayIndex = currentState.dayIndex
  if (!isNonNegativeInteger(currentDayIndex)) return false
  if (response.dayIndex < currentDayIndex) return true
  if (response.dayIndex !== currentDayIndex) return false
  const currentRank = PHASE_PROGRESS_RANK[currentState.phase]
  const responseRank = PHASE_PROGRESS_RANK[response.phase]
  return currentRank !== undefined && responseRank !== undefined && responseRank < currentRank
}

// 버전 하나 읽기: 없으면 0, 지금보다 작거나 지금 값이 있는데 안 오면 BAD
function readVersion(raw, currentValue) {
  const value = isNonNegativeInteger(raw) ? raw : 0
  const current = currentValue ?? 0
  if (value < current) return BAD
  if (!isNonNegativeInteger(raw) && current > 0) return BAD
  return value
}

// 참여 버전·본인 진행 순번 읽기 (하나라도 뒤처지면 BAD)
export function readVersions(response, currentState) {
  const participationRevision = readVersion(response.participationRevision, currentState.participationRevision)
  if (participationRevision === BAD) return BAD
  const selfProgressSeq = readVersion(response.selfProgressSeq, currentState.selfProgressSeq)
  if (selfProgressSeq === BAD) return BAD
  return { participationRevision, selfProgressSeq }
}
