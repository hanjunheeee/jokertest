// 한 번만 띄우는 안내(밤 차례·낮밤 시작)의 범위·식별 키 만들기
// 밤 차례 안내 훅·낮밤 시작 안내 훅이 사용

// 밤 차례 안내 범위 키 (판·계정·연결 세대)
export function buildAnnouncementScope({ gameId, authUuid, epochKey }) {
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof authUuid !== "string" || authUuid.length === 0) return null
  if (typeof epochKey !== "string" || epochKey.length === 0) return null
  return `${gameId}|${authUuid}|${epochKey}`
}

// 범위 안 밤 차례 안내 키 (날짜·직업)
export function buildInGameNightTurnAnnouncementIdentity(scope, dayIndex, role) {
  if (typeof scope !== "string" || scope.length === 0) return null
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  if (typeof role !== "string" || role.length === 0) return null
  return `${scope}|${dayIndex}|${role}`
}

const ENTRANCE_PHASES = new Set(["DAY", "NIGHT"])

// 낮밤 시작 안내 범위 키 (판·계정·연결 세대)
export function buildEntranceScope({ gameId, authUuid, epochKey }) {
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof authUuid !== "string" || authUuid.length === 0) return null
  if (typeof epochKey !== "string" || epochKey.length === 0) return null
  return `${gameId}|${authUuid}|${epochKey}`
}

// 범위 안 낮밤 시작 안내 키 (단계·날짜)
export function buildInGamePhaseEntranceIdentity(scope, phase, dayIndex) {
  if (typeof scope !== "string" || scope.length === 0) return null
  if (!ENTRANCE_PHASES.has(phase)) return null
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  return `${scope}|${phase}|${dayIndex}`
}
