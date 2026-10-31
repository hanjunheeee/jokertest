export function buildInGameNightTurnAnnouncementScope({ gameId, authUuid, epochKey }) {
  if (typeof gameId !== "string" || gameId.length === 0) return null
  if (typeof authUuid !== "string" || authUuid.length === 0) return null
  if (typeof epochKey !== "string" || epochKey.length === 0) return null
  return `${gameId}|${authUuid}|${epochKey}`
}

export function buildInGameNightTurnAnnouncementIdentity(scope, dayIndex, role) {
  if (typeof scope !== "string" || scope.length === 0) return null
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  if (typeof role !== "string" || role.length === 0) return null
  return `${scope}|${dayIndex}|${role}`
}
