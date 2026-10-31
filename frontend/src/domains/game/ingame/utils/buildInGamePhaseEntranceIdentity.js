const ENTRANCE_PHASES = new Set(["DAY", "NIGHT"])

export function buildInGamePhaseEntranceScope({ gameId, authUuid, epochKey }) {
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof authUuid !== "string" || authUuid.length === 0) return null
  if (typeof epochKey !== "string" || epochKey.length === 0) return null
  return `${gameId}|${authUuid}|${epochKey}`
}

export function buildInGamePhaseEntranceIdentity(scope, phase, dayIndex) {
  if (typeof scope !== "string" || scope.length === 0) return null
  if (!ENTRANCE_PHASES.has(phase)) return null
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  return `${scope}|${phase}|${dayIndex}`
}
